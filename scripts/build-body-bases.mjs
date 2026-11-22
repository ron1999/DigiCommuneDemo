// Cuts the 5 builds per gender out of the PixelLab build lineups and normalizes them
// to the same height (BASE_HEIGHT), feet at y = 116 in a 96 x 128 canvas, centered.
//
//   node scripts/build-body-bases.mjs [previewFile]
//
// Input  scripts/art-src/bodies/<gender>-builds.png: 5 figures, slim -> heavyset, same height
//        scripts/art-src/bodies/<gender>-muscular.png: the same 5 builds, muscular
//        (<gender>-lineup.png is the first approved short/average/tall/heavyset lineup, kept as
//        the style reference; it isn't used here)
// Output scripts/art-src/bodies/base/<gender>-<build>[-muscular].png  (the standing front view of each body,
//        used as the first frame when turning a body into a walking PixelLab character)
// With a preview file name, also writes a grid of every build x height for checking.

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, newImage, writePng } from './png.mjs';
import { BUILDS, MUSCLE, HEIGHTS, BASE_HEIGHT, splitFigures, bbox, stretchRows, stretchImage } from './body-shapes.mjs';

// base file name, e.g. male-stocky (soft) or male-stocky-muscular
const baseName = (g, b, m) => (m === 'soft' ? `${g}-${b}` : `${g}-${b}-${m}`);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scripts', 'art-src', 'bodies');
const OUT = join(SRC, 'base');
const W = 96, H = 128, FEET_Y = 116;

function cut(img, [x0, x1]) {
  let y0 = 1e9, y1 = -1;
  for (let y = 0; y < img.height; y++)
    for (let x = x0; x <= x1; x++) if (img.data[(y * img.width + x) * 4 + 3] > 0) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const w = x1 - x0 + 1;
  const out = newImage(W, H);
  const ox = Math.floor((W - w) / 2), oy = FEET_Y - y1;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = (y * img.width + x) * 4;
      if (img.data[i + 3]) out.data.set(img.data.subarray(i, i + 4), ((y + oy) * W + x - x0 + ox) * 4);
    }
  return out;
}

function toBaseHeight(img) {
  const b = bbox(img);
  const h = b.y1 - b.y0 + 1;
  const d = BASE_HEIGHT - h;
  return d === 0 ? img : stretchImage(img, stretchRows(b.y0, h, d), d);
}

mkdirSync(OUT, { recursive: true });
const bases = {};
for (const g of ['male', 'female']) {
  for (const m of MUSCLE) {
    const img = readPng(join(SRC, m === 'soft' ? `${g}-builds.png` : `${g}-muscular.png`));
    const segs = splitFigures(img, BUILDS.length);
    BUILDS.forEach((b, i) => {
      const body = toBaseHeight(cut(img, segs[i]));
      const key = baseName(g, b, m);
      bases[key] = body;
      writePng(join(OUT, `${key}.png`), body);
    });
  }
}
console.log(`Wrote ${Object.keys(bases).length} base bodies to ${OUT}`);

const preview = process.argv[2];
if (preview) {
  // rows: gender x muscle x height, columns: build
  const rowsOut = [];
  for (const g of ['male', 'female']) for (const m of MUSCLE) for (const d of HEIGHTS) rowsOut.push([g, m, d]);
  const cw = 64, img = newImage(cw * BUILDS.length, H * rowsOut.length);
  rowsOut.forEach(([g, m, d], r) => {
    BUILDS.forEach((b, c) => {
      const base = bases[baseName(g, b, m)];
      const bb = bbox(base);
      const s = d === 0 ? base : stretchImage(base, stretchRows(bb.y0, bb.y1 - bb.y0 + 1, d), d);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < cw; x++) {
          const sx = x + (W - cw) / 2, i = (y * W + sx) * 4;
          if (s.data[i + 3]) img.data.set(s.data.subarray(i, i + 4), ((r * H + y) * img.width + c * cw + x) * 4);
        }
    });
  });
  writePng(preview, img);
  console.log('Preview:', preview);
}
