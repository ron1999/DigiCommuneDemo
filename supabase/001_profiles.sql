-- DigiCommune: player profiles
-- Run this once in Supabase: SQL Editor > New query > paste > Run.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  avatar jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[A-Za-z0-9_]{3,16}$')
);

-- Usernames must be unique, ignoring upper/lower case
create unique index profiles_username_lower_idx on public.profiles (lower(username));

-- Row Level Security: the database itself enforces who can see and change what
alter table public.profiles enable row level security;

create policy "Signed-in users can view profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- There is no insert policy on purpose: profiles are created only by the trigger below.

-- Players may only change their avatar, never their username
revoke update on public.profiles from authenticated;
grant update (avatar) on public.profiles to authenticated;

-- Automatically create a profile whenever someone signs up
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data ->> 'username');
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
