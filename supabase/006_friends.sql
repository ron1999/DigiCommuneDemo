-- DigiCommune Milestone 8: friends, blocking, and visiting rooms.
-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Safe to run again: it never deletes friendships, blocks, or rooms.
-- Requires 004_rooms.sql.

----------------------------------------------------------------------
-- Friendships: one row per pair. pending = request sent, accepted = friends.
----------------------------------------------------------------------
create table if not exists public.friendships (
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
create index if not exists friendships_addressee_idx on public.friendships (addressee);
-- Only one row per pair, whichever way round it was sent
create unique index if not exists friendships_pair_idx
  on public.friendships (least(requester, addressee), greatest(requester, addressee));

-- Blocks: blocker never sees requests from, and is never visited by, blocked
create table if not exists public.blocks (
  blocker uuid not null references auth.users (id) on delete cascade,
  blocked uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);

-- Who may visit a room: only the owner, friends, or everyone
alter table public.rooms add column if not exists visibility text not null default 'friends';
alter table public.rooms drop constraint if exists rooms_visibility_check;
alter table public.rooms add constraint rooms_visibility_check check (visibility in ('private', 'friends', 'public'));

alter table public.friendships enable row level security;
alter table public.blocks enable row level security;

drop policy if exists "Players can view their own friendships" on public.friendships;
create policy "Players can view their own friendships" on public.friendships
  for select to authenticated using (auth.uid() in (requester, addressee));

drop policy if exists "Players can view their own blocks" on public.blocks;
create policy "Players can view their own blocks" on public.blocks
  for select to authenticated using (auth.uid() = blocker);

grant select on public.friendships, public.blocks to authenticated;

----------------------------------------------------------------------
-- Helpers
----------------------------------------------------------------------
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where (blocker = a and blocked = b) or (blocker = b and blocked = a)
  );
$$;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester = a and addressee = b) or (requester = b and addressee = a))
  );
$$;

----------------------------------------------------------------------
-- Friend functions
----------------------------------------------------------------------

-- Send a request by username. If they already asked you, this accepts it.
create or replace function public.send_friend_request(p_username text)
returns text -- 'sent', 'accepted', or 'already_friends'
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  other uuid;
  existing public.friendships%rowtype;
begin
  if uid is null then raise exception 'Not logged in'; end if;

  select id into other from public.profiles where lower(username) = lower(btrim(p_username));
  if other is null then raise exception 'No player called %', btrim(p_username); end if;
  if other = uid then raise exception 'That is you!'; end if;
  -- Don't reveal who blocked whom
  if public.is_blocked_between(uid, other) then raise exception 'You can''t add that player'; end if;

  select * into existing from public.friendships
  where (requester = uid and addressee = other) or (requester = other and addressee = uid);

  if found then
    if existing.status = 'accepted' then return 'already_friends'; end if;
    if existing.requester = other then
      update public.friendships set status = 'accepted'
      where requester = other and addressee = uid;
      return 'accepted';
    end if;
    return 'sent'; -- already asked them
  end if;

  insert into public.friendships (requester, addressee) values (uid, other);
  return 'sent';
end;
$$;

create or replace function public.accept_friend_request(p_from uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not logged in'; end if;
  update public.friendships set status = 'accepted'
  where requester = p_from and addressee = uid and status = 'pending';
  if not found then raise exception 'That request is gone'; end if;
end;
$$;

-- Unfriend, decline a request, or cancel one you sent
create or replace function public.remove_friend(p_other uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not logged in'; end if;
  delete from public.friendships
  where (requester = uid and addressee = p_other) or (requester = p_other and addressee = uid);
end;
$$;

create or replace function public.block_user(p_other uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not logged in'; end if;
  if p_other = uid then raise exception 'You can''t block yourself'; end if;
  delete from public.friendships
  where (requester = uid and addressee = p_other) or (requester = p_other and addressee = uid);
  insert into public.blocks (blocker, blocked) values (uid, p_other) on conflict do nothing;
end;
$$;

create or replace function public.unblock_user(p_other uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not logged in'; end if;
  delete from public.blocks where blocker = auth.uid() and blocked = p_other;
end;
$$;

-- Everyone you're connected to, with their usernames:
-- kind = 'friend', 'incoming' (asked you), 'outgoing' (you asked), or 'blocked' (you blocked them)
create or replace function public.my_friends()
returns table (user_id uuid, username text, kind text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username,
         case when f.status = 'accepted' then 'friend'
              when f.addressee = auth.uid() then 'incoming'
              else 'outgoing' end
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where auth.uid() in (f.requester, f.addressee)
  union all
  select p.id, p.username, 'blocked'
  from public.blocks b join public.profiles p on p.id = b.blocked
  where b.blocker = auth.uid()
  order by 2;
$$;

----------------------------------------------------------------------
-- Visiting rooms
----------------------------------------------------------------------

-- May the logged-in player enter p_owner's room?
create or replace function public.can_visit_room(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then false
    when auth.uid() = p_owner then true
    when public.is_blocked_between(auth.uid(), p_owner) then false
    else coalesce((
      select case r.visibility
               when 'public' then true
               when 'friends' then public.are_friends(auth.uid(), p_owner)
               else false end
      from public.rooms r where r.owner_id = p_owner
    ), public.are_friends(auth.uid(), p_owner)) -- never decorated = default 'friends'
  end;
$$;

-- What someone's room looks like (only if you may visit it)
create or replace function public.get_room(p_owner uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.rooms%rowtype;
  owner_name text;
begin
  if not public.can_visit_room(p_owner) then
    raise exception 'You can''t visit that room';
  end if;
  select username into owner_name from public.profiles where id = p_owner;
  select * into r from public.rooms where owner_id = p_owner;
  if not found then
    -- Never decorated: the client shows the starter room
    return json_build_object('owner', owner_name, 'template', null, 'slots', null, 'visibility', 'friends');
  end if;
  return json_build_object('owner', owner_name, 'template', r.template, 'slots', r.slots, 'visibility', r.visibility);
end;
$$;

create or replace function public.set_room_visibility(p_visibility text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not logged in'; end if;
  if p_visibility not in ('private', 'friends', 'public') then raise exception 'Invalid choice'; end if;
  insert into public.rooms (owner_id, visibility) values (uid, p_visibility)
  on conflict (owner_id) do update set visibility = excluded.visibility;
end;
$$;

-- A brand-new rooms row (from set_room_visibility) should start with the starter furniture,
-- like a room that was never saved. Keep this in sync with DEFAULT_ROOM in client/src/world/rooms.ts.
alter table public.rooms alter column slots
  set default '{"bed":"furniture_0","table":"furniture_2","seat1":"furniture_4","plant1":"furniture_8"}'::jsonb;

revoke all on function public.send_friend_request(text) from public, anon;
revoke all on function public.accept_friend_request(uuid) from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
revoke all on function public.block_user(uuid) from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;
revoke all on function public.my_friends() from public, anon;
revoke all on function public.can_visit_room(uuid) from public, anon;
revoke all on function public.get_room(uuid) from public, anon;
revoke all on function public.set_room_visibility(text) from public, anon;
revoke all on function public.is_blocked_between(uuid, uuid) from public, anon, authenticated;
revoke all on function public.are_friends(uuid, uuid) from public, anon, authenticated;

grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.my_friends() to authenticated;
grant execute on function public.can_visit_room(uuid) to authenticated;
grant execute on function public.get_room(uuid) to authenticated;
grant execute on function public.set_room_visibility(text) to authenticated;
