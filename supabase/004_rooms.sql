-- DigiCommune Milestone 6: personal rooms (templates with furniture slots).
-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Safe to run again: it updates names, prices and slots, and never wipes anyone's room or purchases.
-- Requires 003_economy.sql to have been run first.

----------------------------------------------------------------------
-- Shop items can now also be furniture and room templates
----------------------------------------------------------------------
alter table public.items drop constraint if exists items_category_check;
alter table public.items add constraint items_category_check check (
  category in ('skin','hairStyle','hairColor','outfitStyle','outfitColor','accessory','furniture','roomTemplate')
);

-- Which kind of slot a furniture item fits in (bed, table, seat, rug, plant, lamp, wall)
alter table public.items add column if not exists slot_type text;

-- Furniture. option_index must match FURNITURE in client/src/world/rooms.ts
insert into public.items (id, category, option_index, name, price, slot_type) values
  ('furniture_0', 'furniture', 0, 'Simple Bed', 0, 'bed'),
  ('furniture_1', 'furniture', 1, 'Canopy Bed', 120, 'bed'),
  ('furniture_2', 'furniture', 2, 'Wooden Table', 0, 'table'),
  ('furniture_3', 'furniture', 3, 'Tea Table', 60, 'table'),
  ('furniture_4', 'furniture', 4, 'Stool', 0, 'seat'),
  ('furniture_5', 'furniture', 5, 'Armchair', 70, 'seat'),
  ('furniture_6', 'furniture', 6, 'Round Rug', 40, 'rug'),
  ('furniture_7', 'furniture', 7, 'Striped Rug', 40, 'rug'),
  ('furniture_8', 'furniture', 8, 'Fern', 0, 'plant'),
  ('furniture_9', 'furniture', 9, 'Cactus', 30, 'plant'),
  ('furniture_10', 'furniture', 10, 'Floor Lamp', 35, 'lamp'),
  ('furniture_11', 'furniture', 11, 'Lava Lamp', 50, 'lamp'),
  ('furniture_12', 'furniture', 12, 'Poster', 25, 'wall'),
  ('furniture_13', 'furniture', 13, 'Painting', 60, 'wall'),

  -- Room templates. option_index must match ROOM_TEMPLATES in client/src/world/rooms.ts
  ('roomTemplate_0', 'roomTemplate', 0, 'Studio', 0, null),
  ('roomTemplate_1', 'roomTemplate', 1, 'Loft', 200, null),
  ('roomTemplate_2', 'roomTemplate', 2, 'Cottage', 150, null)
on conflict (id) do update
  set category = excluded.category,
      option_index = excluded.option_index,
      name = excluded.name,
      price = excluded.price,
      slot_type = excluded.slot_type;

----------------------------------------------------------------------
-- Room templates: which slots each one has, and what kind of furniture fits each slot.
-- Slot names must match the slots in client/src/world/rooms.ts
----------------------------------------------------------------------
create table if not exists public.room_templates (
  id int primary key,
  name text not null,
  slots jsonb not null -- { "slotName": "slotType", ... }
);

insert into public.room_templates (id, name, slots) values
  (0, 'Studio', '{"wall1":"wall","bed":"bed","lamp":"lamp","plant1":"plant","table":"table","seat1":"seat","rug":"rug"}'),
  (1, 'Loft', '{"wall1":"wall","wall2":"wall","bed":"bed","lamp":"lamp","plant1":"plant","plant2":"plant","table":"table","seat1":"seat","seat2":"seat","rug":"rug"}'),
  (2, 'Cottage', '{"wall1":"wall","wall2":"wall","bed":"bed","lamp":"lamp","plant1":"plant","plant2":"plant","table":"table","seat1":"seat","rug":"rug"}')
on conflict (id) do update set name = excluded.name, slots = excluded.slots;

----------------------------------------------------------------------
-- Each player's room. No row yet = the default starter room.
----------------------------------------------------------------------
create table if not exists public.rooms (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  template int not null default 0 references public.room_templates (id),
  slots jsonb not null default '{}'::jsonb, -- { "slotName": "furniture_N", ... }
  updated_at timestamptz not null default now()
);

alter table public.room_templates enable row level security;
alter table public.rooms enable row level security;

drop policy if exists "Room templates are viewable by signed-in users" on public.room_templates;
create policy "Room templates are viewable by signed-in users" on public.room_templates
  for select to authenticated using (true);

-- For now only the owner can see their room. Visiting (friends, public rooms) comes later.
drop policy if exists "Players can view their own room" on public.rooms;
create policy "Players can view their own room" on public.rooms
  for select to authenticated using (auth.uid() = owner_id);

grant select on public.room_templates, public.rooms to authenticated;

----------------------------------------------------------------------
-- Save a room, but only with a template and furniture that are free or owned,
-- and only furniture that fits the slot it is put in.
----------------------------------------------------------------------
create or replace function public.save_room(p_template int, p_slots jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  tmpl public.room_templates%rowtype;
  tmpl_item public.items%rowtype;
  item_row public.items%rowtype;
  slot_name text;
  slot_value jsonb;
  clean jsonb := '{}'::jsonb;
begin
  if uid is null then raise exception 'Not logged in'; end if;

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
    -- Slots that this template doesn't have are ignored (e.g. after switching templates)
    if not (tmpl.slots ? slot_name) then continue; end if;
    -- Empty slot
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

  insert into public.rooms (owner_id, template, slots, updated_at)
  values (uid, p_template, clean, now())
  on conflict (owner_id) do update
    set template = excluded.template, slots = excluded.slots, updated_at = now();

  return jsonb_build_object('template', p_template, 'slots', clean);
end;
$$;

revoke all on function public.save_room(int, jsonb) from public, anon;
grant execute on function public.save_room(int, jsonb) to authenticated;
