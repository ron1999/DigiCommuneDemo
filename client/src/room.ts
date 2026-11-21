import { supabase } from './supabase';
import { DEFAULT_ROOM, cleanLayout } from './world/rooms';
import type { RoomLayout } from './world/rooms';

// Your own room, as saved in the database (or the starter room if you never decorated).
export async function loadMyRoom(): Promise<RoomLayout> {
  const { data: auth } = await supabase.auth.getSession();
  const uid = auth.session?.user.id;
  if (!uid) throw new Error('Not logged in');

  const { data, error } = await supabase
    .from('rooms')
    .select('template, slots')
    .eq('owner_id', uid)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return cleanLayout(DEFAULT_ROOM);
  return cleanLayout({
    template: data.template as number,
    slots: (data.slots ?? {}) as Record<string, string | null>,
  });
}

// Saves through save_room() in the database, which checks you own everything.
export async function saveMyRoom(layout: RoomLayout): Promise<RoomLayout> {
  const clean = cleanLayout(layout);
  const { data, error } = await supabase.rpc('save_room', {
    p_template: clean.template,
    p_slots: clean.slots,
  });
  if (error) throw new Error(error.message);
  const saved = data as { template: number; slots: Record<string, string> };
  return cleanLayout({ template: saved.template, slots: saved.slots });
}

export async function myUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error('Not logged in');
  return uid;
}
