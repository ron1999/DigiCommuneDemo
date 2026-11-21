import Phaser from 'phaser';
import type { Room } from 'colyseus.js';
import {
  CAMERA_ZOOM,
  MAP_H,
  MAP_W,
  PLAYER_SPEED,
  TILE_SIZE,
} from '../config';
import { BLOCKED_TILES, SPAWN, buildTownMap } from '../world/townMap';
import { createTilesetTexture } from '../world/tileset';
import { NameTag } from '../entities/NameTag';
import { RemotePlayer } from '../entities/RemotePlayer';
import { connectToTown } from '../net/network';
import type { PlayerInfo } from '../net/network';
import { chat } from '../ui/chat';
import { wardrobe } from '../ui/wardrobe';
import { getAccessToken, logOut, saveAvatar } from '../auth';
import { session } from '../session';
import { ensureAvatarTexture } from '../avatar/textures';
import type { Avatar } from '../avatar/avatar';

export interface JoystickState {
  x: number;
  y: number;
}

const SEND_INTERVAL_MS = 66; // about 15 position updates per second
const KICKED_CODE = 4001; // the server uses this when the same account logs in elsewhere

export class TownScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private localTag!: NameTag;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;

  private room: Room | null = null;
  private remotes = new Map<string, RemotePlayer>();
  private lastSentAt = 0;
  private lastSentX = 0;
  private lastSentY = 0;

  private reconnectAttempts = 0;
  private connecting = false;
  private kicked = false;
  private shuttingDown = false;

  // Phones pause pages in the background and drop the connection; reconnect when back.
  private onVisible = (): void => {
    if (!document.hidden && !this.room && !this.kicked) void this.connect();
  };

  constructor() {
    super('TownScene');
  }

  create(): void {
    createTilesetTexture(this);

    // Build the tile map from data
    const map = this.make.tilemap({
      data: buildTownMap(),
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });
    const tileset = map.addTilesetImage('tiles', 'tiles', TILE_SIZE, TILE_SIZE, 0, 0)!;
    const layer = map.createLayer(0, tileset, 0, 0)!;
    layer.setCollision(BLOCKED_TILES);

    const worldW = MAP_W * TILE_SIZE;
    const worldH = MAP_H * TILE_SIZE;
    this.physics.world.setBounds(0, 0, worldW, worldH);

    // Local player, drawn with the saved look
    this.player = this.physics.add.sprite(
      SPAWN.x * TILE_SIZE,
      SPAWN.y * TILE_SIZE,
      ensureAvatarTexture(this, session.avatar),
    );
    this.player.setCollideWorldBounds(true);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(14, 10);
    body.setOffset(5, 22);
    this.physics.add.collider(this.player, layer);
    this.localTag = new NameTag(this, session.name);

    // Camera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, worldW, worldH);
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.setZoom(CAMERA_ZOOM);
    cam.roundPixels = true;

    // Keyboard: arrow keys and WASD
    const keyboard = this.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.wasd = keyboard.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;

    // Turn game keys off while typing in the chat box
    chat.onFocusChange = (focused) => {
      keyboard.enabled = !focused;
      if (focused) keyboard.resetKeys();
    };
    chat.onSend = (text) => this.room?.send('chat', { text });

    // Wardrobe: preview changes on the character right away, save to the account on Save
    wardrobe.onPreview = (a: Avatar) => {
      this.player.setTexture(ensureAvatarTexture(this, a));
    };
    wardrobe.onSave = async (a: Avatar) => {
      await saveAvatar(a);
      session.avatar = a;
      this.player.setTexture(ensureAvatarTexture(this, a));
      this.room?.send('avatar', { avatar: a });
    };

    // Shared state for the UI overlay
    const joy: JoystickState = { x: 0, y: 0 };
    this.registry.set('joy', joy);
    this.registry.set('status', 'Connecting...');
    this.scene.launch('UIScene');

    document.addEventListener('visibilitychange', this.onVisible);

    this.events.once('shutdown', () => {
      this.shuttingDown = true;
      document.removeEventListener('visibilitychange', this.onVisible);
      chat.onFocusChange = null;
      chat.onSend = null;
      wardrobe.onPreview = null;
      wardrobe.onSave = null;
      this.room?.leave();
    });

    void this.connect();
  }

  private async connect(): Promise<void> {
    if (this.connecting || this.room || this.kicked || this.shuttingDown) return;
    this.connecting = true;
    this.registry.set('status', this.reconnectAttempts > 0 ? 'Reconnecting...' : 'Connecting...');

    try {
      const token = await getAccessToken();
      if (!token) throw Object.assign(new Error('Not logged in'), { code: 401 });
      const room = await connectToTown(token);

      // Start fresh: the server tells us who is here
      this.clearRemotes();
      this.room = room;
      this.reconnectAttempts = 0;

      room.onMessage('init', (data: { id: string; players: PlayerInfo[] }) => {
        data.players.forEach((p) => this.addRemote(p));
        this.updateStatus();
      });
      room.onMessage('joined', (p: PlayerInfo) => {
        this.addRemote(p);
        this.updateStatus();
      });
      room.onMessage('moved', (m: { id: string; x: number; y: number }) => {
        this.remotes.get(m.id)?.setTarget(m.x, m.y);
      });
      room.onMessage('avatar', (m: { id: string; avatar: Avatar }) => {
        this.remotes.get(m.id)?.setAvatar(m.avatar);
      });
      room.onMessage('chat', (m: { id: string; text: string }) => {
        if (m.id === room.sessionId) this.localTag.say(m.text);
        else this.remotes.get(m.id)?.tag.say(m.text);
      });
      room.onMessage('left', (m: { id: string }) => {
        this.remotes.get(m.id)?.destroy();
        this.remotes.delete(m.id);
        this.updateStatus();
      });
      room.onLeave((code: number) => {
        if (this.shuttingDown) return;
        if (this.room === room) this.room = null;
        this.clearRemotes();
        if (code === KICKED_CODE) {
          this.kicked = true;
          this.registry.set('status', session.name + ' is open in another window');
          return;
        }
        this.scheduleReconnect();
      });

      // Tell the server where we really are (it starts everyone at the town centre),
      // then ask who is already here.
      this.lastSentX = this.player.x;
      this.lastSentY = this.player.y;
      room.send('move', { x: Math.round(this.player.x), y: Math.round(this.player.y) });
      room.send('ready');
      this.updateStatus();
    } catch (err) {
      console.error('Could not connect to the server', err);
      const code = (err as { code?: number | string }).code;
      if (code === 401) {
        // Login expired or invalid: sign out and show the login screen again
        await logOut();
        window.location.reload();
        return;
      }
      const msg = (err as { message?: string }).message;
      if (code === 500 && msg) {
        this.registry.set('status', 'Server error: ' + msg);
      } else if (code === 'TIMEOUT') {
        this.scheduleReconnect('No reply from server');
      } else {
        this.scheduleReconnect('Cannot reach server');
      }
    } finally {
      this.connecting = false;
    }
  }

  private scheduleReconnect(reason?: string): void {
    if (this.kicked || this.shuttingDown) return;
    this.reconnectAttempts++;
    const delay = Math.min(1000 * this.reconnectAttempts, 8000);
    this.registry.set('status', reason ? reason + ' - retrying' : 'Reconnecting...');
    this.time.delayedCall(delay, () => void this.connect());
  }

  private clearRemotes(): void {
    this.remotes.forEach((r) => r.destroy());
    this.remotes.clear();
  }

  private addRemote(info: PlayerInfo): void {
    if (this.remotes.has(info.id)) return;
    this.remotes.set(info.id, new RemotePlayer(this, info));
  }

  private updateStatus(): void {
    this.registry.set('status', session.name + ' | Online: ' + (this.remotes.size + 1));
  }

  update(time: number): void {
    let vx = 0;
    let vy = 0;

    if (this.cursors.left.isDown || this.wasd.A.isDown) vx -= 1;
    if (this.cursors.right.isDown || this.wasd.D.isDown) vx += 1;
    if (this.cursors.up.isDown || this.wasd.W.isDown) vy -= 1;
    if (this.cursors.down.isDown || this.wasd.S.isDown) vy += 1;

    // Touch joystick overrides keyboard while it is being used
    const joy = this.registry.get('joy') as JoystickState | undefined;
    if (joy && (joy.x !== 0 || joy.y !== 0)) {
      vx = joy.x;
      vy = joy.y;
    }

    // Keep diagonal movement from being faster
    const len = Math.hypot(vx, vy);
    if (len > 1) {
      vx /= len;
      vy /= len;
    }

    this.player.setVelocity(vx * PLAYER_SPEED, vy * PLAYER_SPEED);
    this.player.setDepth(this.player.y);
    this.localTag.follow(this.player.x, this.player.y);

    // Tell the server where we are (only when we moved)
    if (this.room && time - this.lastSentAt > SEND_INTERVAL_MS) {
      const moved =
        Math.abs(this.player.x - this.lastSentX) > 0.5 ||
        Math.abs(this.player.y - this.lastSentY) > 0.5;
      if (moved) {
        this.lastSentX = this.player.x;
        this.lastSentY = this.player.y;
        this.lastSentAt = time;
        this.room.send('move', {
          x: Math.round(this.player.x),
          y: Math.round(this.player.y),
        });
      }
    }

    this.remotes.forEach((r) => r.update());
  }
}
