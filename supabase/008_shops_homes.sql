-- DigiCommune Milestone 9: homeowners and shop owners.
--  - Town buildings and empty lots ("properties") can be claimed as a house or a shop.
--    Your first house and your first shop are free; after that each one costs coins.
--    Claiming a lot builds a house/shop on it.
--  - Houses and shops have their own furniture (same templates and slots as rooms) and
--    their own entry rules: visibility (private/friends/public) + a guest list + a ban list,
--    on top of the blocks from 006_friends.sql.
--  - Shops sell stock of catalog items: the owner buys stock at a wholesale price,
--    sets their own price, the buyer gets the item, the owner gets the coins.
--  - Shops can show a few https links (store, socials, Bandcamp...). Visitors can report them.
--
-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Safe to run again: it never deletes owners, stock, links, or coins.
-- Requires 003, 004 and 006.

----------------------------------------------------------------------
-- Tables
----------------------------------------------------------------------

-- The claimable places in town. ids, kinds and positions must match PROPERTIES in
-- client/src/world/properties.ts.
create table if not exists public.properties (
  id int primary key,
  kind text not null check (kind in ('building', 'lot')),
  label text not null, -- what the sign says while nobody owns it
  price int not null check (price >= 0), -- coins, after your first free house/shop
  owner_id uuid references auth.users (id) on delete set null,
  use text check (use in ('home', 'shop')),
  name text, -- the owner's name for it
  template int not null default 0 references public.room_templates (id),
  slots jsonb not null default '{}'::jsonb,
  visibility text not null default 'friends' check (visibility in ('private', 'friends', 'public')),
  claimed_at timestamptz
);
create index if not exists properties_owner_idx on public.properties (owner_id);

insert into public.properties (id, kind, label, price) values
  (0, 'building', 'Maple House', 250),
  (1, 'building', 'Birch House', 250),
  (2, 'building', 'Willow House', 250),
  (3, 'building', 'Cedar House', 250),
  (4, 'lot', 'Sunny Lot', 200),
  (5, 'lot', 'Pond Lot', 200),
  (6, 'lot', 'East Lot', 200),
  (7, 'lot', 'West Lot', 200)
on conflict (id) do update
  set kind = excluded.kind, label = excluded.label, price = excluded.price;

-- Per-person entry rules: 'allow' = always welcome (guest list), 'ban' = never
create table if not exists public.property_access (
  property_id int not null references public.properties (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('allow', 'ban')),
  created_at timestamptz not null default now(),
  primary key (property_id, user_id)
);

-- What a shop has for sale. paid_each = the wholesale price paid (refunded if taken off sale)
create table if not exists public.shop_stock (
  property_id int not null references public.properties (id) on delete cascade,
  item_id text not null references public.items (id),
  quantity int not null check (quantity >= 0),
  price int not null check (price > 0),
  paid_each int not null check (paid_each >= 0),
  primary key (property_id, item_id)
);

