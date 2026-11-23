// Builds one sprite sheet per PET coat from PixelLab character exports:
//   scripts/art-src/pets/<sheet>/rotations/<dir>.png                     8 standing views (reference only)
//   scripts/art-src/pets/<sheet>/animations/walk4/<south|west|north>/frame_00N.png   4-frame walk
// Output: client/public/sprites/pets/<sheet>.png, a 240 x 192 sheet: 48 x 48 frames, 5 columns x
// 4 rows, the same layout as the character sheets (docs/ART_SPEC.md): rows down/left/right/up,
// col 0 standing + 4 walk frames, feet on y = 45, centered at x = 24. Right = left mirrored.
// Pets are small, simple sprites (few flat colours, clean outline) drawn at 1x in the game, the
// same pixel size as the characters, so a cat is about knee-to-thigh height next to a player.
// Pets keep their own colours (not tinted). Every animal family (cat, dog, later lizard...) uses
// this same layout, so the game code doesn't care which animal it is.
//
// More coats for free: COATS below recolours a built sheet's fur (the orange pixels) into a new
// colour, keeping the outline, eyes, white patches and pink ears/nose. Same animal, same walk.
// Very dark coats don't work this way (the dark eyes would vanish into the fur): generate those.
//
//   node scripts/build-pets.mjs

import { mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, newImage, writePng } from './png.mjs';
import { applyOutline, OUTLINE_COLOR } from './outline.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scripts', 'art-src', 'pets');
const OUT = join(ROOT, 'client', 'public', 'sprites', 'pets');
const FRAME = 48, COLS = 5, FEET_Y = 45;
const DIRS = [['south', 0], ['west', 1], ['north', 3]]; // east (row 2) = west mirrored

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
      if (img.data[i + 3] < 128) continue;
      let fx = x + dx;
      const fy = y + dy;
      if (mirror) fx = FRAME - 1 - fx;
      if (fx < 0 || fy < 0 || fx >= FRAME || fy >= FRAME) continue;
      sheet.data.set(img.data.subarray(i, i + 4), ((row * FRAME + fy) * FRAME * COLS + col * FRAME + fx) * 4);
    }
}

// PixelLab walks sometimes leave faint dust specks around the animal: drop any pixels that are
// half-transparent or in a tiny island (fewer than MIN_ISLAND connected pixels; the animal itself is one big piece).
const MIN_ISLAND = 25;
function clean(img) {
  const { width: W, height: H, data } = img;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 128) data[i] = 0;
  const seen = new Uint8Array(W * H);
  for (let s = 0; s < W * H; s++) {
    if (seen[s] || !data[s * 4 + 3]) continue;
    const island = [s];
    seen[s] = 1;
    for (let k = 0; k < island.length; k++) {
      const p = island[k], x = p % W, y = (p / W) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const q = ny * W + nx;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && !seen[q] && data[q * 4 + 3]) { seen[q] = 1; island.push(q); }
      }
    }
    if (island.length < MIN_ISLAND) for (const p of island) data[p * 4 + 3] = 0;
  }
  return img;
}

// New sheet name -> the sheet it is recoloured from + the new main fur colour (replaces the
// source's main fur colour; lighter/darker fur shades follow it by brightness).
// Optional for dark coats, where the source's dark eyes and inner lines would vanish:
//   white: recolour the white patches too;  lines: colour for the dark inner lines;
//   eyes: { at: eye pixels per sheet row/col, colours: [main, bottom pixel] } painted on top;
//   pinkBelow: pink pixels lower than this frame-local y (paw pads, chest) join the patches.
// Eye pixels of the tabby (frame-local x, y), checked by hand. Row 1 = facing left; row 2
// (right) is row 1 mirrored; row 3 (back) has no eyes. Col 0 (standing) = the same as col 1.
const TABBY_EYES = {
  0: [
    [[21, 32], [21, 33], [21, 34], [27, 32], [27, 33], [27, 34]],
    [[21, 32], [21, 33], [21, 34], [27, 32], [27, 33], [27, 34]],
    [[21, 31], [21, 32], [21, 33], [26, 31], [26, 32], [26, 33]],
    [[21, 31], [21, 32], [21, 33], [26, 31], [26, 32], [26, 33]],
    [[21, 31], [21, 32], [21, 33], [27, 31], [27, 32], [27, 33]],
  ],
  1: [[[15, 27], [15, 28]], [[15, 27], [15, 28]], [[14, 28], [14, 29]], [[14, 29], [14, 30]], [[14, 28], [14, 29]]],
};
const COATS = {
  'cat-silver': { from: 'cat-tabby', fur: [0xa9, 0xb1, 0xc2] },
  'cat-cocoa': { from: 'cat-tabby', fur: [0xc0, 0x8a, 0x62] },
  'cat-black': {
    from: 'cat-tabby',
    fur: [0x3e, 0x3a, 0x48],
    white: [0x56, 0x52, 0x62],
    lines: [0x24, 0x20, 0x2a],
    pinkBelow: 35,
    eyes: { at: TABBY_EYES, colours: [[0xc6, 0xe8, 0x52], [0x86, 0xb8, 0x34]] },
  },
};

function hueSat(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return [0, 0];
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, d / max];
}
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const isFur = (r, g, b) => { const [h, s] = hueSat(r, g, b); return h >= 10 && h <= 45 && s > 0.4; };

