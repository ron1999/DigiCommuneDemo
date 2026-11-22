-- DigiCommune Milestone 7: pets (a free starter pet that follows you, and a collection).
-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Safe to run again: it never deletes anyone's pets.

----------------------------------------------------------------------
-- Pets. species numbers must match SPECIES in client/src/pets/species.ts
-- (0-2 are the starters; 3-5 can be found later by exploring).
----------------------------------------------------------------------
create table if not exists public.pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  species int not null check (species between 0 and 5),
  name text not null check (name ~ '^[A-Za-z0-9 _''-]{1,16}$'),
  active boolean not null default false, -- the one following you around
  created_at timestamptz not null default now()
);

create index if not exists pets_owner_idx on public.pets (owner_id);
-- At most one pet follows you at a time
create unique index if not exists pets_one_active_idx on public.pets (owner_id) where active;

alter table public.pets enable row level security;

-- Players (and the game server, which uses the player's own login) can see their own pets
drop policy if exists "Players can view their own pets" on public.pets;
create policy "Players can view their own pets" on public.pets
  for select to authenticated using (auth.uid() = owner_id);

grant select on public.pets to authenticated;

----------------------------------------------------------------------
-- Functions: the only way to get, rename, or switch pets
----------------------------------------------------------------------

-- Cleans up a pet name, or fails with a friendly message
create or replace function public.clean_pet_name(p_name text)
returns text
language plpgsql
immutable
as $$
declare
  n text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if n !~ '^[A-Za-z0-9 _''-]{1,16}$' then
    raise exception 'Pet names are 1-16 letters, numbers, spaces, - _ or ''';
  end if;
  return n;
end;
$$;

-- Your free starter: only if you have no pets yet
create or replace function public.adopt_starter(p_species int, p_name text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  pet public.pets%rowtype;
begin
  if uid is null then raise exception 'Not logged in'; end if;
  if p_species not between 0 and 2 then raise exception 'That is not a starter pet'; end if;

  -- Stop two quick clicks from adopting two starters
  perform pg_advisory_xact_lock(hashtext('adopt_starter:' || uid::text));
  if exists (select 1 from public.pets where owner_id = uid) then
    raise exception 'You already have a starter pet';
  end if;

  insert into public.pets (owner_id, species, name, active)
  values (uid, p_species, public.clean_pet_name(p_name), true)
  returning * into pet;

  return json_build_object('id', pet.id, 'species', pet.species, 'name', pet.name, 'active', pet.active);
end;
$$;

-- Choose which of your pets follows you (null = none)
create or replace function public.set_active_pet(p_pet uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not logged in'; end if;
  if p_pet is not null and not exists (select 1 from public.pets where id = p_pet and owner_id = uid) then
    raise exception 'That is not your pet';
  end if;

  update public.pets set active = false where owner_id = uid and active;
  if p_pet is not null then
    update public.pets set active = true where id = p_pet;
  end if;
end;
$$;

create or replace function public.rename_pet(p_pet uuid, p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n text := public.clean_pet_name(p_name);
begin
  if uid is null then raise exception 'Not logged in'; end if;
  update public.pets set name = n where id = p_pet and owner_id = uid;
  if not found then raise exception 'That is not your pet'; end if;
  return n;
end;
$$;

revoke all on function public.adopt_starter(int, text) from public, anon;
revoke all on function public.set_active_pet(uuid) from public, anon;
revoke all on function public.rename_pet(uuid, text) from public, anon;
grant execute on function public.adopt_starter(int, text) to authenticated;
grant execute on function public.set_active_pet(uuid) to authenticated;
grant execute on function public.rename_pet(uuid, text) to authenticated;
