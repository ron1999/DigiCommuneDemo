import { supabase } from './supabase';
import { isEmptyAvatar, sanitizeAvatar } from './avatar/avatar';
import type { Avatar } from './avatar/avatar';

// Players log in with just a username and password. Supabase wants an email for each
// account, so we quietly build a placeholder one from the username.
//
// Supabase rejects made-up domains, so set VITE_PLACEHOLDER_EMAIL_BASE in client/.env to
// an inbox you control, e.g. mygame.accounts@gmail.com. Each player then gets a unique
// "plus address" like mygame.accounts+sam@gmail.com, which Gmail delivers to that same
// inbox. Nothing is ever sent to it in the normal flow.
//
// Choose this once: changing it later stops existing accounts from logging in.
const PLACEHOLDER_EMAIL_BASE = (
  import.meta.env.VITE_PLACEHOLDER_EMAIL_BASE as string | undefined
)?.trim();
const FALLBACK_DOMAIN = 'digicommune.app';

export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;
export const MIN_PASSWORD_LENGTH = 8;

export interface Profile {
  username: string;
  avatar: Avatar;
  isNew: boolean; // has never picked a look yet
}

function toEmail(username: string): string {
  const name = username.toLowerCase();
  if (PLACEHOLDER_EMAIL_BASE && PLACEHOLDER_EMAIL_BASE.includes('@')) {
    const [local, domain] = PLACEHOLDER_EMAIL_BASE.split('@');
    return local + '+' + name + '@' + domain;
  }
  return name + '@' + FALLBACK_DOMAIN;
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
    return 'Supabase rejected the placeholder email (' + message + '). Check VITE_PLACEHOLDER_EMAIL_BASE in client/.env.';
  }
  if (m.includes('rate limit')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  return message;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return null;

  const { data: row, error } = await supabase
    .from('profiles')
    .select('username, avatar')
    .eq('id', session.user.id)
    .maybeSingle();
  if (error) throw new Error('Profile lookup failed: ' + error.message);
  if (!row) return null;

  return {
    username: row.username as string,
    avatar: sanitizeAvatar(row.avatar),
    isNew: isEmptyAvatar(row.avatar),
  };
}

export async function signUp(username: string, password: string): Promise<Profile> {
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
  const profile = await getCurrentProfile();
  if (!profile) throw new Error('Account created, but the profile is missing. Did you run the SQL file?');
  return profile;
}

export async function logIn(username: string, password: string): Promise<Profile> {
  const { error } = await supabase.auth.signInWithPassword({
    email: toEmail(username),
    password,
  });
  if (error) throw new Error(friendlyError(error.message));
  const profile = await getCurrentProfile();
  if (!profile) throw new Error('Logged in, but no profile was found. Did you run the SQL file?');
  return profile;
}

export async function logOut(): Promise<void> {
  await supabase.auth.signOut();
}

// Saves the player's look to their profile (the database only lets you change your own).
export async function saveAvatar(avatar: Avatar): Promise<void> {
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) throw new Error('You are logged out. Reload the page.');

  const { data, error } = await supabase
    .from('profiles')
    .update({ avatar })
    .eq('id', s.session.user.id)
    .select('avatar');
  if (error) throw new Error('Could not save: ' + error.message);
  if (!data || data.length === 0) {
    throw new Error('Could not save your character (no permission). Did you run 002_fix_profile_access.sql?');
  }
}

// Always asks Supabase, which refreshes the token automatically if it expired.
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
