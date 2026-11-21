import { supabase } from './supabase';

// Players log in with just a username and password. Supabase wants an email for each
// account, so we quietly build a placeholder one from the username.
// Later (Milestone 6+) players can attach a real email or phone number.
// If Supabase ever rejects this domain as "invalid", change it here.
const PLACEHOLDER_EMAIL_DOMAIN = 'digicommune.app';

export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;
export const MIN_PASSWORD_LENGTH = 8;

function toEmail(username: string): string {
  return username.toLowerCase() + '@' + PLACEHOLDER_EMAIL_DOMAIN;
}

function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'That username is already taken.';
  }
  if (m.includes('invalid login credentials')) {
    return 'Wrong username or password.';
  }
  if (m.includes('email') && m.includes('invalid')) {
    return 'Supabase rejected the placeholder email domain. Tell your helper (see PLACEHOLDER_EMAIL_DOMAIN in auth.ts).';
  }
  if (m.includes('rate limit')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  return message;
}

export async function getCurrentUsername(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', session.user.id)
    .maybeSingle();
  return profile?.username ?? null;
}

export async function signUp(username: string, password: string): Promise<string> {
  const { data, error } = await supabase.auth.signUp({
    email: toEmail(username),
    password,
    options: { data: { username } },
  });
  if (error) throw new Error(friendlyError(error.message));
  if (!data.session) {
    throw new Error(
      'Account created, but Supabase wants email confirmation. Turn off "Confirm email" under Authentication > Providers > Email.',
    );
  }
  const name = await getCurrentUsername();
  if (!name) throw new Error('Account created, but the profile is missing. Did you run the SQL file?');
  return name;
}

export async function logIn(username: string, password: string): Promise<string> {
  const { error } = await supabase.auth.signInWithPassword({
    email: toEmail(username),
    password,
  });
  if (error) throw new Error(friendlyError(error.message));
  const name = await getCurrentUsername();
  if (!name) throw new Error('Logged in, but no profile was found. Did you run the SQL file?');
  return name;
}

export async function logOut(): Promise<void> {
  await supabase.auth.signOut();
}

// Always asks Supabase, which refreshes the token automatically if it expired.
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
