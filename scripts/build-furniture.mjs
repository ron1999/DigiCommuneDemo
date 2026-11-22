// Builds client/public/furniture/furniture_N.png from the PixelLab furniture set in
// scripts/art-src/furniture/frame_N.png (64x64 each; frame N = furniture_N, frames 14-15 are
// extras for later: glowing mushroom lamp, hanging macrame plant).
//
//   node scripts/build-furniture.mjs
//
// Each output is the piece's size in game pixels (64 per tile, e.g. a 2x1 table = 128x64),
// which is what client/src/world/furniture.ts expects. The art is cropped to its pixels and
// enlarged by the biggest whole number (1x or 2x) that still fits the slot, so pixels stay crisp.
// Keep SLOTS in sync with FURNITURE + SLOT_SIZE in client/src/world/rooms.ts.

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, newImage, writePng } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scripts', 'art-src', 'furniture');
const OUT = join(ROOT, 'client', 'public', 'furniture');
const TILE = 64;

// [width, height in tiles, how to place it in the slot]
const BED = [2, 2, 'floor'], TABLE = [2, 1, 'floor'], SEAT = [1, 1, 'floor'];
const RUG = [3, 2, 'center'], PLANT = [1, 1, 'floor'], LAMP = [1, 1, 'floor'], WALL = [2, 1, 'center'];
const SLOTS = [BED, BED, TABLE, TABLE, SEAT, SEAT, RUG, RUG, PLANT, PLANT, LAMP, LAMP, WALL, WALL];

mkdirSync(OUT, { recursive: true });
SLOTS.forEach(([tw, th, place], n) => {
  const img = readPng(join(SRC, `frame_${n}.png`));
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (img.data[(y * img.width + x) * 4 + 3] > 0) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const W = tw * TILE, H = th * TILE;
  const k = Math.max(1, Math.min(2, Math.floor(Math.min(W / bw, H / bh))));
  const ox = Math.floor((W - bw * k) / 2);
  const oy = place === 'floor' ? H - bh * k - 2 : Math.floor((H - bh * k) / 2);
  const out = newImage(W, H);
  for (let y = 0; y < bh * k; y++)
    for (let x = 0; x < bw * k; x++) {
      const tx = ox + x, ty = oy + y;
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
      const i = ((y0 + Math.floor(y / k)) * img.width + x0 + Math.floor(x / k)) * 4;
      out.data.set(img.data.subarray(i, i + 4), (ty * W + tx) * 4);
    }
  writePng(join(OUT, `furniture_${n}.png`), out);
  console.log(`furniture_${n}: ${bw}x${bh} art at ${k}x in a ${W}x${H} slot`);
});
