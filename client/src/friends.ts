import { supabase } from './supabase';
import { DEFAULT_ROOM, cleanLayout } from './world/rooms';
import type { RoomLayout } from './world/rooms';

export type FriendKind = 'friend' | 'incoming' | 'outgoing' | 'blocked';
export type RoomVisibility = 'private' | 'friends' | 'public';

export interface Connection {
  user_id: string;
  username: string;
  kind: FriendKind;
}

// Your friends, requests and blocks, as last loaded from the database
export const friends: { list: Connection[]; loaded: boolean } = { list: [], loaded: false };

const listeners = new Set<() => void>();
export function onFriendsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function rpc(name: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

export async function loadFriends(): Promise<void> {
  friends.list = ((await rpc('my_friends')) ?? []) as Connection[];
  friends.loaded = true;
  listeners.forEach((fn) => fn());
}

// Returns 'sent', 'accepted' (they had already asked you) or 'already_friends'
export async function sendFriendRequest(username: string): Promise<string> {
  const result = (await rpc('send_friend_request', { p_username: username })) as string;
  await loadFriends();
  return result;
}

export async function acceptFriend(userId: string): Promise<void> {
  await rpc('accept_friend_request', { p_from: userId });
  await loadFriends();
}

// Unfriend, decline, or cancel a request
export async function removeFriend(userId: string): Promise<void> {
  await rpc('remove_friend', { p_other: userId });
  await loadFriends();
}

export async function blockUser(userId: string): Promise<void> {
  await rpc('block_user', { p_other: userId });
  await loadFriends();
}

export async function unblockUser(userId: string): Promise<void> {
  await rpc('unblock_user', { p_other: userId });
  await loadFriends();
}

export async function setRoomVisibility(v: RoomVisibility): Promise<void> {
  await rpc('set_room_visibility', { p_visibility: v });
}

export async function getMyRoomVisibility(): Promise<RoomVisibility> {
  const { data: auth } = await supabase.auth.getSession();
  const uid = auth.session?.user.id;
  if (!uid) return 'friends';
  const { data } = await supabase.from('rooms').select('visibility').eq('owner_id', uid).maybeSingle();
  return ((data?.visibility as RoomVisibility | undefined) ?? 'friends');
}

// Someone else's room (the database checks you're allowed to visit)
export async function getRoom(ownerId: string): Promise<{ ownerName: string; layout: RoomLayout }> {
  const r = (await rpc('get_room', { p_owner: ownerId })) as {
    owner: string;
    template: number | null;
    slots: Record<string, string | null> | null;
  };
  const layout =
    r.template === null ? cleanLayout(DEFAULT_ROOM) : cleanLayout({ template: r.template, slots: r.slots ?? {} });
  return { ownerName: r.owner, layout };
}
