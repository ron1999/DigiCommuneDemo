// The Friends panel: add friends by name, answer requests, see who's online,
// visit rooms, block people, choose who can visit your room, and (at home)
// ask visitors to leave.

import {
  acceptFriend,
  blockUser,
  friends,
  getMyRoomVisibility,
  loadFriends,
  onFriendsChange,
  removeFriend,
  sendFriendRequest,
  setRoomVisibility,
  unblockUser,
} from '../friends';
import type { Connection, RoomVisibility } from '../friends';
import { cancelDecorate } from './decorate';
import { toast } from './hud';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const panel = $('friends');
const body = $('friends-body');
const errorText = $('friends-error');
const closeBtn = $<HTMLButtonElement>('friends-close');

export type Where = 'town' | 'home' | 'visiting' | 'place' | null;

// The game hooks into these
export const friendsPanel = {
  // Where each of these accounts is right now (asks the server)
  queryOnline: null as ((ids: string[]) => Promise<Record<string, Where>>) | null,
  onVisit: null as ((ownerId: string) => void) | null,
  // People in your room right now (only when you're at home), and removing one
  guests: null as (() => { id: string; name: string }[]) | null,
  onRemoveGuest: null as ((sessionId: string) => void) | null,
};

let online: Record<string, Where> = {};
let visibility: RoomVisibility = 'friends';
let busy = false;

const WHERE_TEXT: Record<Exclude<Where, null>, string> = {
  town: 'online · in town',
  home: 'online · in their room',
  visiting: 'online · visiting a room',
  place: 'online · at a house or shop',
};

function button(label: string, onClick: () => Promise<void> | void, primary = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'w-btn' + (primary ? ' selected' : '');
  b.textContent = label;
  b.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    errorText.textContent = '';
    try {
      await onClick();
    } catch (err) {
      errorText.textContent = (err as Error).message;
    } finally {
      busy = false;
    }
  });
  return b;
}

function label(text: string): HTMLElement {
  const l = document.createElement('div');
  l.className = 'w-label';
  l.textContent = text;
  return l;
}

function personRow(name: string, detail: string, buttons: HTMLButtonElement[], dim = false): HTMLElement {
  const row = document.createElement('div');
  row.className = 'friend-row' + (dim ? ' dim' : '');
  const info = document.createElement('div');
  info.className = 'pet-info';
  const n = document.createElement('strong');
  n.textContent = name;
  const d = document.createElement('span');
  d.textContent = detail;
  info.append(n, d);
  row.appendChild(info);
  buttons.forEach((b) => row.appendChild(b));
  return row;
}

function confirmBlock(c: Connection): Promise<void> | void {
  if (!window.confirm('Block ' + c.username + '? They will be removed from your friends and can\'t visit your room.')) return;
  return blockUser(c.user_id).then(() => toast(c.username + ' is blocked'));
}

