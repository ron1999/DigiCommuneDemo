// Who is online right now, and where. Shared by every room in this server process.
// (One server process is plenty for the test version. With several servers this would
// need Colyseus' Redis presence instead.)

export type Where = 'town' | 'home' | 'visiting';

interface Entry {
  sessionId: string;
  where: Where;
}

const online = new Map<string, Entry>(); // account id -> where they are

export function setOnline(userId: string, sessionId: string, where: Where): void {
  online.set(userId, { sessionId, where });
}

// Only clears it if this connection is still the latest one for that account
export function setOffline(userId: string, sessionId: string): void {
  if (online.get(userId)?.sessionId === sessionId) online.delete(userId);
}

export function lookup(userIds: string[]): Record<string, Where | null> {
  const out: Record<string, Where | null> = {};
  for (const id of userIds) out[id] = online.get(id)?.where ?? null;
  return out;
}
