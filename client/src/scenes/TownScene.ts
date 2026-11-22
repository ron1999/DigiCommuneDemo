import Phaser from 'phaser';
import type { Room } from 'colyseus.js';
import { CAMERA_ZOOM, MAP_H, MAP_W, PLAYER_SPEED, TILE_SIZE } from '../config';
import { BLOCKED_TILES, SPAWN, T, buildTownMap } from '../world/townMap';
import { createTilesetTexture } from '../world/tileset';
import { createFurnitureTextures, furnitureTextureKey } from '../world/furniture';
import {
  SLOT_SIZE,
  WALKABLE_SLOTS,
  buildRoomMap,
  furnitureById,
  roomSpawn,
  templateById,
} from '../world/rooms';
import type { RoomLayout } from '../world/rooms';
import { NameTag } from '../entities/NameTag';
import { PetFollower } from '../entities/PetFollower';
import { activePet, onPetsChange } from '../pets/pets';
import { petsPanel } from '../ui/petsPanel';
import { friendsPanel } from '../ui/friendsPanel';
import type { Where } from '../ui/friendsPanel';
import { getRoom } from '../friends';
import { RemotePlayer } from '../entities/RemotePlayer';
import { connectToPlace } from '../net/network';
import type { Place, PlayerInfo } from '../net/network';
import { chat } from '../ui/chat';
import { wardrobe } from '../ui/wardrobe';
import { cancelDecorate, decorate, openDecorate } from '../ui/decorate';
import { toast } from '../ui/hud';
import { getAccessToken, logOut, saveAvatar } from '../auth';
import { loadMyRoom, myUserId, saveMyRoom } from '../room';
import { session } from '../session';
import { animateCharacter, ensureAvatarTexture, setupCharacterSprite } from '../avatar/textures';
import { FEET_Y, headHeightFor } from '../avatar/sprites';
import type { Direction } from '../avatar/sprites';
import type { Avatar } from '../avatar/avatar';

export interface JoystickState {
  x: number;
  y: number;
}

// What the scene is started with. Travelling between places restarts the scene with new data.
export interface PlaceData {
  place?: Place;
  room?: RoomLayout; // for homes: what the room looks like
  mine?: boolean; // for homes: is it your own room?
  ownerName?: string; // for homes: whose room it is
  spawn?: { x: number; y: number }; // tile to appear on (town only)
}