function render(): void {
  body.innerHTML = '';

  // Add a friend
  const add = document.createElement('div');
  add.className = 'friend-add';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Username';
  input.maxLength = 16;
  input.autocomplete = 'off';
  input.id = 'friend-name-input';
  const send = button(
    'Add friend',
    async () => {
      const name = input.value.trim();
      if (!name) return;
      const r = await sendFriendRequest(name);
      toast(r === 'accepted' ? 'You and ' + name + ' are now friends!' : r === 'already_friends' ? 'Already friends' : 'Request sent to ' + name);
      input.value = '';
    },
    true,
  );
  input.addEventListener('keydown', (e) => {
    e.stopPropagation(); // don't move the character while typing
    if (e.key === 'Enter') send.click();
  });
  add.append(input, send);
  body.append(label('Add a friend'), add);

  if (!friends.loaded) {
    body.append(label('Loading...'));
    return;
  }

  const by = (k: Connection['kind']) => friends.list.filter((c) => c.kind === k);

  const incoming = by('incoming');
  if (incoming.length) {
    body.append(label('Friend requests'));
    for (const c of incoming) {
      body.append(
        personRow(c.username, 'wants to be friends', [
          button('Accept', () => acceptFriend(c.user_id).then(() => toast('You and ' + c.username + ' are now friends!')), true),
          button('Decline', () => removeFriend(c.user_id)),
          button('Block', () => confirmBlock(c)),
        ]),
      );
    }
  }

  const list = by('friend').sort((a, b) => Number(!!online[b.user_id]) - Number(!!online[a.user_id]));
  body.append(label('Friends (' + list.length + ')'));
  if (list.length === 0) body.append(personRow('No friends yet', 'Add someone by their username above.', [], true));
  for (const c of list) {
    const where = online[c.user_id];
    body.append(
      personRow(
        c.username,
        where ? WHERE_TEXT[where] : 'offline',
        [
          button('Visit room', () => {
            friendsPanel.onVisit?.(c.user_id);
            close();
          }),
          button('Remove', () => {
            if (window.confirm('Remove ' + c.username + ' from your friends?')) return removeFriend(c.user_id);
          }),
          button('Block', () => confirmBlock(c)),
        ],
        !where,
      ),
    );
  }

  const outgoing = by('outgoing');
  if (outgoing.length) {
    body.append(label('Requests you sent'));
    for (const c of outgoing) {
      body.append(personRow(c.username, 'waiting for an answer', [button('Cancel', () => removeFriend(c.user_id))]));
    }
  }

  // Your room
  body.append(label('Who can visit my room'));
  const vis = document.createElement('div');
  vis.className = 'w-options';
  const choices: [RoomVisibility, string][] = [
    ['private', 'Only me'],
    ['friends', 'Friends'],
    ['public', 'Everyone'],
  ];
  for (const [v, text] of choices) {
    vis.appendChild(
      button(text, async () => {
        await setRoomVisibility(v);
        visibility = v;
        render();
      }, visibility === v),
    );
  }
  body.append(vis);

  const guests = friendsPanel.guests?.();
  if (guests && guests.length) {
    body.append(label('In your room now'));
    for (const g of guests) {
      body.append(
        personRow(g.name, 'visiting', [
          button('Ask to leave', () => {
            friendsPanel.onRemoveGuest?.(g.id);
            toast(g.name + ' was sent back to town');
          }),
        ]),
      );
    }
  }

  const blocked = by('blocked');
  if (blocked.length) {
    body.append(label('Blocked'));
    for (const c of blocked) {
      body.append(personRow(c.username, 'blocked', [button('Unblock', () => unblockUser(c.user_id))], true));
    }
  }
}

async function refreshOnline(): Promise<void> {
  const ids = friends.list.filter((c) => c.kind === 'friend').map((c) => c.user_id);
  if (!ids.length || !friendsPanel.queryOnline) return;
  try {
    online = await friendsPanel.queryOnline(ids);
    if (isOpen()) render();
  } catch {
    // Not connected right now: everyone shows as offline
  }
}

function isOpen(): boolean {
  return panel.style.display === 'flex';
}

function close(): void {
  panel.style.display = 'none';
}

export function openFriends(): void {
  errorText.textContent = '';
  if ($('wardrobe').style.display === 'flex') $('wardrobe-cancel').click();
  cancelDecorate();
  $('shop').style.display = 'none';
  $('pets').style.display = 'none';
  $('prop').style.display = 'none';
  panel.style.display = 'flex';
  render();
  void Promise.all([
    loadFriends().catch((err) => (errorText.textContent = (err as Error).message)),
    getMyRoomVisibility().then((v) => (visibility = v)),
  ]).then(() => refreshOnline().then(() => isOpen() && render()));
}

closeBtn.addEventListener('click', close);

onFriendsChange(() => {
  if (isOpen()) {
    render();
    void refreshOnline();
  }
});

// Check for new friend requests now and then, and show a dot on the button
const friendsBtn = $<HTMLButtonElement>('friends-btn');
function updateBadge(): void {
  const n = friends.list.filter((c) => c.kind === 'incoming').length;
  friendsBtn.textContent = n ? 'Friends (' + n + ')' : 'Friends';
}
onFriendsChange(updateBadge);

export function startFriendRequestChecks(): void {
  const check = () => void loadFriends().catch(() => undefined);
  check();
  window.setInterval(check, 60_000);
}
