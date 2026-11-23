// Pet species: original cats and dogs (more animal families later, e.g. lizards).
// IMPORTANT: a species number is saved in the database, so never reorder or remove entries:
// only append. The count must match MAX_SPECIES in server/src/auth.ts and the species check
// in the newest pets SQL file (supabase/011_pets_cats_dogs.sql: 0-6).
// Each species has a sprite sheet in client/public/sprites/pets/<sheet>.png (see "Pets" in
// docs/ART_SPEC.md: 48 x 48 frames, rows down/left/right/up, col 0 standing + 4 walk frames).

export type PetFamily = 'cat' | 'dog'; // add 'lizard' etc. here when they arrive

export interface Species {
  name: string;
  blurb: string;
  family: PetFamily;
  sheet: string; // file name in sprites/pets/, without .png
  starter: boolean; // can be picked as the free starter (must match adopt_starter in SQL: 0-2)
}

export const SPECIES: Species[] = [
  { name: 'Tabby', blurb: 'An orange tabby who naps in every sunbeam.', family: 'cat', sheet: 'cat-tabby', starter: true },
  { name: 'Corgi', blurb: 'A stubby-legged pup who is sure every walk is a parade.', family: 'dog', sheet: 'dog-corgi', starter: true },
  { name: 'Shadow', blurb: 'A black cat with lantern-green eyes.', family: 'cat', sheet: 'cat-black', starter: true },
  { name: 'Beagle', blurb: 'A floppy-eared sniffer who finds every lost snack.', family: 'dog', sheet: 'dog-beagle', starter: false },
  { name: 'Silver', blurb: 'A silver tabby, calm as a rainy afternoon.', family: 'cat', sheet: 'cat-silver', starter: false },
  { name: 'Fluff', blurb: 'A cream cloud of a mutt with a curly tail.', family: 'dog', sheet: 'dog-mutt', starter: false },
  { name: 'Cocoa', blurb: 'A cocoa tabby who smells faintly of warm bread.', family: 'cat', sheet: 'cat-cocoa', starter: false },
];

export interface PetInfo {
  species: number;
  name: string;
}

// Turns anything from the server into a safe pet (or no pet)
export function sanitizePet(raw: unknown): PetInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { species?: unknown; name?: unknown };
  if (typeof r.species !== 'number' || !Number.isInteger(r.species)) return null;
  if (r.species < 0 || r.species >= SPECIES.length) return null;
  if (typeof r.name !== 'string' || r.name.length === 0 || r.name.length > 16) return null;
  return { species: r.species, name: r.name };
}
