-- DigiCommune: accessories (hats, glasses, headband, neck bandana, piercings and tattoos).
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run again.
-- Requires 009_body_types.sql.
--
-- One item per option, in the same order as the lists in client/src/avatar/avatar.ts
-- (LIMITS in server/src/avatar.ts must match the counts).
-- "face" is different: several can be worn at once, so the saved value is a bit per item
-- (bit 0 = face_0 Ear hoops ... bit 4 = face_4 Leaf tattoo), and each worn one must be owned.

alter table public.items drop constraint if exists items_category_check;
alter table public.items add constraint items_category_check check (
  category in (
    'preset','gender','build','muscle','height','skin','hairStyle','hairColor',
    'top','topColor','bottom','bottomColor','onepiece','onepieceColor','shoes','shoesColor',
    'hat','hatColor','glasses','glassesColor','band','bandColor','neck','neckColor','face','faceColor',
    'outfitStyle','outfitColor','accessory',          -- retired, kept for old purchases
    'furniture','roomTemplate'
  )
);

insert into public.items (id, category, option_index, name, price)
with colors (idx, name, price) as (
  -- Same colors and prices as the clothing colors in 009 (CLOTH_COLORS)
  values
    (0,'Blue',0),(1,'Red',0),(2,'Green',15),(3,'Yellow',15),(4,'Purple',20),(5,'Orange',20),
    (6,'Teal',20),(7,'Pink',20),(8,'Navy',0),(9,'Cream',0),(10,'Brown',0),(11,'Olive',0)
)
select category || '_' || idx, category, idx, name, price
from (
  values
    ('hat',0,'No hat',0),('hat',1,'Beanie',40),('hat',2,'Cap',40),('hat',3,'Sun hat',60),
    ('hat',4,'Bucket hat',50),('hat',5,'Mushroom hat',80),
    ('glasses',0,'No glasses',0),('glasses',1,'Round glasses',40),('glasses',2,'Square glasses',40),
    ('glasses',3,'Sunglasses',60),
    ('band',0,'No headband',0),('band',1,'Bandana headband',30),
    ('neck',0,'Nothing on neck',0),('neck',1,'Neck bandana',30),
    ('face',0,'Ear hoops',30),('face',1,'Nose ring',30),('face',2,'Lip ring',30),
    ('face',3,'Brow bar',30),('face',4,'Leaf tattoo',40)
) as v(category, idx, name, price)
union all
select slot || '_' || idx, slot, idx, name, price
from colors cross join (values ('hatColor'),('glassesColor'),('bandColor'),('neckColor'),('faceColor')) as s(slot)
on conflict (id) do update
  set category = excluded.category,
      option_index = excluded.option_index,
      name = excluded.name,
      price = excluded.price;

-- Saving a look: every option must exist and be free or owned. Missing options (a look saved
-- before this) get the defaults below, which are all free.
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
  b int;
  item_row public.items%rowtype;
  clean jsonb := '{}'::jsonb;
  look jsonb := coalesce(p_avatar, '{}'::jsonb);
  defaults jsonb := '{"preset":0,"gender":0,"build":2,"muscle":0,"height":2,"skin":2,"hairStyle":0,"hairColor":1,
                      "top":1,"topColor":0,"bottom":1,"bottomColor":8,"onepiece":0,"onepieceColor":11,
                      "shoes":1,"shoesColor":1,"hat":0,"hatColor":1,"glasses":0,"glassesColor":8,
                      "band":0,"bandColor":1,"neck":0,"neckColor":1,"face":0,"faceColor":9}'::jsonb;
begin
  if uid is null then raise exception 'Not logged in'; end if;
  if jsonb_typeof(look) <> 'object' then raise exception 'Invalid look'; end if;

  foreach cat in array array['preset','gender','build','muscle','height','skin','hairStyle','hairColor',
                             'top','topColor','bottom','bottomColor','onepiece','onepieceColor','shoes','shoesColor',
                             'hat','hatColor','glasses','glassesColor','band','bandColor','neck','neckColor',
                             'face','faceColor'] loop
    if jsonb_typeof(look -> cat) is null then
      idx := (defaults ->> cat)::int;
    elsif jsonb_typeof(look -> cat) <> 'number' then
      raise exception 'Invalid look: % is not a number', cat;
    else
      idx := (look ->> cat)::int;
    end if;

    if cat = 'face' then
      -- A bit per face item: each one worn must exist and be free or owned
      if idx < 0 or idx >= 32 then raise exception 'Invalid look option for face'; end if;
      for b in 0..4 loop
        if (idx >> b) & 1 = 1 then
          select * into item_row from public.items where category = 'face' and option_index = b;
          if not found then raise exception 'Invalid look option for face'; end if;
          if item_row.price > 0
             and not exists (select 1 from public.inventory where user_id = uid and item_id = item_row.id) then
            raise exception 'You do not own % (face) yet', item_row.name;
          end if;
        end if;
      end loop;
    else
      select * into item_row from public.items where category = cat and option_index = idx;
      if not found then raise exception 'Invalid look option for %', cat; end if;
      if item_row.price > 0
         and not exists (select 1 from public.inventory where user_id = uid and item_id = item_row.id) then
        raise exception 'You do not own % (%) yet', item_row.name, cat;
      end if;
    end if;

    clean := clean || jsonb_build_object(cat, idx);
  end loop;

  update public.profiles set avatar = clean where id = uid;
  return clean;
end;
$$;

revoke all on function public.save_avatar(jsonb) from public, anon;
grant execute on function public.save_avatar(jsonb) to authenticated;
