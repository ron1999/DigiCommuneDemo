// The town's look: smooth ground, swaying trees and flowers, building pictures and golden-hour
// light. The plain tile layer in TownScene is still there for collision and doors; in town it is
// hidden and this draws over it. Room interiors don't use any of this.
//
// Art: client/public/world/ (built by scripts/build-world.mjs, see docs/ART_SPEC.md "World").
// Placement uses a fixed hash of the tile position, so every player sees the same town.

import Phaser from 'phaser';
import { MAP_H, MAP_W, TILE_SIZE } from '../config';
import { T } from './townMap';
import { PROPERTIES } from './properties';
import type { PropertySpot } from './properties';

interface DecorMeta {
  file: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  fps: number;
  originX: number;
  originY: number;
  glow: boolean;
}
interface BuildingMeta {
  file: string;
  width: number; // of one frame
  height: number;
  frames?: number; // animated: a horizontal strip of frames (vines swaying)
  fps?: number;
  doorX: number;
  baseY: number;
}
interface TerrainMeta {
  file: string;
  tiles: Record<string, number>;
}

const BASE = 'world/';
let meta: {
  decor: Record<string, DecorMeta>;
  buildings: Record<string, BuildingMeta>;
  grassPath: TerrainMeta;
  waterGrass: TerrainMeta;
} | null = null;
let loading: Promise<boolean> | null = null;

function addImage(
  tex: Phaser.Textures.TextureManager,
  key: string,
  file: string,
  sheet?: { frameWidth: number; frameHeight: number },
): Promise<void> {
  if (tex.exists(key)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (!tex.exists(key)) {
        if (sheet) tex.addSpriteSheet(key, img, sheet);
        else tex.addImage(key, img);
      }
      resolve();
    };
    img.onerror = () => reject(new Error('Missing ' + file));
    img.src = file;
  });
}

async function fetchJson<X>(file: string): Promise<X> {
  const r = await fetch(BASE + file);
  if (!r.ok) throw new Error('Missing ' + file);
  return (await r.json()) as X;
}

// Loads the art once (textures are shared by the whole game). Resolves false if it's missing,
// in which case the town just keeps the plain tiles.
export function loadTownArt(scene: Phaser.Scene): Promise<boolean> {
  if (!loading) {
    loading = (async () => {
      try {
        const [decor, buildings, grassPath, waterGrass] = await Promise.all([
          fetchJson<Record<string, DecorMeta>>('decor.json'),
          fetchJson<Record<string, BuildingMeta>>('buildings.json'),
          fetchJson<TerrainMeta>('terrain/grass-path.json'),
          fetchJson<TerrainMeta>('terrain/water-grass.json'),
        ]);
        // Plain image loading (not the scene loader, which may be busy with other files)
        const tex = scene.textures;
        await Promise.all([
          addImage(tex, 'terrain-gp', grassPath.file),
          addImage(tex, 'terrain-wg', waterGrass.file),
          ...Object.entries(decor).map(([name, d]) =>
            addImage(tex, 'decor-' + name, d.file, { frameWidth: d.frameWidth, frameHeight: d.frameHeight }),
          ),
          ...Object.entries(buildings).map(([id, b]) =>
            addImage(tex, 'building-' + id, b.file, (b.frames ?? 1) > 1 ? { frameWidth: b.width, frameHeight: b.height } : undefined),
          ),
        ]);
        for (const [name, d] of Object.entries(decor)) {
          if (d.frames > 1 && !scene.anims.exists('decor-' + name)) {
            scene.anims.create({
              key: 'decor-' + name,
              frames: scene.anims.generateFrameNumbers('decor-' + name, { start: 0, end: d.frames - 1 }),
              frameRate: d.fps,
              repeat: -1,
            });
          }
        }
        for (const [id, b] of Object.entries(buildings)) {
          const key = 'building-' + id;
          if ((b.frames ?? 1) > 1 && !scene.anims.exists(key)) {
            scene.anims.create({
              key,
              frames: scene.anims.generateFrameNumbers(key, { start: 0, end: b.frames! - 1 }),
              frameRate: b.fps ?? 5,
              repeat: -1,
            });
          }
        }
        makeLightTextures(scene);
        meta = { decor, buildings, grassPath, waterGrass };
        return true;
      } catch (err) {
        console.error('Town art not loaded', err);
        return false;
      }
    })();
  }
  return loading;
}

// ---------- placement helpers (same rules as scripts/art-src/world/preview/town-preview.mjs) ----------

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) / 4294967296;
}

function pick(list: [string, number][], r: number): string {
  let t = list.reduce((a, [, w]) => a + w, 0) * r;
  for (const [n, w] of list) if ((t -= w) < 0) return n;
  return list[0][0];
}

