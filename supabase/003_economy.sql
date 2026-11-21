-- DigiCommune Milestone 5: wallet, daily rewards, shop, and owned items.
-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Safe to run again: it updates prices and never wipes balances or purchases.

----------------------------------------------------------------------
-- Tables
----------------------------------------------------------------------
create table if not exists public.items (
  id text primary key,
  category text not null check (category in ('skin','hairStyle','hairColor','outfitStyle','outfitColor','accessory')),
  option_index int not null,
  name text not null,
  price int not null default 0 check (price >= 0), -- 0 = free for everyone
  unique (category, option_index)
);

create table if not exists public.inventory (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null references public.items (id),
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table if not exists public.wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance int not null default 0 check (balance >= 0)
);

-- Every coin earned or spent is recorded here (positive = earned, negative = spent)
create table if not exists public.ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount int not null,
  reason text not null,
  ref text,
  created_at timestamptz not null default now()
);
create index if not exists ledger_user_idx on public.ledger (user_id, created_at desc);

create table if not exists public.daily_claims (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_claim_date date not null,
  streak int not null default 1
);

----------------------------------------------------------------------
-- Security: players can READ their own rows. Nobody can write directly;
-- all changes go through the functions further down.
----------------------------------------------------------------------
alter table public.items enable row level security;
alter table public.inventory enable row level security;
alter table public.wallets enable row level security;
alter table public.ledger enable row level security;
alter table public.daily_claims enable row level security;

drop policy if exists "Items are viewable by signed-in users" on public.items;
create policy "Items are viewable by signed-in users" on public.items
  for select to authenticated using (true);

drop policy if exists "Players can view their own inventory" on public.inventory;
create policy "Players can view their own inventory" on public.inventory
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Players can view their own wallet" on public.wallets;
create policy "Players can view their own wallet" on public.wallets
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Players can view their own ledger" on public.ledger;
create policy "Players can view their own ledger" on public.ledger
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Players can view their own daily claim" on public.daily_claims;
create policy "Players can view their own daily claim" on public.daily_claims
  for select to authenticated using (auth.uid() = user_id);

grant select on public.items, public.inventory, public.wallets, public.ledger, public.daily_claims to authenticated;

-- Avatars can now only be saved through save_avatar() below (it checks ownership)
revoke update on public.profiles from authenticated;

----------------------------------------------------------------------
-- Shop catalog (re-running this file updates names and prices)
----------------------------------------------------------------------
insert into public.items (id, category, option_index, name, price) values
  ('skin_0','skin',0,'Light',0),
  ('skin_1','skin',1,'Fair',0),
  ('skin_2','skin',2,'Tan',0),
  ('skin_3','skin',3,'Brown',0),
  ('skin_4','skin',4,'Deep',0),

  ('hairStyle_0','hairStyle',0,'Short',0),
  ('hairStyle_1','hairStyle',1,'Long',50),
  ('hairStyle_2','hairStyle',2,'Spiky',50),
  ('hairStyle_3','hairStyle',3,'Bald',0),

  ('hairColor_0','hairColor',0,'Black',0),
  ('hairColor_1','hairColor',1,'Brown',0),
  ('hairColor_2','hairColor',2,'Ginger',20),
  ('hairColor_3','hairColor',3,'Blonde',20),
  ('hairColor_4','hairColor',4,'Red',30),
  ('hairColor_5','hairColor',5,'Purple',40),
  ('hairColor_6','hairColor',6,'Blue',40),
  ('hairColor_7','hairColor',7,'White',40),

  ('outfitStyle_0','outfitStyle',0,'T-shirt',0),
  ('outfitStyle_1','outfitStyle',1,'Hoodie',80),
  ('outfitStyle_2','outfitStyle',2,'Overalls',80),

  ('outfitColor_0','outfitColor',0,'Blue',0),
  ('outfitColor_1','outfitColor',1,'Red',0),
  ('outfitColor_2','outfitColor',2,'Green',15),
  ('outfitColor_3','outfitColor',3,'Yellow',15),
  ('outfitColor_4','outfitColor',4,'Purple',25),
  ('outfitColor_5','outfitColor',5,'Orange',25),
  ('outfitColor_6','outfitColor',6,'Teal',25),
  ('outfitColor_7','outfitColor',7,'Pink',25),

  ('accessory_0','accessory',0,'None',0),
  ('accessory_1','accessory',1,'Glasses',60),
  ('accessory_2','accessory',2,'Cap',75),
  ('accessory_3','accessory',3,'Headband',40)
on conflict (id) do update
  set category = excluded.category,
      option_index = excluded.option_index,
      name = excluded.name,
      price = excluded.price;

----------------------------------------------------------------------
-- New accounts get a profile AND a wallet with a 100 coin welcome bonus
----------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data ->> 'username');

  insert into public.wallets (user_id, balance) values (new.id, 100);
  insert into public.ledger (user_id, amount, reason) values (new.id, 100, 'welcome_bonus');
  return new;
end;
$$;

