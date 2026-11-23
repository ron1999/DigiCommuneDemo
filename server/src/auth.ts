// Checks a login token from the browser against Supabase, so nobody can
// pretend to be another player. The username comes from the database,
// never from the client.

export interface PetInfo {
  species: number;
  name: string;
}

export interface VerifiedUser {
  id: string;
  username: string;
  avatar: unknown; // raw value from the database; sanitize before use
  pet: PetInfo | null; // the pet following them, if any
}

const MAX_SPECIES = 5; // must match SPECIES in client/src/pets/species.ts and 005_pets.sql

// Asks the database whether this player may enter ownerId's room (friends / public / blocked).
// Uses the player's own login, so the database decides with its own rules.
export async function canVisitRoom(token: string, ownerId: string): Promise<boolean> {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;
  try {
    const res = await fetch(url + '/rest/v1/rpc/can_visit_room', {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_owner: ownerId }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;
    return (await res.json()) === true;
  } catch {
    return false;
  }
}

// Asks the database whether this player may go into a house or shop, and who owns it.
// Uses the player's own login, so the database applies its own rules (guest list, bans,
// blocks, visibility). Returns null if they may not go in (or it isn't claimed).
export async function getPropertyOwner(token: string, propertyId: number): Promise<string | null> {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  try {
    const res = await fetch(url + '/rest/v1/rpc/get_property', {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_property: propertyId }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const info = (await res.json()) as { owner_id?: unknown };
    return typeof info?.owner_id === 'string' ? info.owner_id : null;
  } catch {
    return null;
  }
}

export function authConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

// Returns the user, or null if the token is invalid. Throws if the server isn't configured.
export async function verifyToken(token: string): Promise<VerifiedUser | null> {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are missing in server/.env');
  }

  const headers = { apikey: anonKey, Authorization: 'Bearer ' + token };

  // 1) Is this token real, and whose is it?
  const userRes = await fetch(url + '/auth/v1/user', {
    headers,
    signal: AbortSignal.timeout(8000),
  });
  if (!userRes.ok) return null;
  const user = (await userRes.json()) as { id?: string };
  if (!user.id) return null;

  // 2) Look up their username (the row is only readable with their valid token)
  const profileRes = await fetch(
    url + '/rest/v1/profiles?select=username,avatar&id=eq.' + encodeURIComponent(user.id),
    { headers, signal: AbortSignal.timeout(8000) },
  );
  if (!profileRes.ok) return null;
  const rows = (await profileRes.json()) as { username?: string; avatar?: unknown }[];
  const username = rows[0]?.username;
  if (!username) return null;

  return { id: user.id, username, avatar: rows[0]?.avatar, pet: await fetchActivePet(url, headers, user.id) };
}

// The player's active pet. Any problem (e.g. 005_pets.sql not run yet) just means "no pet".
async function fetchActivePet(
  url: string,
  headers: Record<string, string>,
  userId: string,
): Promise<PetInfo | null> {
  try {
    const res = await fetch(
      url + '/rest/v1/pets?select=species,name&active=eq.true&owner_id=eq.' + encodeURIComponent(userId),
      { headers, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as { species?: unknown; name?: unknown }[];
    const row = rows[0];
    if (!row) return null;
    const species = row.species;
    const name = row.name;
    if (typeof species !== 'number' || !Number.isInteger(species) || species < 0 || species > MAX_SPECIES) return null;
    if (typeof name !== 'string' || name.length === 0 || name.length > 16) return null;
    return { species, name };
  } catch {
    return null;
  }
}