const SEND_INTERVAL_MS = 66; // about 15 position updates per second
const KICKED_CODE = 4001; // the server uses this when the same account logs in elsewhere
const REMOVED_CODE = 4002; // the room's owner asked us to leave

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class TownScene extends Phaser.Scene {
  private place: Place = { kind: 'town' };
  private layout: RoomLayout | null = null; // homes only
  private mine = false; // at home: is it our own room?
  private ownerName = '';
  private onlineWaiters: ((places: Record<string, Where>) => void)[] = [];

  private player!: Phaser.Physics.Arcade.Sprite;
  private playerKey = '';
  private facing: Direction = 'down';
  private localTag!: NameTag;
  private pet: PetFollower | null = null;
  private petKey = ''; // which pet the follower shows, to spot changes
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;

  private map: Phaser.Tilemaps.Tilemap | null = null;
  private layer: Phaser.Tilemaps.TilemapLayer | null = null;
  private furniture: Phaser.Physics.Arcade.StaticGroup | null = null; // furniture you bump into
  private decor: Phaser.GameObjects.Image[] = []; // rugs and wall art (no collision)
  private colliders: Phaser.Physics.Arcade.Collider[] = [];

  private room: Room | null = null;
  private remotes = new Map<string, RemotePlayer>();
  private lastSentAt = 0;
  private lastSentX = 0;
  private lastSentY = 0;

  private reconnectAttempts = 0;
  private connecting = false;
  private kicked = false;
  private shuttingDown = false;
  private travelling = false;

  // Where to put you back in town when you leave your home (the door you came in by)
  private static townReturn: { x: number; y: number } | null = null;

  // Phones pause pages in the background and drop the connection; reconnect when back.
  private onVisible = (): void => {
    if (!document.hidden && !this.room && !this.kicked) void this.connect();
  };

  constructor() {
    super('TownScene');
  }

  create(data: PlaceData = {}): void {
    // The scene object is reused when travelling, so reset everything
    this.place = data.place ?? { kind: 'town' };
    this.layout = this.place.kind === 'home' ? (data.room ?? null) : null;
    this.mine = this.place.kind === 'home' && data.mine !== false;
    this.ownerName = data.ownerName ?? '';
    this.onlineWaiters = [];
    this.room = null;
    this.remotes = new Map();
    this.reconnectAttempts = 0;
    this.connecting = false;
    this.kicked = false;
    this.shuttingDown = false;
    this.travelling = false;
    this.facing = 'down';
    this.map = null;
    this.layer = null;
    this.furniture = null;
    this.decor = [];
    this.colliders = [];

    createTilesetTexture(this);
    createFurnitureTextures(this);

    // Local player, drawn with the saved look. Its position is where its feet are.
    this.playerKey = ensureAvatarTexture(this, session.avatar);
    this.player = this.physics.add.sprite(0, 0, this.playerKey, 0);
    setupCharacterSprite(this.player);
    this.player.setCollideWorldBounds(true);
    // Collision box: a small area around the feet, so you can walk in front of walls
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(36, 16);
    body.setOffset(46, FEET_Y - 14);
    this.localTag = new NameTag(this, session.name);
    this.localTag.setHeadHeight(headHeightFor(session.avatar));

    this.buildPlace(data.spawn);

    // Your pet follows you (pets may finish loading after the scene starts)
    this.pet = null;
    this.petKey = '';
    this.syncPet();
    const stopListening = onPetsChange(() => this.syncPet());
    petsPanel.onChanged = () => void this.tellServerAboutMe();

    const cam = this.cameras.main;
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.setZoom(CAMERA_ZOOM);
    cam.roundPixels = true;
    cam.setBackgroundColor(this.place.kind === 'home' ? '#2a211b' : '#1d2b1d');

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
      this.playerKey = ensureAvatarTexture(this, a);
      this.localTag.setHeadHeight(headHeightFor(a));
    };
    wardrobe.onSave = async (a: Avatar) => {
      await saveAvatar(a);
      session.avatar = a;
      this.playerKey = ensureAvatarTexture(this, a);
      this.localTag.setHeadHeight(headHeightFor(a));
      await this.tellServerAboutMe();
    };

    // Decorate (homes only): preview furniture right away, save on Save
    decorate.iconFor = (id) => {
      const f = furnitureById(id);
      return f ? (this.textures.get(furnitureTextureKey(f)).getSourceImage() as HTMLCanvasElement) : null;
    };
    decorate.onPreview = (layout) => this.applyLayout(layout);
    decorate.onSave = async (layout) => {
      const saved = await saveMyRoom(layout);
      this.applyLayout(saved);
      this.room?.send('roomChanged'); // visitors see the new furniture
      toast('Room saved!');
    };

    // Friends panel
    friendsPanel.onVisit = (ownerId) => void this.visitRoom(ownerId);
    friendsPanel.queryOnline = (ids) => this.queryOnline(ids);
    friendsPanel.guests = () =>
      this.mine ? Array.from(this.remotes.entries()).map(([id, r]) => ({ id, name: r.name })) : [];
    friendsPanel.onRemoveGuest = (id) => this.room?.send('removeVisitor', { id });

    this.setupTopbar();

    // Shared state for the UI overlay
    if (!this.registry.has('joy')) this.registry.set('joy', { x: 0, y: 0 } as JoystickState);
    this.registry.set('status', 'Connecting...');
    if (!this.scene.isActive('UIScene')) this.scene.launch('UIScene');

    document.addEventListener('visibilitychange', this.onVisible);

    this.events.once('shutdown', () => {
      this.shuttingDown = true;
      document.removeEventListener('visibilitychange', this.onVisible);
      chat.onFocusChange = null;
      chat.onSend = null;
      wardrobe.onPreview = null;
      wardrobe.onSave = null;
      decorate.onPreview = null;
      decorate.onSave = null;
      petsPanel.onChanged = null;
      friendsPanel.onVisit = null;
      friendsPanel.queryOnline = null;
      friendsPanel.guests = null;
      friendsPanel.onRemoveGuest = null;
      this.onlineWaiters.forEach((w) => w({}));
      stopListening();
      const room = this.room;
      this.room = null;
      room?.leave();
    });

    void this.connect();
  }

  // The server re-reads our saved look and pet from the database, so they can't be faked
  private async tellServerAboutMe(): Promise<void> {
    const token = await getAccessToken();
    if (token) this.room?.send('avatar', { token });
  }

  // Makes the follower match the active pet in the pets list
  private syncPet(): void {
    const p = activePet();
    const key = p ? p.species + ':' + p.name : '';
    if (key === this.petKey) return;
    this.petKey = key;
    if (!p) {
      this.pet?.destroy();
      this.pet = null;
    } else if (this.pet) {
      this.pet.setPet(p);
    } else {
      this.pet = new PetFollower(this, p, this.player.x - 40, this.player.y + 8);
    }
  }

  // ---------- building the town or a room ----------

  private placeSize(): { w: number; h: number } {
    if (this.place.kind === 'home' && this.layout) {
      const t = templateById(this.layout.template);
      return { w: t.w, h: t.h };
    }
    return { w: MAP_W, h: MAP_H };
  }

  // (Re)builds the tiles and furniture, and puts the player on the spawn tile
  private buildPlace(spawn?: { x: number; y: number }): void {
    this.colliders.forEach((c) => c.destroy());
    this.colliders = [];
    this.layer?.destroy();
    this.map?.destroy();
    this.clearFurniture();

    const isHome = this.place.kind === 'home' && this.layout;
    const template = isHome ? templateById(this.layout!.template) : null;
    const data = template ? buildRoomMap(template) : buildTownMap();

    this.map = this.make.tilemap({ data, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const tileset = this.map.addTilesetImage('tiles', 'tiles', TILE_SIZE, TILE_SIZE, 0, 0)!;
    this.layer = this.map.createLayer(0, tileset, 0, 0)!;
    this.layer.setCollision(BLOCKED_TILES);

    const size = this.placeSize();
    const worldW = size.w * TILE_SIZE;
    const worldH = size.h * TILE_SIZE;
    this.physics.world.setBounds(0, 0, worldW, worldH);
    // The town scrolls with you; small rooms just stay centred
    if (isHome) this.cameras.main.removeBounds();
    else this.cameras.main.setBounds(0, 0, worldW, worldH);

    this.furniture = this.physics.add.staticGroup();
    if (template) this.placeFurniture();

    const tile = spawn ?? (template ? roomSpawn(template) : SPAWN);
    this.player.setPosition(tile.x * TILE_SIZE + TILE_SIZE / 2, tile.y * TILE_SIZE + TILE_SIZE / 2);
    this.player.setVelocity(0, 0);

    this.colliders.push(this.physics.add.collider(this.player, this.layer));
    this.colliders.push(this.physics.add.collider(this.player, this.furniture));
  }

  private placeFurniture(): void {
    if (!this.layout || !this.furniture) return;
    const template = templateById(this.layout.template);
    for (const slot of template.slots) {
      const f = furnitureById(this.layout.slots[slot.name]);
      if (!f) continue;
      const size = SLOT_SIZE[f.type];
      const x = slot.x * TILE_SIZE;
      const y = slot.y * TILE_SIZE;

      if (WALKABLE_SLOTS.includes(f.type)) {
        // Rugs and wall art: just a picture, drawn under the players
        this.decor.push(this.add.image(x, y, furnitureTextureKey(f)).setOrigin(0, 0).setDepth(1));
      } else {
        const img = this.furniture.create(x, y, furnitureTextureKey(f)) as Phaser.Physics.Arcade.Image;
        img.setOrigin(0, 0).refreshBody();
        // Sort with players by the furniture's bottom edge, so you can stand in front of it
        img.setDepth(y + size.h * TILE_SIZE);
      }
    }
  }

  // Shows a different room layout (Decorate preview or after saving)
  private applyLayout(layout: RoomLayout): void {
    if (this.place.kind !== 'home') return;
    const templateChanged = !this.layout || this.layout.template !== layout.template;
    this.layout = layout;
    if (templateChanged) {
      this.buildPlace();
      this.sendPosition(true);
    } else {
      this.clearFurniture();
      this.placeFurniture();
    }
  }

  private clearFurniture(): void {
    this.furniture?.clear(true, true);
    this.decor.forEach((d) => d.destroy());
    this.decor = [];
  }

  // ---------- travelling between the town and your home ----------

  private setupTopbar(): void {
    const placeBtn = $<HTMLButtonElement>('place-btn');
    const decorateBtn = $<HTMLButtonElement>('decorate-btn');
    const atHome = this.place.kind === 'home';
    placeBtn.textContent = atHome ? 'Town' : 'Home';
    placeBtn.onclick = () => (atHome ? this.goToTown() : void this.goHome());
    decorateBtn.style.display = atHome && this.mine ? 'inline-block' : 'none';
    decorateBtn.onclick = () => {
      if (this.layout) openDecorate(this.layout);
    };
  }

  private async goHome(returnTile?: { x: number; y: number }): Promise<void> {
    if (this.travelling) return;
    this.travelling = true;
    this.player.setVelocity(0, 0);
    this.registry.set('status', 'Going home...');
    try {
      const [owner, room] = await Promise.all([myUserId(), loadMyRoom()]);
      this.rememberTownSpot(returnTile);
      this.scene.restart({ place: { kind: 'home', owner }, room, mine: true } satisfies PlaceData);
    } catch (err) {
      console.error('Could not load your room', err);
      toast('Could not load your room: ' + (err as Error).message);
      this.travelling = false;
      this.updateStatus();
    }
  }

  // Visit someone else's room (the database and the server check you're allowed)
  private async visitRoom(ownerId: string): Promise<void> {
    if (this.travelling) return;
    if (ownerId === (await myUserId())) return this.goHome();
    this.travelling = true;
    this.player.setVelocity(0, 0);
    cancelDecorate();
    this.registry.set('status', 'Visiting...');
    try {
      const { ownerName, layout } = await getRoom(ownerId);
      this.rememberTownSpot();
      this.scene.restart({
        place: { kind: 'home', owner: ownerId },
        room: layout,
        mine: false,
        ownerName,
      } satisfies PlaceData);
    } catch (err) {
      toast((err as Error).message);
      this.travelling = false;
      this.updateStatus();
    }
  }

  // Where to come back out in town (only when leaving the town itself)
  private rememberTownSpot(tile?: { x: number; y: number }): void {
    if (this.place.kind === 'town') TownScene.townReturn = tile ?? this.currentTile();
  }

  // Asks the server which of these accounts are online, and where
  private queryOnline(ids: string[]): Promise<Record<string, Where>> {
    const room = this.room;
    if (!room) return Promise.reject(new Error('Not connected'));
    return new Promise((resolve) => {
      this.onlineWaiters.push(resolve);
      room.send('online', { ids });
      this.time.delayedCall(5000, () => {
        const i = this.onlineWaiters.indexOf(resolve);
        if (i >= 0) {
          this.onlineWaiters.splice(i, 1);
          resolve({});
        }
      });
    });
  }

  private goToTown(): void {
    if (this.travelling) return;
    this.travelling = true;
    cancelDecorate();
    this.scene.restart({ place: { kind: 'town' }, spawn: TownScene.townReturn ?? undefined } satisfies PlaceData);
  }

  private currentTile(): { x: number; y: number } {
    return {
      x: Math.floor(this.player.x / TILE_SIZE),
      y: Math.floor(this.player.y / TILE_SIZE),
    };
  }

  // Walking onto a door goes home; walking onto the doormat at home goes back to town
  private checkDoors(): void {
    if (this.travelling || !this.layer) return;
    const { x, y } = this.currentTile();
    const tile = this.layer.getTileAt(x, y);
    if (!tile) return;

    if (this.place.kind === 'town' && tile.index === T.DOOR) {
      // Come back out on the walkable side of this door
      const below = this.layer.getTileAt(x, y + 1);
      const out = below && !BLOCKED_TILES.includes(below.index) ? { x, y: y + 1 } : { x, y: y - 1 };
      void this.goHome(out);
    } else if (this.place.kind === 'home' && tile.index === T.DOORMAT) {
      this.goToTown();
    }
  }

  // ---------- networking ----------

  private async connect(): Promise<void> {
    if (this.connecting || this.room || this.kicked || this.shuttingDown) return;
    this.connecting = true;
    this.registry.set('status', this.reconnectAttempts > 0 ? 'Reconnecting...' : 'Connecting...');

    try {
      const token = await getAccessToken();
      if (!token) throw Object.assign(new Error('Not logged in'), { code: 401 });
      const room = await connectToPlace(token, this.place);

      // The player may have left this place while we were connecting
      if (this.shuttingDown) {
        room.leave();
        return;
      }

      // Start fresh: the server tells us who is here
      this.clearRemotes();
      this.room = room;
      this.reconnectAttempts = 0;

      // Ignore anything from a connection we've already replaced
      const current = () => this.room === room;

      room.onMessage('init', (data: { id: string; players: PlayerInfo[] }) => {
        if (!current()) return;
        data.players.forEach((p) => this.addRemote(p));
        this.updateStatus();
      });
      room.onMessage('joined', (p: PlayerInfo) => {
        if (!current()) return;
        this.addRemote(p);
        this.updateStatus();
      });
      room.onMessage('moved', (m: { id: string; x: number; y: number }) => {
        if (current()) this.remotes.get(m.id)?.setTarget(m.x, m.y);
      });
      room.onMessage('avatar', (m: { id: string; avatar: Avatar }) => {
        if (current()) this.remotes.get(m.id)?.setAvatar(m.avatar);
      });
      room.onMessage('pet', (m: { id: string; pet: unknown }) => {
        if (current()) this.remotes.get(m.id)?.setPet(m.pet);
      });
      room.onMessage('online', (m: { places: Record<string, Where> }) => {
        this.onlineWaiters.shift()?.(m.places ?? {});
      });
      room.onMessage('roomChanged', () => {
        // The owner redecorated while we're visiting
        if (!current() || this.mine || this.place.kind !== 'home') return;
        void getRoom(this.place.owner)
          .then(({ layout }) => this.applyLayout(layout))
          .catch(() => undefined);
      });
      room.onMessage('chat', (m: { id: string; text: string }) => {
        if (!current()) return;
        if (m.id === room.sessionId) this.localTag.say(m.text);
        else this.remotes.get(m.id)?.tag.say(m.text);
      });
      room.onMessage('left', (m: { id: string }) => {
        if (!current()) return;
        this.remotes.get(m.id)?.destroy();
        this.remotes.delete(m.id);
        this.updateStatus();
      });
      room.onLeave((code: number) => {
        if (this.shuttingDown || !current()) return;
        this.room = null;
        this.clearRemotes();
        if (code === REMOVED_CODE) {
          toast(this.ownerName + ' asked you to leave their room');
          this.goToTown();
          return;
        }
        if (code === KICKED_CODE) {
          this.kicked = true;
          this.registry.set('status', session.name + ' is open in another window');
          return;
        }
        this.scheduleReconnect();
      });

      // Tell the server where we really are, then ask who is already here.
      this.sendPosition(true);
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
      if (code === 403 && this.place.kind === 'home') {
        // Not allowed in (any more): back to town
        toast(msg ?? 'You can\'t visit that room');
        this.goToTown();
        return;
      }
      if ((code === 500 || code === 403) && msg) {
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

  private sendPosition(force = false): void {
    if (!this.room) return;
    const moved =
      Math.abs(this.player.x - this.lastSentX) > 0.5 || Math.abs(this.player.y - this.lastSentY) > 0.5;
    if (!moved && !force) return;
    this.lastSentX = this.player.x;
    this.lastSentY = this.player.y;
    this.room.send('move', { x: Math.round(this.player.x), y: Math.round(this.player.y) });
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
    const where = this.place.kind === 'home' ? (this.mine ? 'Your room' : this.ownerName + "'s room") : 'Town';
    this.registry.set('status', session.name + ' | ' + where + ' | Online: ' + (this.remotes.size + 1));
  }

  update(time: number, delta: number): void {
    let vx = 0;
    let vy = 0;

    if (!this.travelling) {
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
    }

    // Keep diagonal movement from being faster
    const len = Math.hypot(vx, vy);
    if (len > 1) {
      vx /= len;
      vy /= len;
    }

    this.player.setVelocity(vx * PLAYER_SPEED, vy * PLAYER_SPEED);
    this.facing = animateCharacter(this.player, this.playerKey, vx, vy, this.facing);
    this.player.setDepth(this.player.y);
    this.localTag.follow(this.player.x, this.player.y);

    // Tell the server where we are (only when we moved)
    if (this.room && time - this.lastSentAt > SEND_INTERVAL_MS) {
      this.lastSentAt = time;
      this.sendPosition();
    }

    this.pet?.update(this.player.x, this.player.y, delta);
    this.remotes.forEach((r) => r.update(delta));
    if (vx !== 0 || vy !== 0) this.checkDoors();
  }
}