function recolour(src, { fur, white, lines, eyes, pinkBelow }) {
  const out = newImage(src.width, src.height);
  out.data.set(src.data);
  const d = out.data;
  // The source's main fur colour = its most common fur pixel
  const count = new Map();
  for (let i = 0; i < d.length; i += 4)
    if (d[i + 3] && isFur(d[i], d[i + 1], d[i + 2])) {
      const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  const main = [...count].sort((a, b) => b[1] - a[1])[0][0];
  const base = lum(main >> 16, (main >> 8) & 255, main & 255);
  // Tinted specks (a pink or peach pixel or two) sitting in the middle of the fur read as fur
  // highlights on orange but stand out on other colours: recolour them with the fur too.
  const s = src.data, W = src.width;
  const furAt = (j) => s[j + 3] && isFur(s[j], s[j + 1], s[j + 2]);
  const speck = (i) => {
    const x = (i / 4) % W;
    if (lum(s[i], s[i + 1], s[i + 2]) < 110 || hueSat(s[i], s[i + 1], s[i + 2])[1] < 0.15) return false;
    const n = [x > 0 ? i - 4 : -1, x < W - 1 ? i + 4 : -1, i - W * 4, i + W * 4].filter((j) => j >= 0 && j < s.length && furAt(j));
    return n.length >= 3;
  };
  const isOutline = (i) => s[i] === OUTLINE_COLOR[0] && s[i + 1] === OUTLINE_COLOR[1] && s[i + 2] === OUTLINE_COLOR[2];
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const [r, g, b] = [s[i], s[i + 1], s[i + 2]];
    if (isFur(r, g, b) || speck(i)) {
      const k = lum(r, g, b) / base;
      for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, Math.round(fur[c] * k)));
    } else if (white && lum(r, g, b) > 200 && hueSat(r, g, b)[1] < 0.2) {
      const k = lum(r, g, b) / 245;
      for (let c = 0; c < 3; c++) d[i + c] = Math.round(white[c] * k);
    } else if (white && lum(r, g, b) >= 120 && hueSat(r, g, b)[0] >= 5 && hueSat(r, g, b)[0] <= 45) {
      // Peach/orange shading the fur test missed: light ones join the patches, the rest the fur
      const light = lum(r, g, b) > 170;
      const k = lum(r, g, b) / (light ? 245 : base);
      for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, Math.round((light ? white : fur)[c] * k)));
    } else if (pinkBelow && ((i / 4 / W) | 0) % FRAME >= pinkBelow && lum(r, g, b) >= 120 && (hueSat(r, g, b)[0] > 330 || hueSat(r, g, b)[0] < 5)) {
      const k = lum(r, g, b) / 245;
      for (let c = 0; c < 3; c++) d[i + c] = Math.round(white[c] * k);
    } else if (lines && !isOutline(i) && lum(r, g, b) < 120) {
      d.set(lines, i);
    }
  }
  if (eyes) {
    const put = (row, col, x, y, colour) => d.set(colour, ((row * FRAME + y) * W + col * FRAME + x) * 4);
    for (const [row, frames] of Object.entries(eyes.at))
      frames.forEach((pixels, col) => {
        // The lowest pixel of each eye gets the darker colour
        const bottom = new Map();
        for (const [x, y] of pixels) bottom.set(x, Math.max(bottom.get(x) ?? 0, y));
        for (const [x, y] of pixels) {
          const colour = eyes.colours[y === bottom.get(x) ? 1 : 0];
          put(+row, col, x, y, colour);
          if (+row === 1) put(2, col, FRAME - 1 - x, y, colour); // facing right = mirrored
        }
      });
  }
  return out;
}

function mirror(img) {
  const out = newImage(img.width, img.height);
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      out.data.set(img.data.subarray(i, i + 4), (y * img.width + img.width - 1 - x) * 4);
    }
  return out;
}

mkdirSync(OUT, { recursive: true });
const built = new Map();
for (const name of readdirSync(SRC)) {
  if (!existsSync(join(SRC, name, 'animations', 'walk4'))) continue;
  const sheet = newImage(FRAME * COLS, FRAME * 4);
  for (const [dir, row] of DIRS) {
    // A side walk may come as east instead of west (when PixelLab's west view turned the head
    // away): it is mirrored into west here.
    const fromEast = dir === 'west' && !existsSync(join(SRC, name, 'animations', 'walk4', 'west'));
    const walk = [];
    for (let i = 0; i < 4; i++) {
      const img = clean(readPng(join(SRC, name, 'animations', 'walk4', fromEast ? 'east' : dir, `frame_00${i}.png`)));
      walk.push(fromEast ? mirror(img) : img);
    }
    // The PixelLab standing rotation is drawn a bit bigger than the walk, so the standing frame
    // (col 0) is the walk frame with the legs closest together (narrowest / shortest box).
    const span = (img) => { const b = bbox(img); return dir === 'west' ? b.x1 - b.x0 : b.y1 - b.y0; };
    const stand = walk.reduce((best, f) => (span(f) < span(best) ? f : best), walk[0]);
    const frames = [stand, ...walk];
    // One offset per direction (from the standing frame) keeps the walk's bob
    const b = bbox(stand);
    const dx = Math.round(FRAME / 2 - (b.x0 + b.x1 + 1) / 2);
    const dy = FEET_Y - b.y1;
    frames.forEach((img, col) => {
      blit(sheet, img, col, row, dx, dy, false);
      if (dir === 'west') blit(sheet, img, col, 2, dx, dy, true);
    });
  }
  applyOutline(sheet); // shared house outline #1B110A
  writePng(join(OUT, `${name}.png`), sheet);
  built.set(name, sheet);
  console.log(`Wrote sprites/pets/${name}.png`);
}
for (const [name, coat] of Object.entries(COATS)) {
  const { from } = coat;
  if (!built.has(from)) continue;
  writePng(join(OUT, `${name}.png`), recolour(built.get(from), coat));
  console.log(`Wrote sprites/pets/${name}.png (recoloured ${from})`);
}
