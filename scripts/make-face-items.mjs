// Tiny face items (piercings, small face tattoos) are only 1-4 pixels, too small for the AI to
// draw cleanly, so they are placed by hand here as exact pixels on the reference heads, then
// built like every head item:
//
//   node scripts/make-face-items.mjs            (writes scripts/art-src/head/<id>/<gender>.png)
//   node scripts/build-head-items.mjs <id>      (places it on every body and walk frame)
//
// Coordinates are FRAME pixels (0-127) of the reference body's standing frame (male-average /
// female-average, see REF in build-head-items.mjs), per view: south = front, west = side (facing
// left, we see the left side of the face), north = back. Shades: H highlight, M mid (= the chosen
// colour), D shadow. Front-view "left" items (nose, brow) are on the viewer's RIGHT, the
// character's left, so they also show in the side view.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, newImage, writePng } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BODIES = join(ROOT, 'client', 'public', 'sprites', 'bodies');
const REF = { male: 'male-average', female: 'female-average' };
const PANELS = [['south', 0], ['west', 1], ['north', 3]];
// blue key shades -> greys in build-head-items.mjs ("shades" in item.json)
const BLUE = { H: [150, 190, 255], M: [40, 90, 235], D: [20, 40, 150] };
const GREY = { H: 200, M: 128, D: 78 };

export const ITEMS = {
  'face-ear-hoops': {
    name: 'Ear hoops',
    male: {
      south: [[55, 33, 'H'], [55, 34, 'M'], [56, 34, 'D'], [72, 33, 'H'], [72, 34, 'M'], [71, 34, 'D']],
      west: [[68, 35, 'H'], [68, 36, 'M'], [69, 36, 'D']],
      north: [[54, 32, 'H'], [54, 33, 'M'], [55, 33, 'D'], [73, 32, 'H'], [73, 33, 'M'], [72, 33, 'D']],
    },
    female: {
      south: [[54, 34, 'H'], [54, 35, 'M'], [55, 35, 'D'], [72, 34, 'H'], [72, 35, 'M'], [71, 35, 'D']],
      west: [[66, 35, 'H'], [66, 36, 'M'], [67, 36, 'D']],
      north: [[54, 34, 'H'], [54, 35, 'M'], [55, 35, 'D'], [73, 34, 'H'], [73, 35, 'M'], [72, 35, 'D']],
    },
  },
  'face-nose-ring': {
    name: 'Nose ring',
    male: { south: [[65, 34, 'H'], [65, 35, 'M']], west: [[58, 34, 'H'], [57, 35, 'M']], north: [] },
    female: { south: [[64, 34, 'H'], [64, 35, 'M']], west: [[53, 34, 'H'], [52, 35, 'M']], north: [] },
  },
  'face-lip-ring': {
    name: 'Lip ring',
    male: { south: [[62, 36, 'H'], [62, 37, 'M']], west: [[57, 36, 'H'], [57, 37, 'M']], north: [] },
    female: { south: [[63, 37, 'H'], [63, 38, 'M']], west: [[52, 37, 'H'], [53, 38, 'M']], north: [] },
  },
  'face-tattoo-leaf': {
    name: 'Leaf tattoo',
    male: {
      south: [[67, 33, 'M'], [68, 32, 'M'], [68, 33, 'D'], [66, 34, 'D']],
      west: [[61, 33, 'M'], [62, 32, 'M'], [62, 33, 'D'], [60, 34, 'D']],
      north: [],
    },
    female: {
      south: [[67, 34, 'M'], [68, 33, 'M'], [68, 34, 'D'], [66, 35, 'D']],
      west: [[57, 34, 'M'], [58, 33, 'M'], [58, 34, 'D'], [56, 35, 'D']],
      north: [],
    },
  },
  'face-brow-bar': {
    name: 'Eyebrow bar',
    male: { south: [[69, 26, 'H'], [69, 28, 'M']], west: [[63, 27, 'H'], [63, 28, 'M']], north: [] },
    female: { south: [[69, 26, 'H'], [69, 28, 'M']], west: [[57, 26, 'H'], [57, 28, 'M']], north: [] },
  },
};

const only = process.argv.slice(2);
for (const [id, item] of Object.entries(ITEMS)) {
  if (only.length && !only.includes(id)) continue;
  const dir = join(ROOT, 'scripts', 'art-src', 'head', id);
  mkdirSync(dir, { recursive: true });
  for (const gender of ['male', 'female']) {
    const sheet = readPng(join(BODIES, `${REF[gender]}.png`));
    const art = newImage(192, 128);
    PANELS.forEach(([view, row], p) => {
      // the reference panel (frame columns 32..95), then the item's pixels on top
      for (let y = 0; y < 128; y++)
        for (let x = 0; x < 64; x++) {
          const i = ((row * 128 + y) * sheet.width + 32 + x) * 4;
          art.data.set(sheet.data.subarray(i, i + 4), (y * 192 + p * 64 + x) * 4);
        }
      for (const [fx, fy, s] of item[gender][view]) art.data.set([...BLUE[s], 255], (fy * 192 + p * 64 + fx - 32) * 4);
    });
    writePng(join(dir, `${gender}.png`), art);
  }
  writeFileSync(
    join(dir, 'item.json'),
    JSON.stringify(
      {
        name: item.name,
        kind: 'face',
        key: 'blue',
        tint: true,
        outline: false,
        shades: Object.fromEntries(Object.keys(BLUE).map((k) => [BLUE[k].join(','), GREY[k]])),
        made_with: 'hand-placed pixels, scripts/make-face-items.mjs (no PixelLab cost)',
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`art-src/head/${id}`);
}
