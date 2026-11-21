// Checks a login token from the browser against Supabase, so nobody can
// pretend to be another player. The username comes from the database,
// never from the client.

export interface VerifiedUser {
  id: string;
  username: string;
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
  const userRes = await fetch(url + '/auth/v1/user', { headers });
  if (!userRes.ok) return null;
  const user = (await userRes.json()) as { id?: string };
  if (!user.id) return null;

  // 2) Look up their username (the row is only readable with their valid token)
  const profileRes = await fetch(
    url + '/rest/v1/profiles?select=username&id=eq.' + encodeURIComponent(user.id),
    { headers },
  );
  if (!profileRes.ok) return null;
  const rows = (await profileRes.json()) as { username?: string }[];
  const username = rows[0]?.username;
  if (!username) return null;

  return { id: user.id, username };
}
