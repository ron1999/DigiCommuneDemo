import { Client, Room } from 'colyseus.js';

export interface PlayerInfo {
  id: string;
  name: string;
  x: number;
  y: number;
}

// In development the server runs on the same computer (or the same Wi-Fi network
// when testing on a phone). In production set VITE_SERVER_URL.
function serverUrl(): string {
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fromEnv) return fromEnv;
  return 'ws://' + window.location.hostname + ':2567';
}

// The server checks the login token and decides our username itself.
export async function connectToTown(token: string): Promise<Room> {
  const client = new Client(serverUrl());
  return client.joinOrCreate('town', { token });
}
