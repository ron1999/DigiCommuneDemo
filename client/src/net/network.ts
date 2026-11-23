import { Client, Room } from 'colyseus.js';
import type { Avatar } from '../avatar/avatar';
import type { PetInfo } from '../pets/species';

// Where a player is: the shared town, someone's home (by account id),
// or a house or shop in town (by property id)
export type Place = { kind: 'town' } | { kind: 'home'; owner: string } | { kind: 'property'; id: number };

export interface PlayerInfo {
  id: string;
  name: string;
  x: number;
  y: number;
  avatar: Avatar;
  pet?: PetInfo | null;
}

// In development the server runs on the same computer (or the same Wi-Fi network
// when testing on a phone). In production set VITE_SERVER_URL.
export function serverUrl(): string {
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fromEnv) return fromEnv;
  return 'ws://' + window.location.hostname + ':2567';
}

// The server checks the login token and decides our username and look itself.
// If nothing answers within a few seconds we give up (and the game retries),
// instead of sitting on "Connecting..." forever.
export async function connectToPlace(
  token: string,
  place: Place,
  timeoutMs = 10000,
): Promise<Room> {
  const url = serverUrl();
  const client = new Client(url);

  let timer: number | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = window.setTimeout(() => {
      reject(Object.assign(new Error('Timed out reaching ' + url), { code: 'TIMEOUT' }));
    }, timeoutMs);
  });

  try {
    const join =
      place.kind === 'home'
        ? client.joinOrCreate('home', { token, owner: place.owner })
        : place.kind === 'property'
          ? client.joinOrCreate('property', { token, property: place.id })
          : client.joinOrCreate('town', { token });
    return await Promise.race([join, timeout]);
  } finally {
    window.clearTimeout(timer);
  }
}
