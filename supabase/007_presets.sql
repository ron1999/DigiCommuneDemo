-- DigiCommune: ready-made (preset) characters, chosen under "Character" in the wardrobe.
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run again.
-- Requires 003_economy.sql and 004_rooms.sql.
--
-- preset 0 = Custom (built from the layer options), 1 = Sprout, 2 = Fern.
-- Must match PRESETS in client/src/avatar/avatar.ts and LIMITS in server/src/avatar.ts.

alter table public.items drop constraint if exists items_category_check;
alter table public.items add constraint items_category_check check (
  category in ('preset','skin','hairStyle','hairColor','outfitStyle','outfitColor','accessory','furniture','roomTemplate')
);

-- Presets are free for everyone
insert into public.items (id, category, option_index, name, price) values
  ('preset_0', 'preset', 0, 'Custom', 0),
  ('preset_1', 'preset', 1, 'Sprout', 0),
  ('preset_2', 'preset', 2, 'Fern', 0)
on conflict (id) do update
  set category = excluded.category,
      option_index = excluded.option_index,
      name = excluded.name,
      price = excluded.price;

-- Same as before, plus the preset. A look saved before presets existed (no "preset") counts as Custom.
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
  look jsonb := p_avatar;
begin
  if uid is null then raise exception 'Not logged in'; end if;
  if jsonb_typeof(look -> 'preset') is null then
    look := look || '{"preset": 0}'::jsonb;
  end if;

  foreach cat in array array['preset','skin','hairStyle','hairColor','outfitStyle','outfitColor','accessory'] loop
    if coalesce(jsonb_typeof(look -> cat), '') <> 'number' then
      raise exception 'Invalid look: % is missing', cat;
    end if;
    idx := (look ->> cat)::int;

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
