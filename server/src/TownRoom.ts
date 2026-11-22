import { Room, Client, ServerError } from 'colyseus';
import { verifyToken, type PetInfo, type VerifiedUser } from './auth';
import { sanitizeAvatar, type Avatar } from './avatar';

// Must match the client's map size (40 x 30 tiles of 64px, client/src/config.ts) and spawn point.
const TILE = 64;
const TOWN = { w: 40 * TILE, h: 30 * TILE, spawnX: 20 * TILE, spawnY: 15 * TILE };
// Homes: big enough for the largest room template (MAX_ROOM_W/H in client/src/world/rooms.ts)
const HOME = { w: 12 * TILE, h: 9 * TILE, spawnX: 6 * TILE, spawnY: 7 * TILE };

const MAX_CHAT_LENGTH = 120;
const CHAT_COOLDOWN_MS = 800;
const AVATAR_COOLDOWN_MS = 500;
const KICKED_CODE = 4001; // same account logged in somewhere else

interface PlayerData {
  id: string;
  name: string;
  x: number;
  y: number;
  avatar: Avatar;
  pet: PetInfo | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// One class runs both kinds of place:
//  - 'town': the shared town everyone joins
//  - 'home': one per player (options.owner = their account id). For now only the owner may enter;
//    visiting friends' rooms comes later.
export class TownRoom extends Room {
  maxClients = 100;

  private ownerId: string | null = null; // set for homes
  private bounds = TOWN;

  private players = new Map<string, PlayerData>(); // by session id
  private sessionByUser = new Map<string, string>(); // account id -> session id
  private userBySession = new Map<string, string>(); // session id -> account id
  private lastChatAt = new Map<string, number>();
  private lastAvatarAt = new Map<string, number>();

  // Runs before onJoin. Throwing here rejects the connection.
  async onAuth(_client: Client, options: any): Promise<VerifiedUser> {
    console.log('Join attempt received, checking login...');
    const token = typeof options?.token === 'string' ? options.token : '';
    if (!token) {
      console.log('Join rejected: no login token');
      throw new ServerError(401, 'Please log in');
    }

    let user: VerifiedUser | null;
    try {
      user = await verifyToken(token);
    } catch (err) {
      console.error('Login check failed:', err);
      const missing = err instanceof Error && err.message.includes('missing');
      throw new ServerError(
        500,
        missing ? 'server/.env is missing Supabase settings' : 'server could not reach Supabase',
      );
    }
    if (!user) {
      console.log('Join rejected: invalid or expired login token');
      throw new ServerError(401, 'Invalid or expired login');
    }
    if (this.ownerId && user.id !== this.ownerId) {
      console.log('Join rejected: ' + user.username + ' tried to enter someone else\'s room');
      throw new ServerError(403, 'That room is private');
    }
    console.log('Login OK for ' + user.username);
    return user;
  }

  onCreate(options: any): void {
    if (typeof options?.owner === 'string' && options.owner) {
      this.ownerId = options.owner;
      this.bounds = HOME;
      this.maxClients = 20;
    }

    // Client reports where it moved to (about 15 times per second while walking)
    this.onMessage('move', (client: Client, message: any) => {
      const p = this.players.get(client.sessionId);
      if (!p) return;
      if (!Number.isFinite(message?.x) || !Number.isFinite(message?.y)) return;

      p.x = clamp(message.x, 0, this.bounds.w);
      p.y = clamp(message.y, 0, this.bounds.h);
      this.broadcast('moved', { id: p.id, x: p.x, y: p.y }, { except: client });
    });

    this.onMessage('chat', (client: Client, message: any) => {
      if (!this.players.has(client.sessionId)) return;

      const raw = typeof message?.text === 'string' ? message.text : '';
      // eslint-disable-next-line no-control-regex
      const text = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_CHAT_LENGTH);
      if (!text) return;

      const now = Date.now();
      const last = this.lastChatAt.get(client.sessionId) ?? 0;
      if (now - last < CHAT_COOLDOWN_MS) return;
      this.lastChatAt.set(client.sessionId, now);

      this.broadcast('chat', { id: client.sessionId, text });
    });

    // Player changed their look or their pet (the client saves it to the database itself)
    // The client only sends its login token; we read the saved look from the database,
    // which has already checked that the player owns every item.
    this.onMessage('avatar', async (client: Client, message: any) => {
      const p = this.players.get(client.sessionId);
      if (!p) return;

      const now = Date.now();
      const last = this.lastAvatarAt.get(client.sessionId) ?? 0;
      if (now - last < AVATAR_COOLDOWN_MS) return;
      this.lastAvatarAt.set(client.sessionId, now);

      const token = typeof message?.token === 'string' ? message.token : '';
      try {
        const user = await verifyToken(token);
        if (!user || user.id !== this.userBySession.get(client.sessionId)) return;
        p.avatar = sanitizeAvatar(user.avatar);
        this.broadcast('avatar', { id: p.id, avatar: p.avatar }, { except: client });
        // The pet may have changed too (the client sends 'avatar' after any change)
        p.pet = user.pet;
        this.broadcast('pet', { id: p.id, pet: p.pet }, { except: client });
      } catch (err) {
        console.error('Avatar refresh failed:', err);
      }
    });

    // The client says "ready" once its message handlers are set up.
    // Then we send it everyone already here and announce it to the others.
    this.onMessage('ready', (client: Client) => {
      const me = this.players.get(client.sessionId);
      if (!me) return;
      const others = Array.from(this.players.values()).filter((p) => p.id !== me.id);
      client.send('init', { id: me.id, players: others });
      this.broadcast('joined', me, { except: client });
    });
  }

  onJoin(client: Client, _options?: any, auth?: VerifiedUser): void {
    // onAuth always returns a user or throws, so this is only a safety net
    if (!auth) {
      client.leave(4000);
      return;
    }
    // One connection per account: a new login replaces the old one
    const oldSession = this.sessionByUser.get(auth.id);
    if (oldSession) {
      this.clients.getById(oldSession)?.leave(KICKED_CODE);
    }

    const player: PlayerData = {
      id: client.sessionId,
      name: auth.username,
      x: this.bounds.spawnX,
      y: this.bounds.spawnY,
      avatar: sanitizeAvatar(auth.avatar),
      pet: auth.pet,
    };
    this.players.set(client.sessionId, player);
    this.sessionByUser.set(auth.id, client.sessionId);
    this.userBySession.set(client.sessionId, auth.id);
    console.log(player.name + ' joined (' + this.players.size + ' online)');
  }

  onLeave(client: Client): void {
    const p = this.players.get(client.sessionId);
    const userId = this.userBySession.get(client.sessionId);

    this.players.delete(client.sessionId);
    this.userBySession.delete(client.sessionId);
    this.lastChatAt.delete(client.sessionId);
    this.lastAvatarAt.delete(client.sessionId);
    // Only forget the account if it still points at this connection
    if (userId && this.sessionByUser.get(userId) === client.sessionId) {
      this.sessionByUser.delete(userId);
    }

    this.broadcast('left', { id: client.sessionId });
    if (p) console.log(p.name + ' left (' + this.players.size + ' online)');
  }
}
