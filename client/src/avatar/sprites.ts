// Layered character sprites.
//
// Each piece of the character (body, face, outfit, hair, accessory) is its own sprite
// sheet PNG in client/public/sprites/. A character is built by stacking the right layers
// and tinting the grey parts with the player's chosen colors. The result is one sprite
// sheet per look, cached, so this work happens once per look, not every frame.
//
// Sheet layout (see docs/ART_SPEC.md): 128 x 128 frames,
//   rows    = directions: down, left, right, up
//   columns = 0 standing, 1..WALK_FRAMES walk cycle

import {
  ACCESSORIES,
  HAIR_STYLES,
  HAIR_COLORS,
  OUTFIT_COLORS,
  OUTFIT_STYLES,
  SKIN_TONES,
  avatarKey,
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
// How far above the feet the top of the head is (for name tags and chat bubbles)
export const HEAD_HEIGHT = 96;

const SPRITE_DIR = 'sprites/';

// Layer files, back to front. A missing file is simply skipped (e.g. "Bald" has no hair).
function layerFiles(a: Avatar): { file: string; tint?: number }[] {
  return [
    { file: 'body.png', tint: SKIN_TONES[a.skin] },
    { file: 'face.png' },
    { file: `outfit-${a.outfitStyle}.png`, tint: OUTFIT_COLORS[a.outfitColor] },
    { file: `hair-${a.hairStyle}.png`, tint: HAIR_COLORS[a.hairColor] },
    { file: `accessory-${a.accessory}.png` },
  ];
}

// Every file the game might need, so they can all be loaded up front
function allFiles(): string[] {
  const files = ['body.png', 'face.png'];
  OUTFIT_STYLES.forEach((_, i) => files.push(`outfit-${i}.png`));
  HAIR_STYLES.forEach((_, i) => files.push(`hair-${i}.png`));
  ACCESSORIES.forEach((_, i) => files.push(`accessory-${i}.png`));
  return files;
}

const images = new Map<string, HTMLImageElement>();
let loading: Promise<void> | null = null;

// Loads every layer image once. Missing files are fine (they're just not drawn).
export function loadSpriteLayers(): Promise<void> {
  if (!loading) {
    loading = Promise.all(
      allFiles().map(
        (file) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => {
              images.set(file, img);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = SPRITE_DIR + file;
          }),
      ),
    ).then(() => undefined);
  }
  return loading;
}

// ---------- tinting ----------
// Grey pixels become shades of the chosen color (mid grey = exactly that color).
// Colored pixels (saturated) and near-black outlines are left alone, so artists can
// keep details like buttons, shoes, or eyes in their own colors on a tintable layer.

const GREY_TOLERANCE = 24; // how far apart R, G and B can be and still count as grey
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

// ---------- building a full character sheet ----------

const sheets = new Map<string, HTMLCanvasElement>();

// Returns the finished sprite sheet for this look (all directions and frames).
export function composeAvatarSheet(a: Avatar): HTMLCanvasElement {
  const key = avatarKey(a);
  const hit = sheets.get(key);
  if (hit) return hit;

  const c = document.createElement('canvas');
  c.width = FRAME_SIZE * SHEET_COLS;
  c.height = FRAME_SIZE * DIRECTIONS.length;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  for (const layer of layerFiles(a)) {
    const img = images.get(layer.file);
    if (!img) continue;
    ctx.drawImage(layer.tint === undefined ? img : tintLayer(layer.file, img, layer.tint), 0, 0);
  }
  sheets.set(key, c);
  return c;
}

// Draws the standing, facing-down frame (used by the wardrobe preview)
export function drawAvatarPreview(ctx: CanvasRenderingContext2D, a: Avatar): void {
  const sheet = composeAvatarSheet(a);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(
    sheet,
    0,
    0,
    FRAME_SIZE,
    FRAME_SIZE,
    0,
    0,
    ctx.canvas.width,
    ctx.canvas.height,
  );
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