----------------------------------------------------------------------
-- Existing accounts: give them a wallet, and keep whatever look they already chose
----------------------------------------------------------------------
insert into public.wallets (user_id, balance)
select p.id, 100 from public.profiles p
where not exists (select 1 from public.wallets w where w.user_id = p.id);

insert into public.ledger (user_id, amount, reason)
select p.id, 100, 'welcome_bonus' from public.profiles p
where not exists (select 1 from public.ledger l where l.user_id = p.id and l.reason = 'welcome_bonus');

insert into public.inventory (user_id, item_id)
select p.id, i.id
from public.profiles p
join public.items i
  on i.price > 0
 and jsonb_typeof(p.avatar -> i.category) = 'number'
 and (p.avatar ->> i.category)::numeric = i.option_index
on conflict do nothing;

----------------------------------------------------------------------
-- Functions: the ONLY way to earn, spend, or change your look
----------------------------------------------------------------------

-- Daily reward: once per day (the day changes at midnight Eastern time).
-- 50 coins, plus 10 more for each consecutive day, up to 100 per day.
create or replace function public.claim_daily_reward()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'America/New_York')::date;
  rec public.daily_claims%rowtype;
  new_streak int;
  reward int;
  new_balance int;
begin
  if uid is null then raise exception 'Not logged in'; end if;

  -- Lock the wallet so two quick clicks cannot both pay out
  perform 1 from public.wallets where user_id = uid for update;
  if not found then raise exception 'No wallet found for this account'; end if;

  select * into rec from public.daily_claims where user_id = uid;

  if found and rec.last_claim_date = today then
    select balance into new_balance from public.wallets where user_id = uid;
    return json_build_object('claimed', false, 'amount', 0, 'streak', rec.streak, 'balance', new_balance);
  end if;

  if found and rec.last_claim_date = today - 1 then
    new_streak := rec.streak + 1;
  else
    new_streak := 1;
  end if;
  reward := 50 + least(new_streak - 1, 5) * 10;

  insert into public.daily_claims (user_id, last_claim_date, streak)
  values (uid, today, new_streak)
  on conflict (user_id) do update
    set last_claim_date = excluded.last_claim_date, streak = excluded.streak;

  update public.wallets set balance = balance + reward where user_id = uid
  returning balance into new_balance;

  insert into public.ledger (user_id, amount, reason, ref)
  values (uid, reward, 'daily_reward', 'streak ' || new_streak);

  return json_build_object('claimed', true, 'amount', reward, 'streak', new_streak, 'balance', new_balance);
end;
$$;

-- Buy one shop item with coins
create or replace function public.buy_item(p_item_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  item public.items%rowtype;
  bal int;
begin
  if uid is null then raise exception 'Not logged in'; end if;

  select * into item from public.items where id = p_item_id;
  if not found then raise exception 'That item does not exist'; end if;
  if item.price <= 0 then raise exception 'That item is free'; end if;

  perform 1 from public.wallets where user_id = uid for update;
  if not found then raise exception 'No wallet found for this account'; end if;

  if exists (select 1 from public.inventory where user_id = uid and item_id = item.id) then
    raise exception 'You already own that';
  end if;

  select balance into bal from public.wallets where user_id = uid;
  if bal < item.price then raise exception 'Not enough coins'; end if;

  update public.wallets set balance = balance - item.price where user_id = uid
  returning balance into bal;
  insert into public.inventory (user_id, item_id) values (uid, item.id);
  insert into public.ledger (user_id, amount, reason, ref)
  values (uid, -item.price, 'shop_purchase', item.id);

  return json_build_object('ok', true, 'balance', bal);
end;
$$;

-- Save a look, but only if every part of it is free or owned
create or replace function public.save_avatar(p_avatar jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cat text;
  idx int;
  item_row public.items%rowtype;
  clean jsonb := '{}'::jsonb;
begin
  if uid is null then raise exception 'Not logged in'; end if;

  foreach cat in array array['skin','hairStyle','hairColor','outfitStyle','outfitColor','accessory'] loop
    if coalesce(jsonb_typeof(p_avatar -> cat), '') <> 'number' then
      raise exception 'Invalid look: % is missing', cat;
    end if;
    idx := (p_avatar ->> cat)::int;

    select * into item_row from public.items where category = cat and option_index = idx;
    if not found then raise exception 'Invalid look option for %', cat; end if;

    if item_row.price > 0
       and not exists (select 1 from public.inventory where user_id = uid and item_id = item_row.id) then
      raise exception 'You do not own % (%) yet', item_row.name, cat;
    end if;

    clean := clean || jsonb_build_object(cat, idx);
  end loop;

  update public.profiles set avatar = clean where id = uid;
  return clean;
end;
$$;

revoke all on function public.claim_daily_reward() from public, anon;
revoke all on function public.buy_item(text) from public, anon;
revoke all on function public.save_avatar(jsonb) from public, anon;
grant execute on function public.claim_daily_reward() to authenticated;
grant execute on function public.buy_item(text) to authenticated;
grant execute on function public.save_avatar(jsonb) to authenticated;