-- Off-site links. https only; hidden after enough reports.
create table if not exists public.shop_links (
  id bigint generated always as identity primary key,
  property_id int not null references public.properties (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 40),
  url text not null check (
    char_length(url) <= 300
    and url ~* '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?([/?#][^[:space:]<>"]*)?$'
  ),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists shop_links_property_idx on public.shop_links (property_id);

create table if not exists public.link_reports (
  link_id bigint not null references public.shop_links (id) on delete cascade,
  reporter uuid not null references auth.users (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (link_id, reporter)
);

----------------------------------------------------------------------
-- Security: everyone signed in can see who owns what (the town signs).
-- Everything else is read and changed only through the functions below.
----------------------------------------------------------------------
alter table public.properties enable row level security;
alter table public.property_access enable row level security;
alter table public.shop_stock enable row level security;
alter table public.shop_links enable row level security;
alter table public.link_reports enable row level security;

drop policy if exists "Properties are viewable by signed-in users" on public.properties;
create policy "Properties are viewable by signed-in users" on public.properties
  for select to authenticated using (true);

grant select on public.properties to authenticated;

----------------------------------------------------------------------
-- Helpers (not callable by players)
----------------------------------------------------------------------

-- Wholesale price a shop owner pays for one unit of stock: 60% of the catalog price.
-- Keep in sync with wholesalePrice() in client/src/properties.ts
create or replace function public.wholesale_price(p_price int)
returns int
language sql
immutable
as $$
  select greatest(1, ceil(p_price * 0.6)::int);
$$;

-- What a new house or shop starts with (keep in sync with starterLayout() in client/src/properties.ts)
create or replace function public.starter_slots(p_use text)
returns jsonb
language sql
immutable
as $$
  select case when p_use = 'shop'
    then '{"table":"furniture_2","seat1":"furniture_4","plant1":"furniture_8"}'::jsonb
    else '{"bed":"furniture_0","table":"furniture_2","seat1":"furniture_4","plant1":"furniture_8"}'::jsonb
  end;
$$;

-- Checks a room layout the same way save_room() does and returns the cleaned slots:
-- template and furniture must be free or owned by uid, and furniture must fit its slot.
create or replace function public.clean_room_layout(uid uuid, p_template int, p_slots jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tmpl public.room_templates%rowtype;
  tmpl_item public.items%rowtype;
  item_row public.items%rowtype;
  slot_name text;
  slot_value jsonb;
  clean jsonb := '{}'::jsonb;
begin
  select * into tmpl from public.room_templates where id = p_template;
  if not found then raise exception 'That room template does not exist'; end if;

  select * into tmpl_item from public.items where category = 'roomTemplate' and option_index = p_template;
  if found and tmpl_item.price > 0
     and not exists (select 1 from public.inventory where user_id = uid and item_id = tmpl_item.id) then
    raise exception 'You do not own the % room yet', tmpl.name;
  end if;

  if p_slots is not null and jsonb_typeof(p_slots) <> 'object' then
    raise exception 'Invalid room layout';
  end if;

  for slot_name, slot_value in select * from jsonb_each(coalesce(p_slots, '{}'::jsonb)) loop
    if not (tmpl.slots ? slot_name) then continue; end if;
    if jsonb_typeof(slot_value) = 'null' then continue; end if;
    if jsonb_typeof(slot_value) <> 'string' then raise exception 'Invalid furniture in %', slot_name; end if;

    select * into item_row from public.items where id = slot_value #>> '{}' and category = 'furniture';
    if not found then raise exception 'Unknown furniture in %', slot_name; end if;
    if item_row.slot_type is distinct from tmpl.slots ->> slot_name then
      raise exception '% does not fit there', item_row.name;
    end if;
    if item_row.price > 0
       and not exists (select 1 from public.inventory where user_id = uid and item_id = item_row.id) then
      raise exception 'You do not own % yet', item_row.name;
    end if;

    clean := clean || jsonb_build_object(slot_name, item_row.id);
  end loop;
  return clean;
end;
$$;

-- Removes stock, links and entry rules (when a place changes hands). No refunds here.
create or replace function public.clear_property(p_property int)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.shop_stock where property_id = p_property;
  delete from public.shop_links where property_id = p_property;
  delete from public.property_access where property_id = p_property;
$$;

-- Raises an error unless the logged-in player owns this place. Returns the row.
create or replace function public.my_property(p_property int)
returns public.properties
language plpgsql
security definer
set search_path = public
as $$
declare
  prop public.properties%rowtype;
begin
  if auth.uid() is null then raise exception 'Not logged in'; end if;
  select * into prop from public.properties where id = p_property for update;
  if not found or prop.owner_id is distinct from auth.uid() then
    raise exception 'That place is not yours';
  end if;
  return prop;
end;
$$;

-- Clean up a name typed by a player
create or replace function public.clean_text(p_text text, p_max int)
returns text
language sql
immutable
as $$
  select left(btrim(regexp_replace(coalesce(p_text, ''), '[[:cntrl:]]', '', 'g')), p_max);
$$;

----------------------------------------------------------------------
-- Looking around town
----------------------------------------------------------------------

-- Every place in town, who owns it and what it is (for the signs)
create or replace function public.town_properties()
returns table (id int, kind text, label text, price int, owner_id uuid, owner_name text, use text, name text, visibility text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.kind, p.label, p.price, p.owner_id, pr.username,
         case when p.owner_id is null then null else p.use end,
         case when p.owner_id is null then null else p.name end,
         p.visibility
  from public.properties p
  left join public.profiles pr on pr.id = p.owner_id
  order by p.id;
$$;

-- May the logged-in player go inside? Owner: always. Banned or blocked: never.
-- Guest list: always. Otherwise it depends on visibility (Only guests / Friends / Everyone).
create or replace function public.can_enter_property(p_property int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when auth.uid() is null or p.owner_id is null then false
      when auth.uid() = p.owner_id then true
      when exists (select 1 from public.property_access a
                   where a.property_id = p.id and a.user_id = auth.uid() and a.kind = 'ban') then false
      when public.is_blocked_between(auth.uid(), p.owner_id) then false
      when exists (select 1 from public.property_access a
                   where a.property_id = p.id and a.user_id = auth.uid() and a.kind = 'allow') then true
      when p.visibility = 'public' then true
      when p.visibility = 'friends' then public.are_friends(auth.uid(), p.owner_id)
      else false
    end
    from public.properties p where p.id = p_property
  ), false);
$$;

-- What a house or shop looks like inside (only if you may go in). The game server
-- also calls this with the player's login to decide whether to let them in.
create or replace function public.get_property(p_property int)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  prop public.properties%rowtype;
  owner_name text;
begin
  select * into prop from public.properties where id = p_property;
  if not found or prop.owner_id is null then raise exception 'Nobody lives there yet'; end if;
  if not public.can_enter_property(p_property) then
    raise exception 'You can''t go in there';
  end if;
  select username into owner_name from public.profiles where id = prop.owner_id;
  return json_build_object(
    'id', prop.id, 'owner_id', prop.owner_id, 'owner', owner_name, 'use', prop.use,
    'name', prop.name, 'template', prop.template, 'slots', prop.slots, 'visibility', prop.visibility
  );
end;
$$;

----------------------------------------------------------------------
-- Claiming, naming, decorating, giving up
----------------------------------------------------------------------

-- Max houses and max shops per player (keep in sync with MAX_PER_USE in client/src/properties.ts)
create or replace function public.claim_property(p_property int, p_use text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prop public.properties%rowtype;
  owned int;
  cost int;
  bal int;
  uname text;
begin
  if uid is null then raise exception 'Not logged in'; end if;
  if p_use is null or p_use not in ('home', 'shop') then raise exception 'Choose a house or a shop'; end if;

  select * into prop from public.properties where id = p_property for update;
  if not found then raise exception 'That place does not exist'; end if;
  if prop.owner_id is not null then raise exception 'Someone already owns that'; end if;

  select count(*) into owned from public.properties where owner_id = uid and use = p_use;
  if owned >= 2 then
    raise exception 'You can own at most 2 %', case p_use when 'home' then 'houses' else 'shops' end;
  end if;

  -- Your first house and your first shop are free
  cost := case when owned = 0 then 0 else prop.price end;

  perform 1 from public.wallets where user_id = uid for update;
  if not found then raise exception 'No wallet found for this account'; end if;
  select balance into bal from public.wallets where user_id = uid;
  if bal < cost then raise exception 'Not enough coins (it costs %)', cost; end if;

  if cost > 0 then
    update public.wallets set balance = balance - cost where user_id = uid returning balance into bal;
    insert into public.ledger (user_id, amount, reason, ref)
    values (uid, -cost, 'property_claim', 'property_' || prop.id);
  end if;

  perform public.clear_property(prop.id); -- leftovers from a deleted account
  select username into uname from public.profiles where id = uid;
  update public.properties
  set owner_id = uid,
      use = p_use,
      name = left(coalesce(uname, 'Someone') || '''s ' || case p_use when 'home' then 'House' else 'Shop' end, 32),
      template = 0,
      slots = public.starter_slots(p_use),
      visibility = case p_use when 'shop' then 'public' else 'friends' end,
      claimed_at = now()
  where id = prop.id;

  return json_build_object('ok', true, 'cost', cost, 'balance', bal);
end;
$$;

-- Give a place back to the town. Unsold stock is refunded at the wholesale price paid.
-- Lots go back to being empty. The claim price is not refunded.
create or replace function public.release_property(p_property int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prop public.properties%rowtype;
  refund int;
begin
  prop := public.my_property(p_property);

  select coalesce(sum(quantity * paid_each), 0) into refund from public.shop_stock where property_id = prop.id;
  if refund > 0 then
    perform 1 from public.wallets where user_id = uid for update;
    update public.wallets set balance = balance + refund where user_id = uid;
    insert into public.ledger (user_id, amount, reason, ref)
    values (uid, refund, 'shop_unstock', 'property_' || prop.id);
  end if;

  perform public.clear_property(prop.id);
  update public.properties
  set owner_id = null, use = null, name = null, template = 0, slots = '{}'::jsonb,
      visibility = 'friends', claimed_at = null
  where id = prop.id;

  return json_build_object('ok', true, 'refund', refund);
end;
$$;

create or replace function public.rename_property(p_property int, p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  clean text := public.clean_text(p_name, 32);
begin
  perform public.my_property(p_property);
  if char_length(clean) < 1 then raise exception 'Type a name'; end if;
  update public.properties set name = clean where id = p_property;
  return clean;
end;
$$;

create or replace function public.save_property_room(p_property int, p_template int, p_slots jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean jsonb;
begin
  perform public.my_property(p_property);
  clean := public.clean_room_layout(auth.uid(), p_template, p_slots);
  update public.properties set template = p_template, slots = clean where id = p_property;
  return jsonb_build_object('template', p_template, 'slots', clean);
end;
$$;

----------------------------------------------------------------------
-- Who can come in
----------------------------------------------------------------------

create or replace function public.set_property_visibility(p_property int, p_visibility text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.my_property(p_property);
  if p_visibility is null or p_visibility not in ('private', 'friends', 'public') then
    raise exception 'Invalid choice';
  end if;
  update public.properties set visibility = p_visibility where id = p_property;
end;
$$;

-- The guest list and ban list (owner only)
create or replace function public.property_people(p_property int)
returns table (user_id uuid, username text, kind text)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.my_property(p_property);
  return query
    select a.user_id, p.username, a.kind
    from public.property_access a join public.profiles p on p.id = a.user_id
    where a.property_id = p_property
    order by a.kind, p.username;
end;
$$;

-- p_kind: 'allow' (guest list), 'ban', or 'none' (take them off either list)
create or replace function public.set_property_access(p_property int, p_username text, p_kind text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  other uuid;
  other_name text;
begin
  perform public.my_property(p_property);
  if p_kind is null or p_kind not in ('allow', 'ban', 'none') then raise exception 'Invalid choice'; end if;

  select id, username into other, other_name from public.profiles where lower(username) = lower(btrim(p_username));
  if other is null then raise exception 'No player called %', btrim(p_username); end if;
  if other = auth.uid() then raise exception 'That is you!'; end if;

  if p_kind = 'none' then
    delete from public.property_access where property_id = p_property and user_id = other;
  else
    insert into public.property_access (property_id, user_id, kind) values (p_property, other, p_kind)
    on conflict (property_id, user_id) do update set kind = excluded.kind, created_at = now();
  end if;
  return other_name;
end;
$$;

----------------------------------------------------------------------
-- Shops: stock, prices, buying
----------------------------------------------------------------------

-- What's for sale and the shop's links. The owner also sees sold-out and hidden things.
create or replace function public.get_shop(p_property int)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  prop public.properties%rowtype;
  mine boolean;
begin
  if not public.can_enter_property(p_property) then raise exception 'You can''t go in there'; end if;
  select * into prop from public.properties where id = p_property;
  if prop.use is distinct from 'shop' then raise exception 'That is not a shop'; end if;
  mine := prop.owner_id = auth.uid();

  return json_build_object(
    'mine', mine,
    'stock', coalesce((
      select json_agg(json_build_object(
               'item_id', s.item_id, 'name', i.name, 'category', i.category,
               'price', s.price, 'quantity', s.quantity, 'catalog_price', i.price
             ) order by i.category, i.option_index)
      from public.shop_stock s join public.items i on i.id = s.item_id
      where s.property_id = p_property and (mine or s.quantity > 0)
    ), '[]'::json),
    'links', coalesce((
      select json_agg(json_build_object('id', l.id, 'label', l.label, 'url', l.url, 'hidden', l.hidden) order by l.id)
      from public.shop_links l
      where l.property_id = p_property and (mine or not l.hidden)
    ), '[]'::json)
  );
end;
$$;

-- Buy p_quantity units of a catalog item at the wholesale price, to sell at p_price each.
-- Selling price: 1 coin up to twice the catalog price. Max 12 different items, 99 of each.
create or replace function public.stock_shop_item(p_property int, p_item text, p_quantity int, p_price int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prop public.properties%rowtype;
  item public.items%rowtype;
  each_cost int;
  cost int;
  have int;
  bal int;
begin
  prop := public.my_property(p_property);
  if prop.use is distinct from 'shop' then raise exception 'That is not a shop'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 20 then raise exception 'Stock 1 to 20 at a time'; end if;

  select * into item from public.items where id = p_item;
  if not found then raise exception 'That item does not exist'; end if;
  if item.price <= 0 then raise exception 'Free items can''t be sold'; end if;
  if p_price is null or p_price < 1 or p_price > item.price * 2 then
    raise exception 'Price must be 1 to % coins', item.price * 2;
  end if;

  select quantity into have from public.shop_stock where property_id = p_property and item_id = item.id;
  if not found then
    if (select count(*) from public.shop_stock where property_id = p_property) >= 12 then
      raise exception 'A shop can sell up to 12 different items';
    end if;
    have := 0;
  end if;
  if have + p_quantity > 99 then raise exception 'Up to 99 of each item'; end if;

  each_cost := public.wholesale_price(item.price);
  cost := each_cost * p_quantity;

  perform 1 from public.wallets where user_id = uid for update;
  if not found then raise exception 'No wallet found for this account'; end if;
  select balance into bal from public.wallets where user_id = uid;
  if bal < cost then raise exception 'Not enough coins (it costs %)', cost; end if;

  update public.wallets set balance = balance - cost where user_id = uid returning balance into bal;
  insert into public.ledger (user_id, amount, reason, ref) values (uid, -cost, 'shop_stock', item.id);

  insert into public.shop_stock (property_id, item_id, quantity, price, paid_each)
  values (p_property, item.id, p_quantity, p_price, each_cost)
  on conflict (property_id, item_id) do update
    set quantity = public.shop_stock.quantity + excluded.quantity,
        price = excluded.price,
        paid_each = least(public.shop_stock.paid_each, excluded.paid_each);

  return json_build_object('ok', true, 'cost', cost, 'balance', bal);
end;
$$;

create or replace function public.set_shop_price(p_property int, p_item text, p_price int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  catalog int;
begin
  perform public.my_property(p_property);
  select price into catalog from public.items where id = p_item;
  if catalog is null then raise exception 'That item does not exist'; end if;
  if p_price is null or p_price < 1 or p_price > catalog * 2 then
    raise exception 'Price must be 1 to % coins', catalog * 2;
  end if;
  update public.shop_stock set price = p_price where property_id = p_property and item_id = p_item;
  if not found then raise exception 'That item is not in your shop'; end if;
end;
$$;

-- Take an item off sale: unsold units are refunded at the wholesale price paid
create or replace function public.unstock_shop_item(p_property int, p_item text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  refund int;
begin
  perform public.my_property(p_property);
  delete from public.shop_stock where property_id = p_property and item_id = p_item
  returning quantity * paid_each into refund;
  if not found then raise exception 'That item is not in your shop'; end if;
  if refund > 0 then
    perform 1 from public.wallets where user_id = uid for update;
    update public.wallets set balance = balance + refund where user_id = uid;
    insert into public.ledger (user_id, amount, reason, ref) values (uid, refund, 'shop_unstock', p_item);
  end if;
  return json_build_object('ok', true, 'refund', refund);
end;
$$;

-- Buy one item from a player's shop. p_price is the price the buyer saw, so a sneaky
-- price change in between can't charge them more.
create or replace function public.buy_from_shop(p_property int, p_item text, p_price int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prop public.properties%rowtype;
  st public.shop_stock%rowtype;
  bal int;
begin
  if uid is null then raise exception 'Not logged in'; end if;
  if not public.can_enter_property(p_property) then raise exception 'You can''t shop here'; end if;
  select * into prop from public.properties where id = p_property;
  if prop.use is distinct from 'shop' then raise exception 'That is not a shop'; end if;
  if prop.owner_id = uid then raise exception 'That is your own shop'; end if;

  select * into st from public.shop_stock where property_id = p_property and item_id = p_item for update;
  if not found or st.quantity < 1 then raise exception 'Sold out'; end if;
  if st.price is distinct from p_price then raise exception 'The price just changed. Take another look.'; end if;
  if exists (select 1 from public.inventory where user_id = uid and item_id = p_item) then
    raise exception 'You already own that';
  end if;

  -- Lock both wallets in a fixed order so two shoppers can never get stuck waiting on each other
  perform 1 from public.wallets where user_id in (uid, prop.owner_id) order by user_id for update;
  select balance into bal from public.wallets where user_id = uid;
  if bal is null then raise exception 'No wallet found for this account'; end if;
  if bal < st.price then raise exception 'Not enough coins'; end if;

  update public.wallets set balance = balance - st.price where user_id = uid returning balance into bal;
  update public.wallets set balance = balance + st.price where user_id = prop.owner_id;
  insert into public.inventory (user_id, item_id) values (uid, p_item);
  update public.shop_stock set quantity = quantity - 1 where property_id = p_property and item_id = p_item;
  insert into public.ledger (user_id, amount, reason, ref) values
    (uid, -st.price, 'shop_buy', p_item || '@property_' || p_property),
    (prop.owner_id, st.price, 'shop_sale', p_item || '@property_' || p_property);

  return json_build_object('ok', true, 'balance', bal);
end;
$$;

----------------------------------------------------------------------
-- Shop links (max 5 per shop, https only)
----------------------------------------------------------------------

create or replace function public.add_shop_link(p_property int, p_label text, p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  prop public.properties%rowtype;
  clean_label text := public.clean_text(p_label, 40);
  clean_url text := btrim(coalesce(p_url, ''));
begin
  prop := public.my_property(p_property);
  if prop.use is distinct from 'shop' then raise exception 'That is not a shop'; end if;
  if char_length(clean_label) < 1 then raise exception 'Give the link a name'; end if;
  if char_length(clean_url) > 300
     or clean_url !~* '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?([/?#][^[:space:]<>"]*)?$' then
    raise exception 'Links must be a full https:// web address';
  end if;
  if (select count(*) from public.shop_links where property_id = p_property) >= 5 then
    raise exception 'A shop can have up to 5 links';
  end if;
  insert into public.shop_links (property_id, label, url) values (p_property, clean_label, clean_url);
end;
$$;

create or replace function public.remove_shop_link(p_link bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pid int;
begin
  select property_id into pid from public.shop_links where id = p_link;
  if pid is null then raise exception 'That link is gone'; end if;
  perform public.my_property(pid);
  delete from public.shop_links where id = p_link;
end;
$$;

-- Report a link. After 3 different players report it, it's hidden from visitors
-- (the shop owner still sees it, marked as hidden).
create or replace function public.report_shop_link(p_link bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pid int;
begin
  if auth.uid() is null then raise exception 'Not logged in'; end if;
  select property_id into pid from public.shop_links where id = p_link;
  if pid is null then raise exception 'That link is gone'; end if;
  if not public.can_enter_property(pid) then raise exception 'You can''t go in there'; end if;
  insert into public.link_reports (link_id, reporter, reason)
  values (p_link, auth.uid(), public.clean_text(p_reason, 200))
  on conflict do nothing;
  if (select count(*) from public.link_reports where link_id = p_link) >= 3 then
    update public.shop_links set hidden = true where id = p_link;
  end if;
end;
$$;

----------------------------------------------------------------------
-- Permissions
----------------------------------------------------------------------
revoke all on function public.wholesale_price(int) from public, anon, authenticated;
revoke all on function public.starter_slots(text) from public, anon, authenticated;
revoke all on function public.clean_room_layout(uuid, int, jsonb) from public, anon, authenticated;
revoke all on function public.clear_property(int) from public, anon, authenticated;
revoke all on function public.my_property(int) from public, anon, authenticated;
revoke all on function public.clean_text(text, int) from public, anon, authenticated;

revoke all on function public.town_properties() from public, anon;
revoke all on function public.can_enter_property(int) from public, anon;
revoke all on function public.get_property(int) from public, anon;
revoke all on function public.claim_property(int, text) from public, anon;
revoke all on function public.release_property(int) from public, anon;
revoke all on function public.rename_property(int, text) from public, anon;
revoke all on function public.save_property_room(int, int, jsonb) from public, anon;
revoke all on function public.set_property_visibility(int, text) from public, anon;
revoke all on function public.property_people(int) from public, anon;
revoke all on function public.set_property_access(int, text, text) from public, anon;
revoke all on function public.get_shop(int) from public, anon;
revoke all on function public.stock_shop_item(int, text, int, int) from public, anon;
revoke all on function public.set_shop_price(int, text, int) from public, anon;
revoke all on function public.unstock_shop_item(int, text) from public, anon;
revoke all on function public.buy_from_shop(int, text, int) from public, anon;
revoke all on function public.add_shop_link(int, text, text) from public, anon;
revoke all on function public.remove_shop_link(bigint) from public, anon;
revoke all on function public.report_shop_link(bigint, text) from public, anon;

grant execute on function public.town_properties() to authenticated;
grant execute on function public.can_enter_property(int) to authenticated;
grant execute on function public.get_property(int) to authenticated;
grant execute on function public.claim_property(int, text) to authenticated;
grant execute on function public.release_property(int) to authenticated;
grant execute on function public.rename_property(int, text) to authenticated;
grant execute on function public.save_property_room(int, int, jsonb) to authenticated;
grant execute on function public.set_property_visibility(int, text) to authenticated;
grant execute on function public.property_people(int) to authenticated;
grant execute on function public.set_property_access(int, text, text) to authenticated;
grant execute on function public.get_shop(int) to authenticated;
grant execute on function public.stock_shop_item(int, text, int, int) to authenticated;
grant execute on function public.set_shop_price(int, text, int) to authenticated;
grant execute on function public.unstock_shop_item(int, text) to authenticated;
grant execute on function public.buy_from_shop(int, text, int) to authenticated;
grant execute on function public.add_shop_link(int, text, text) to authenticated;
grant execute on function public.remove_shop_link(bigint) to authenticated;
grant execute on function public.report_shop_link(bigint, text) to authenticated;