const TREES: [string, number][] = [
  ['tree-oak', 30], ['tree-blossom', 15], ['tree-solar', 12], ['tree-mushroom', 10],
  ['tree-willow', 8], ['bush-berry', 12], ['bush-hedge', 13],
];
const BORDER_TREES: [string, number][] = [['tree-oak', 45], ['tree-willow', 15], ['tree-blossom', 15], ['bush-hedge', 25]];
const SMALL: [string, number][] = [
  ['flowers-gold', 18], ['flowers-blue', 16], ['flowers-poppy', 16], ['mush-red', 10],
  ['mush-glow', 6], ['fern', 14], ['grass-tuft', 20],
];
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ---------- light textures (soft round gradients drawn once) ----------

function radial(scene: Phaser.Scene, key: string, size: number, stops: [number, string][]): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, size, size)!;
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
}

function makeLightTextures(scene: Phaser.Scene): void {
  radial(scene, 'gh-glow', 256, [[0, 'rgba(255,200,120,1)'], [1, 'rgba(255,200,120,0)']]);
  radial(scene, 'gh-vignette', 256, [[0.45, 'rgba(70,48,80,0)'], [1, 'rgba(70,48,80,1)']]);
  radial(scene, 'gh-pool', 128, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
}

// ---------- the town's look ----------

const OVERLAY_DEPTH = 9000; // above the world and signs, below name tags (10000)

export class TownArt {
  private ground: Phaser.Tilemaps.Tilemap | null = null;
  private things: Phaser.GameObjects.GameObject[] = []; // decor, lights
  private buildings: (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[] = [];
  private overlay: Phaser.GameObjects.Image[] = [];
  private buildingTops = new Map<number, number>(); // place id -> y of its picture's top edge
  private onResize = () => this.sizeOverlay();

  constructor(private scene: Phaser.Scene) {}

  // True once the art is in (otherwise the plain tiles stay visible)
  get ready(): boolean {
    return !!meta;
  }

  build(data: number[][], built: ReadonlySet<number>): void {
    if (!meta) return;
    this.drawGround(data);
    this.drawDecor(data);
    this.drawBuildings(built);
    this.drawOverlay();
  }

  // A lot was built or given back: redraw the ground and the buildings
  refresh(data: number[][], built: ReadonlySet<number>): void {
    if (!meta) return;
    this.drawGround(data);
    this.drawBuildings(built);
  }

  // Where a place's sign goes, if it has a building picture: just above the picture
  signY(spot: PropertySpot): number | undefined {
    return this.buildingTops.get(spot.id);
  }

  destroy(): void {
    this.ground?.destroy();
    this.ground = null;
    this.things.forEach((o) => o.destroy());
    this.things = [];
    this.buildings.forEach((o) => o.destroy());
    this.buildings = [];
    this.buildingTops.clear();
    this.overlay.forEach((o) => o.destroy());
    this.overlay = [];
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.onResize);
  }

  // Dual grid: each drawn ground tile sits on a tile CORNER and blends the 4 map tiles around it,
  // so path and water edges land exactly on tile borders.
  private drawGround(data: number[][]): void {
    const m = meta!;
    this.ground?.destroy();
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? T.GRASS : data[y][x]);
    const WG = 16; // water-grass frames come after the 16 grass-path frames
    const cells: number[][] = [];
    for (let cy = 0; cy <= MAP_H; cy++) {
      const row: number[] = [];
      for (let cx = 0; cx <= MAP_W; cx++) {
        const corners = [at(cx - 1, cy - 1), at(cx, cy - 1), at(cx - 1, cy), at(cx, cy)];
        if (corners.includes(T.WATER)) {
          const key = corners.map((t) => (t === T.WATER ? 0 : 1)).join('');
          row.push(WG + (m.waterGrass.tiles[key] ?? 0));
        } else {
          const key = corners.map((t) => (t === T.PATH || t === T.DOOR ? 0 : 1)).join('');
          row.push(m.grassPath.tiles[key] ?? 0);
        }
      }
      cells.push(row);
    }
    this.ground = this.scene.make.tilemap({ data: cells, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const gp = this.ground.addTilesetImage('gp', 'terrain-gp', TILE_SIZE, TILE_SIZE, 0, 0, 0)!;
    const wg = this.ground.addTilesetImage('wg', 'terrain-wg', TILE_SIZE, TILE_SIZE, 0, 0, WG)!;
    this.ground.createLayer(0, [gp, wg], -TILE_SIZE / 2, -TILE_SIZE / 2)!.setDepth(-10);
  }

  private drawDecor(data: number[][]): void {
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? T.GRASS : data[y][x]);
    const nearWater = (x: number, y: number) => SIDES.some(([a, b]) => at(x + a, y + b) === T.WATER);
    const place = (name: string, x: number, y: number) => this.addDecor(name, x * TILE_SIZE + TILE_SIZE / 2, (y + 1) * TILE_SIZE, hash(y, x));

    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const t = data[y][x];
        const r = hash(x, y);
        const border = x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1;
        let name: string | null = null;
        if (t === T.TREE) name = nearWater(x, y) ? 'tree-willow' : pick(border ? BORDER_TREES : TREES, r);
        else if (t === T.FLOWER) name = pick(SMALL, r);
        else if (t === T.GRASS && nearWater(x, y)) name = r < 0.22 ? 'reeds' : null;
        else if (t === T.GRASS) name = r < 0.035 ? 'grass-tuft' : null;
        else if (t === T.WATER && r < 0.12 && SIDES.every(([a, b]) => at(x + a, y + b) === T.WATER)) name = 'lilypads';
        if (name) place(name, x, y);
      }
    }
    // Lamps on the grass beside the main road (no collision)
    for (let x = 3; x < MAP_W - 2; x += 6) {
      for (const [lx, ly] of [[x, 13], [x + 3, 16]]) {
        const t = at(lx, ly);
        if (t === T.GRASS || t === T.FLOWER) place('lamp', lx, ly);
      }
    }
  }

  private addDecor(name: string, x: number, y: number, r: number): void {
    const d = meta!.decor[name];
    if (!d) return;
    const key = 'decor-' + name;
    // Water plants lie flat under everything; the rest sort with players by their base
    const depth = name === 'lilypads' ? -5 : y;
    if (d.frames > 1) {
      const s = this.scene.add.sprite(x, y, key, 0).setOrigin(d.originX, d.originY).setDepth(depth);
      // Random start frame and speed, so the town doesn't sway in lockstep
      s.play(key);
      s.anims.timeScale = 0.85 + ((r * 7919) % 1) * 0.3;
      s.anims.setProgress(r);
      this.things.push(s);
    } else {
      this.things.push(this.scene.add.image(x, y, key).setOrigin(d.originX, d.originY).setDepth(depth));
    }
    if (d.glow) this.addLightPool(name, x, y, r);
  }

  // A soft warm (or teal) glow around things that give off light, flickering slowly
  private addLightPool(name: string, x: number, y: number, r: number): void {
    const lift = name === 'lamp' ? 44 : name === 'tree-solar' ? 96 : 12;
    const size = name === 'mush-glow' ? 90 : 150;
    const pool = this.scene.add
      .image(x, y - lift, 'gh-pool')
      .setDisplaySize(size, size)
      .setTint(name === 'mush-glow' ? 0x86c2b0 : 0xffd27a)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.35)
      .setDepth(y + 1);
    this.scene.tweens.add({
      targets: pool,
      alpha: 0.22,
      scale: pool.scale * 0.92,
      duration: 1400 + r * 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: r * 1000,
    });
    this.things.push(pool);
  }

  private drawBuildings(built: ReadonlySet<number>): void {
    this.buildings.forEach((o) => o.destroy());
    this.buildings = [];
    this.buildingTops.clear();
    for (const spot of PROPERTIES) {
      if (!(spot.kind === 'building' || built.has(spot.id))) continue;
      const b = meta!.buildings[String(spot.id)];
      if (!b) continue;
      const base = (spot.y + spot.h) * TILE_SIZE;
      const x = spot.door.x * TILE_SIZE + TILE_SIZE / 2 - b.doorX;
      const y = base - b.baseY;
      const key = 'building-' + spot.id;
      if ((b.frames ?? 1) > 1) {
        const s = this.scene.add.sprite(x, y, key, 0).setOrigin(0, 0).setDepth(base);
        s.play(key);
        s.anims.setProgress(hash(spot.id, 99)); // each building starts at a different point
        this.buildings.push(s);
      } else {
        this.buildings.push(this.scene.add.image(x, y, key).setOrigin(0, 0).setDepth(base));
      }
      this.buildingTops.set(spot.id, y);
    }
  }

  // Golden hour: a warm tint over everything, a sun glow from the upper left and darker edges.
  // Fixed to the camera, above the world and below name tags and the UI.
  private drawOverlay(): void {
    const s = this.scene;
    const tint = s.add.image(0, 0, '__WHITE').setTint(0xfff0d8).setBlendMode(Phaser.BlendModes.MULTIPLY);
    const glow = s.add.image(0, 0, 'gh-glow').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.25);
    const vignette = s.add.image(0, 0, 'gh-vignette').setAlpha(0.35);
    this.overlay = [tint, glow, vignette];
    this.overlay.forEach((o, i) => o.setOrigin(0, 0).setScrollFactor(0).setDepth(OVERLAY_DEPTH + i));
    this.sizeOverlay();
    s.scale.on(Phaser.Scale.Events.RESIZE, this.onResize);
  }

  private sizeOverlay(): void {
    if (this.overlay.length < 3) return;
    const { width, height } = this.scene.scale;
    const [tint, glow, vignette] = this.overlay;
    tint.setPosition(0, 0).setDisplaySize(width, height);
    // The glow's centre sits at the top-left corner
    const g = Math.max(width, height) * 1.3;
    glow.setPosition(-g / 2, -g / 2).setDisplaySize(g, g);
    // Stretch the vignette a bit past the screen so the corners darken
    vignette.setPosition(-width * 0.15, -height * 0.15).setDisplaySize(width * 1.3, height * 1.3);
  }
}
