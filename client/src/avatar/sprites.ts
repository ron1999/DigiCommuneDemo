// Layered character sprites.
//
// A character is a body sheet (already in the chosen skin tone) with clothing and hair
// sheets stacked on top. Clothing and hair are drawn in grey and tinted with the player's
// chosen colors. Then the whole stack is stretched to the chosen height. The result is one
// sprite sheet per look, cached, so this work happens once per look, not every frame.
//
// The art is about 8 MB in total, so files are loaded only when a look needs them. Until
// they arrive, the sheet is drawn with what is there (possibly empty) and redrawn when they
// load; onSheetUpdated() tells the game and the wardrobe to refresh.
//
// Sheet layout (see docs/ART_SPEC.md): 128 x 128 frames,
//   rows    = directions: down, left, right, up
//   columns = 0 standing, 1..WALK_FRAMES walk cycle

import {
  BOTTOM_FILES,
  CLOTH_COLORS,
  HAIR_COLORS,
  HAIR_FILES,
  HEIGHT_PX,
  ONEPIECE_FILES,
  PRESET_FILES,
  SHOE_FILES,
  SKIN_DIRS,
  TOP_FILES,
  avatarKey,
  bodyName,
} from './avatar';
import type { Avatar } from './avatar';

export const FRAME_SIZE = 128;
export const WALK_FRAMES = 4;
export const SHEET_COLS = 1 + WALK_FRAMES;
export const DIRECTIONS = ['down', 'left', 'right', 'up'] as const;
export type Direction = (typeof DIRECTIONS)[number];

// Where the feet are inside a frame, measured from the frame's top-left.
// The game positions characters by their feet.
export const FEET_Y = 116;
// How far above the feet the top of the head is (for name tags and chat bubbles),
// for an average-height body (head top at y = 20). Presets are a bit shorter.
export const HEAD_HEIGHT = 96;
const PRESET_HEAD_HEIGHT = 84;
// Body art: the standing frame's head top and height (feet to head), see ART_SPEC "Body types"
const BODY_TOP = 20;
const BODY_HEIGHT = 97;

export function headHeightFor(a: Avatar): number {
  if (a.preset > 0 && PRESET_FILES[a.preset]) return PRESET_HEAD_HEIGHT;
  return HEAD_HEIGHT + HEIGHT_PX[a.height];
}

const SPRITE_DIR = 'sprites/';

// Layer files for a look, back to front. A missing file is simply skipped.
function layerFiles(a: Avatar): { file: string; tint?: number }[] {
  const body = bodyName(a) + '.png';
  const layers: { file: string; tint?: number }[] = [{ file: 'bodies/' + SKIN_DIRS[a.skin] + body }];
  const add = (dir: string, tint: number) => dir && layers.push({ file: dir + '/' + body, tint });
  const clothes = (dir: string, color: number) => add(dir && 'clothing/' + dir, CLOTH_COLORS[color]);
  // Overalls replace the bottom
  if (!a.onepiece) clothes(BOTTOM_FILES[a.bottom], a.bottomColor);
  clothes(SHOE_FILES[a.shoes], a.shoesColor);
  clothes(TOP_FILES[a.top], a.topColor);
  clothes(ONEPIECE_FILES[a.onepiece], a.onepieceColor);
  add(HAIR_FILES[a.hairStyle] && 'head/' + HAIR_FILES[a.hairStyle], HAIR_COLORS[a.hairColor]);
  return layers;
}

function filesFor(a: Avatar): string[] {
  if (a.preset > 0 && PRESET_FILES[a.preset]) return [presetFile(a.preset)];
  return layerFiles(a).map((l) => l.file);
}

function presetFile(preset: number): string {
  return 'presets/' + PRESET_FILES[preset] + '.png';
}

// ---------- loading images on demand ----------

const images = new Map<string, HTMLImageElement | null>(); // null = failed to load
const pending = new Map<string, Promise<void>>();

function loadImage(file: string): Promise<void> {
  if (images.has(file)) return Promise.resolve();
  let p = pending.get(file);
  if (!p) {
    p = new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        images.set(file, img);
        resolve();
      };
      img.onerror = () => {
        images.set(file, null);
        resolve();
      };
      img.src = SPRITE_DIR + file;
    });
    pending.set(file, p);
  }
  return p;
}

// Loads everything this look needs (resolves when its sheet is complete)
export function loadAvatarArt(a: Avatar): Promise<void> {
  return Promise.all(filesFor(a).map(loadImage)).then(() => undefined);
}

function isLoaded(a: Avatar): boolean {
  return filesFor(a).every((f) => images.has(f));
}

// ---------- tinting ----------
// Grey pixels become shades of the chosen color (mid grey = exactly that color).
// Colored pixels and near-black outlines (#1B110A) are left alone.

const GREY_TOLERANCE = 6; // how far apart R, G and B can be and still count as grey
const OUTLINE_MAX = 40; // pixels darker than this are outlines and stay as drawn

const tinted = new Map<string, HTMLCanvasElement>();

