// Builds the 20 body sprite sheets for the game from the PixelLab walking characters.
//
//   node scripts/build-body-sheets.mjs [name ...]      (no names = all 20)
//
// For each body in scripts/art-src/bodies/characters.json:
//   1. downloads the PixelLab character (once) into scripts/art-src/bodies/walk/<name>/
//      (rotations/<dir>.png + animations/walk4/<dir>/frame_00N.png)
//   2. fixes the walk's muddy back-limb shading (scripts/walk-shading.mjs)
//   3. places every frame with the feet on y = 116, centered, and stretches each direction
//      so the standing frame is exactly BASE_HEIGHT tall (same rows for the whole direction,
//      so the walk bob is kept)
//   4. writes client/public/sprites/bodies/<name>.png: 640 x 512, rows down/left/right/up,
//      col 0 standing (the walk frame with the legs closest together) + cols 1-4 walk.
//      Right = left mirrored.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, newImage, writePng } from './png.mjs';
import { paletteOf, fixWalkFrame } from './walk-shading.mjs';
import { BASE_HEIGHT, bbox, stretchRows, stretchImage } from './body-shapes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scripts', 'art-src', 'bodies');
const OUT = join(ROOT, 'client', 'public', 'sprites', 'bodies');
const FRAME = 128, COLS = 5, FEET_Y = 116;
const DIRS = [['south', 0], ['west', 1], ['north', 3]];

const characters = JSON.parse(readFileSync(join(SRC, 'characters.json'), 'utf8'));
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(characters).filter((k) => !k.startsWith('_'));

function download(name) {
  const dir = join(SRC, 'walk', name);
  if (existsSync(join(dir, 'animations', 'walk4', 'north', 'frame_003.png'))) return dir;
  mkdirSync(dir, { recursive: true });
  const zip = join(dir, 'character.zip');
  execFileSync('curl', ['-sSL', '-o', zip, `https://api.pixellab.ai/mcp/characters/${characters[name]}/download`]);
  const tmp = join(dir, 'unzipped');
  execFileSync('unzip', ['-o', '-q', zip, '-d', tmp]);
  // keep only what we need: <state>/rotations and <state>/animations/walk4
  const state = join(tmp, 'Idle');
  execFileSync('cp', ['-R', join(state, 'rotations'), join(dir, 'rotations')]);
  mkdirSync(join(dir, 'animations'), { recursive: true });
  execFileSync('cp', ['-R', join(state, 'animations', 'walk4'), join(dir, 'animations', 'walk4')]);
  execFileSync('rm', ['-r', tmp, zip]);
  if (!existsSync(join(dir, 'animations', 'walk4', 'north', 'frame_003.png'))) throw new Error(`${name}: walk not complete yet`);
  return dir;
}

// Place a frame (any canvas size) into a 128 x 128 frame: feet of the standing frame on
// FEET_Y, standing frame centered, then stretch to BASE_HEIGHT with the standing frame's rows.
function placeDirection(frames) {
  const width = (img) => { const b = bbox(img); return b.x1 - b.x0; };
  const stand = frames.reduce((best, f) => (width(f) < width(best) ? f : best), frames[0]);
  const sb = bbox(stand);
  const dx = Math.round(FRAME / 2 - (sb.x0 + sb.x1 + 1) / 2);
  const dy = FEET_Y - sb.y1;
  const place = (img) => {
    const out = newImage(FRAME, FRAME);
    for (let y = 0; y < img.height; y++)
      for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4;
        if (!img.data[i + 3]) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= FRAME || ny >= FRAME) continue;
        out.data.set(img.data.subarray(i, i + 4), (ny * FRAME + nx) * 4);
      }
    return out;
  };
  const placed = [stand, ...frames].map(place);
  const h = sb.y1 - sb.y0 + 1;
  const d = BASE_HEIGHT - h;
  if (d === 0) return placed;
  const rows = stretchRows(FEET_Y - h + 1, h, d);
  return placed.map((f) => stretchImage(f, rows, d));
}

function blit(sheet, img, col, row, mirror) {
  for (let y = 0; y < FRAME; y++)
    for (let x = 0; x < FRAME; x++) {
      const i = (y * FRAME + (mirror ? FRAME - 1 - x : x)) * 4;
      if (!img.data[i + 3]) continue;
      sheet.data.set(img.data.subarray(i, i + 4), ((row * FRAME + y) * FRAME * COLS + col * FRAME + x) * 4);
    }
}

mkdirSync(OUT, { recursive: true });
for (const name of names) {
  const dir = download(name);
  const sheet = newImage(FRAME * COLS, FRAME * 4);
  for (const [d, row] of DIRS) {
    const pal = paletteOf(readPng(join(dir, 'rotations', `${d}.png`)));
    const walk = [0, 1, 2, 3].map((i) => fixWalkFrame(readPng(join(dir, 'animations', 'walk4', d, `frame_00${i}.png`)), pal));
    placeDirection(walk).forEach((f, col) => {
      blit(sheet, f, col, row, false);
      if (d === 'west') blit(sheet, f, col, 2, true);
    });
  }
  writePng(join(OUT, `${name}.png`), sheet);
  console.log(`bodies/${name}.png`);
}
