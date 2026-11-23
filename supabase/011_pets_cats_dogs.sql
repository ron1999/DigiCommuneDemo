-- DigiCommune: pets become cats and dogs (7 species, ids 0-6).
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run again.
--
-- The species list lives in client/src/pets/species.ts. Old species are swapped 1:1 by number,
-- so nobody's pet is lost or renamed: 0 Mossling -> Tabby, 1 Pebblet -> Corgi,
-- 2 Fluffin -> Shadow (black cat), 3 Glimmoth -> Beagle, 4 Snorbit -> Silver, 5 Quillip -> Fluff.
-- 6 Cocoa is new. Starters stay 0-2 (adopt_starter in 005 is unchanged).
-- This file only widens the allowed species numbers from 0-5 to 0-6.
-- Later (lizards etc.): add a NEW numbered file like this one with the new highest id, and bump
-- MAX_SPECIES in server/src/auth.ts.

do $$
declare
  c record;
begin
  -- Drop every species check on pets (005 made one inline; Postgres named it pets_species_check)
  for c in
    select conname from pg_constraint
    where conrelid = 'public.pets'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%species%'
  loop
    execute format('alter table public.pets drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.pets add constraint pets_species_check check (species between 0 and 6);
