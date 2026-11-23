-- DigiCommune: the new character system (body types, skin tones, 10 hairstyles, clothing slots).
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run again.
-- Requires 003, 007 and 008.
--
-- One item per wardrobe option, in the same order as the lists in client/src/avatar/avatar.ts
-- (LIMITS in server/src/avatar.ts must match the counts).
--
-- The old outfit/outfit color/accessory options no longer exist. Anyone who paid for one gets
-- those coins back, and those items become free (price 0), so they disappear from the Shop
-- and from shop owners' stock lists. Their rows stay so old purchases and stock still work.

alter table public.items drop constraint if exists items_category_check;
alter table public.items add constraint items_category_check check (
  category in (
    'preset','gender','build','muscle','height','skin','hairStyle','hairColor',
    'top','topColor','bottom','bottomColor','onepiece','onepieceColor','shoes','shoesColor',
    'outfitStyle','outfitColor','accessory',          -- retired, kept for old purchases
    'furniture','roomTemplate'
  )
);

-- Refund retired paid items (only while they still have a price, so a re-run refunds nothing)
with refunds as (
  select inv.user_id, sum(i.price)::int as amount
  from public.inventory inv
  join public.items i on i.id = inv.item_id
  where i.category in ('outfitStyle','outfitColor','accessory') and i.price > 0
  group by inv.user_id
), paid as (
  update public.wallets w set balance = w.balance + r.amount
  from refunds r where w.user_id = r.user_id
  returning w.user_id, r.amount
)
insert into public.ledger (user_id, amount, reason, ref)
select user_id, amount, 'refund', 'retired outfit items' from paid;

update public.items
set price = 0, name = name || ' (retired)'
where category in ('outfitStyle','outfitColor','accessory') and price > 0;

insert into public.items (id, category, option_index, name, price)
with cloth_colors (idx, name, price) as (
  -- Colors shared by every clothing slot (CLOTH_COLORS)
  values
    (0,'Blue',0),(1,'Red',0),(2,'Green',15),(3,'Yellow',15),(4,'Purple',20),(5,'Orange',20),
    (6,'Teal',20),(7,'Pink',20),(8,'Navy',0),(9,'Cream',0),(10,'Brown',0),(11,'Olive',0)
)
select category || '_' || idx, category, idx, name, price
from (
  values
    ('gender',0,'Male',0),('gender',1,'Female',0),
    ('build',0,'Slim',0),('build',1,'Lean',0),('build',2,'Average',0),('build',3,'Stocky',0),('build',4,'Heavyset',0),
    ('muscle',0,'Soft',0),('muscle',1,'Muscular',0),
    ('height',0,'Shortest',0),('height',1,'Short',0),('height',2,'Average',0),('height',3,'Tall',0),('height',4,'Tallest',0),
    ('skin',0,'Porcelain',0),('skin',1,'Fair',0),('skin',2,'Sunset',0),('skin',3,'Golden',0),('skin',4,'Olive',0),
    ('skin',5,'Tan',0),('skin',6,'Brown',0),('skin',7,'Umber',0),('skin',8,'Deep',0),('skin',9,'Ebony',0),
    ('hairStyle',0,'Messy',0),('hairStyle',1,'Bob',0),('hairStyle',2,'Buzz',0),('hairStyle',3,'Long',0),
    ('hairStyle',4,'Curls',40),('hairStyle',5,'Ponytail',40),('hairStyle',6,'Buns',50),('hairStyle',7,'Undercut',50),
    ('hairStyle',8,'Locs',50),('hairStyle',9,'Spiky',60),('hairStyle',10,'Bald',0),
    ('top',0,'Tank top',0),('top',1,'Tee',0),('top',2,'Hoodie',60),('top',3,'Flannel',60),('top',4,'Sweater',50),
    ('bottom',0,'Shorts',0),('bottom',1,'Jeans',0),('bottom',2,'Cargo pants',50),('bottom',3,'Skirt',40),('bottom',4,'Trousers',40),
    ('onepiece',0,'No overalls',0),('onepiece',1,'Overalls',80),
    ('shoes',0,'Barefoot',0),('shoes',1,'Sneakers',0),('shoes',2,'Boots',50),('shoes',3,'Sandals',30)
) as v(category, idx, name, price)
union all
select slot || '_' || idx, slot, idx, name, price
from cloth_colors cross join (values ('topColor'),('bottomColor'),('onepieceColor'),('shoesColor')) as s(slot)
on conflict (id) do update
  set category = excluded.category,
      option_index = excluded.option_index,
      name = excluded.name,
      price = excluded.price;

-- Saving a look: every option must exist and be free or owned. A look saved before this
-- (old format) is filled in with the defaults below, which are all free.
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
  look jsonb := coalesce(p_avatar, '{}'::jsonb);
  defaults jsonb := '{"preset":0,"gender":0,"build":2,"muscle":0,"height":2,"skin":2,"hairStyle":0,"hairColor":1,
                      "top":1,"topColor":0,"bottom":1,"bottomColor":8,"onepiece":0,"onepieceColor":11,
                      "shoes":1,"shoesColor":1}'::jsonb;
begin
  if uid is null then raise exception 'Not logged in'; end if;
  if jsonb_typeof(look) <> 'object' then raise exception 'Invalid look'; end if;

  foreach cat in array array['preset','gender','build','muscle','height','skin','hairStyle','hairColor',
                             'top','topColor','bottom','bottomColor','onepiece','onepieceColor','shoes','shoesColor'] loop
    if jsonb_typeof(look -> cat) is null then
      idx := (defaults ->> cat)::int;
    elsif jsonb_typeof(look -> cat) <> 'number' then
      raise exception 'Invalid look: % is not a number', cat;
    else
      idx := (look ->> cat)::int;
    end if;

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

revoke all on function public.save_avatar(jsonb) from public, anon;
grant execute on function public.save_avatar(jsonb) to authenticated;