function tintLayer(file: string, img: HTMLImageElement, color: number): HTMLCanvasElement {
  const cacheKey = file + ':' + color;
  const hit = tinted.get(cacheKey);
  if (hit) return hit;

  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const d = data.data;

  const cr = (color >> 16) & 255;
  const cg = (color >> 8) & 255;
  const cb = color & 255;

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min > GREY_TOLERANCE || max < OUTLINE_MAX) continue;

    // 0.5 grey -> factor 1 (the color itself); darker greys darken, lighter greys lighten
    const lum = (r + g + b) / 765;
    const f = 0.35 + lum * 1.3;
    if (f <= 1) {
      d[i] = cr * f;
      d[i + 1] = cg * f;
      d[i + 2] = cb * f;
    } else {
      const t = Math.min(1, f - 1);
      d[i] = cr + (255 - cr) * t;
      d[i + 1] = cg + (255 - cg) * t;
      d[i + 2] = cb + (255 - cb) * t;
    }
  }
  ctx.putImageData(data, 0, 0);
  tinted.set(cacheKey, c);
  return c;
}

// ---------- height ----------
// Port of stretchRows/stretchImage in scripts/body-shapes.mjs: rows in the legs (60%) and
// torso (40%) are repeated (taller) or dropped (shorter); the feet stay where they are.
// Returns, for each row of a 128-row frame, which source row to copy (-1 = empty).

function heightRowMap(d: number): number[] {
  const legs = Math.round(d * 0.6);
  const torso = d - legs;
  const pick = (from: number, to: number, n: number) => {
    const k = Math.abs(n);
    const out: number[] = [];
    for (let i = 0; i < k; i++) {
      out.push(Math.round(BODY_TOP + from * BODY_HEIGHT + ((to - from) * BODY_HEIGHT * (i + 0.5)) / k));
    }
    return out;
  };
  const counts = new Map<number, number>();
  for (const r of [...pick(0.72, 0.88, legs), ...pick(0.38, 0.52, torso)]) {
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  const rows: number[] = [];
  for (let y = 0; y < FRAME_SIZE; y++) {
    const n = counts.get(y) ?? 0;
    if (d < 0 && n) continue;
    rows.push(y);
    if (d > 0) for (let i = 0; i < n; i++) rows.push(y);
  }
  const shift = FRAME_SIZE - rows.length;
  const map: number[] = [];
  for (let y = 0; y < FRAME_SIZE; y++) map.push(y - shift >= 0 ? rows[y - shift] : -1);
  return map;
}

function stretchSheet(src: HTMLCanvasElement, d: number, out: CanvasRenderingContext2D): void {
  const map = heightRowMap(d);
  for (let band = 0; band < DIRECTIONS.length; band++) {
    const top = band * FRAME_SIZE;
    for (let y = 0; y < FRAME_SIZE; y++) {
      if (map[y] < 0) continue;
      out.drawImage(src, 0, top + map[y], src.width, 1, 0, top + y, src.width, 1);
    }
  }
}

// ---------- building a full character sheet ----------

const sheets = new Map<string, HTMLCanvasElement>();
const listeners = new Set<(key: string) => void>();

// Called with a look's key when its sheet was redrawn after its art finished loading
export function onSheetUpdated(fn: (key: string) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function draw(a: Avatar, c: HTMLCanvasElement): void {
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, c.width, c.height);

  // A ready-made character is already a complete sheet
  if (a.preset > 0 && PRESET_FILES[a.preset]) {
    const preset = images.get(presetFile(a.preset));
    if (preset) ctx.drawImage(preset, 0, 0);
    return;
  }

  const stack = document.createElement('canvas');
  stack.width = c.width;
  stack.height = c.height;
  const sctx = stack.getContext('2d')!;
  sctx.imageSmoothingEnabled = false;
  for (const layer of layerFiles(a)) {
    const img = images.get(layer.file);
    if (!img) continue;
    sctx.drawImage(layer.tint === undefined ? img : tintLayer(layer.file, img, layer.tint), 0, 0);
  }

  const d = HEIGHT_PX[a.height];
  if (d === 0) ctx.drawImage(stack, 0, 0);
  else stretchSheet(stack, d, ctx);
}

// Returns the sprite sheet for this look (all directions and frames). If its art is still
// loading, the sheet is redrawn in place when it arrives (and onSheetUpdated fires).
export function composeAvatarSheet(a: Avatar): HTMLCanvasElement {
  const key = avatarKey(a);
  let c = sheets.get(key);
  if (c) return c;

  c = document.createElement('canvas');
  c.width = FRAME_SIZE * SHEET_COLS;
  c.height = FRAME_SIZE * DIRECTIONS.length;
  sheets.set(key, c);

  const canvas = c;
  if (isLoaded(a)) {
    draw(a, canvas);
  } else {
    void loadAvatarArt(a).then(() => {
      draw(a, canvas);
        listeners.forEach((fn) => fn(key));
    });
  }
  return c;
}

// Draws the standing, facing-down frame, centered and cropped to the canvas's shape
// (used by the wardrobe preview)
export function drawAvatarPreview(ctx: CanvasRenderingContext2D, a: Avatar): void {
  const sheet = composeAvatarSheet(a);
  const w = Math.round((FRAME_SIZE * ctx.canvas.width) / ctx.canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(sheet, (FRAME_SIZE - w) / 2, 0, w, FRAME_SIZE, 0, 0, ctx.canvas.width, ctx.canvas.height);
}

// Frame number inside a sheet for a direction and column
export function frameIndex(dir: Direction, col: number): number {
  return DIRECTIONS.indexOf(dir) * SHEET_COLS + col;
}

// Which way a movement faces. Mostly-horizontal moves face left/right.
export function directionFor(dx: number, dy: number, current: Direction): Direction {
  if (dx === 0 && dy === 0) return current;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}
