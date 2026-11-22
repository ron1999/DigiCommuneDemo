// Builds one full-character sprite sheet per PRESET character from PixelLab exports:
//   scripts/art-src/presets/<name>/rotations/<dir>.png          8 standing views (kept for reference)
//   scripts/art-src/presets/<name>/animations/walk4/<dir>/frame_00N.png   4-frame walk
// Output: client/public/sprites/presets/<name>.png, a 640 x 512 sheet in the same layout as
// the layer sheets (docs/ART_SPEC.md): rows down/left/right/up, col 0 standing + 4 walk frames,
// 128 x 128 frames, feet on y = 116, centered at x = 64. Right = left mirrored.
// These are complete characters (not tinted, not layered).
//
//   node scripts/build-presets.mjs

import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, newImage, writePng } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scripts', 'art-src', 'presets');
const OUT = join(ROOT, 'client', 'public', 'sprites', 'presets');
const FRAME = 128, COLS = 5, FEET_Y = 116;
const DIRS = [['south', 0], ['west', 1], ['north', 3]];

function bbox(img) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (img.data[(y * img.width + x) * 4 + 3] >= 128) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
  return { x0, y0, x1, y1 };
}

function blit(sheet, img, col, row, dx, dy, mirror) {
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      if (!img.data[i + 3]) continue;
      let fx = x + dx;
      const fy = y + dy;
      if (mirror) fx = FRAME - 1 - fx;
      if (fx < 0 || fy < 0 || fx >= FRAME || fy >= FRAME) continue;
      sheet.data.set(img.data.subarray(i, i + 4), ((row * FRAME + fy) * FRAME * COLS + col * FRAME + fx) * 4);
    }
}

mkdirSync(OUT, { recursive: true });
for (const name of readdirSync(SRC)) {
  const sheet = newImage(FRAME * COLS, FRAME * 4);
  for (const [dir, row] of DIRS) {
    // The walk is drawn a little smaller than the standing rotation, so the standing frame
    // (col 0) is the walk frame with the legs closest together, to avoid a size jump.
    const walk = [];
    for (let i = 0; i < 4; i++) walk.push(readPng(join(SRC, name, 'animations', 'walk4', dir, `frame_00${i}.png`)));
    const width = (img) => { const b = bbox(img); return b.x1 - b.x0; };
    const stand = walk.reduce((best, f) => (width(f) < width(best) ? f : best), walk[0]);
    const frames = [stand, ...walk];
    // One offset per direction (from the standing frame) keeps the walk's bob
    const b = bbox(frames[0]);
    const dx = Math.round(FRAME / 2 - (b.x0 + b.x1 + 1) / 2);
    const dy = FEET_Y - b.y1;
    frames.forEach((img, col) => {
      blit(sheet, img, col, row, dx, dy, false);
      if (dir === 'west') blit(sheet, img, col, 2, dx, dy, true);
    });
  }
  writePng(join(OUT, `${name}.png`), sheet);
  console.log(`Wrote presets/${name}.png`);
}
