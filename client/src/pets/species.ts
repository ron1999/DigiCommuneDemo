// Pet species. All original creatures.
// IMPORTANT: the order (species number) must match supabase/005_pets.sql (0-5)
// and MAX_SPECIES in server/src/auth.ts.

export interface Species {
  name: string;
  blurb: string;
  starter: boolean; // can be picked as the free starter
  body: number; // placeholder art colors
  accent: number;
}

export const SPECIES: Species[] = [
  { name: 'Mossling', blurb: 'A round, sleepy fluffball with a sprout on its head.', starter: true, body: 0x7fbf6a, accent: 0x3e7d3a },
  { name: 'Pebblet', blurb: 'A tiny beetle that polishes its shell on sunny rocks.', starter: true, body: 0x9a8f86, accent: 0x5e5650 },
  { name: 'Fluffin', blurb: 'A cloud-puff bird that hums when it is happy.', starter: true, body: 0xf2f4ff, accent: 0x8fb3e6 },
  { name: 'Glimmoth', blurb: 'A moth whose wings glow softly at dusk.', starter: false, body: 0xd8b4f8, accent: 0x7d3c98 },
  { name: 'Snorbit', blurb: 'A snoring snail with a spiral shell like a planet.', starter: false, body: 0xf5c16c, accent: 0xb06d2e },
  { name: 'Quillip', blurb: 'A shy hedgehog with ribbon-soft quills.', starter: false, body: 0xc98b6b, accent: 0x6b3f2a },
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
