// Builds client/public/tiles/tiles.png: one row of 32x32 tiles in the order of T in
// client/src/world/townMap.ts, from the PixelLab downloads in scripts/art-src/tiles/.
// The game scales each tile up 2x (see client/src/world/tileset.ts).
//
//   node scripts/build-tiles.mjs
//
// Run `node scripts/build-world.mjs` first: grass, path, water and the flower tile now come from the
// golden-hour world set (scripts/art-src/world/). The older sources below are still used for the rest.
// Sources (PixelLab, 2026-11-21, prompts name Stardew Valley x Scott Pilgrim as the style):
//   grass-path.png, water.png  (no longer used: replaced by the world terrain sets)
//   floors.png      topdown tileset (wood lower / leafy carpet upper)
//   ceramic.png     topdown tileset (checkered ceramic lower / same wood upper)
//   walls.png       topdown tileset (cream plaster lower / mossy brick upper)
//   tree.png, mushrooms.png, doormat.png  32px sprites (transparent), door.png 32px tile
// In every 4x4 Wang sheet the all-lower tile is at (64,32) and the all-upper tile at (0,96).

import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, newImage, writePng } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scripts', 'art-src', 'tiles');
const OUT_DIR = join(ROOT, 'client', 'public', 'tiles');
const S = 32;
const LOWER = [64, 32];
const UPPER = [0, 96];

const src = (f) => readPng(join(SRC, f));
const crop = (img, [x0, y0]) => {
  const t = newImage(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = ((y0 + y) * img.width + x0 + x) * 4;
      t.data.set(img.data.subarray(i, i + 4), (y * S + x) * 4);
    }
  return t;
};
const clone = (t) => ({ width: t.width, height: t.height, data: new Uint8Array(t.data) });

// Draw a sprite over a tile (alpha blend), optionally scaled down around its center
function over(base, sprite) {
  const out = clone(base);
  for (let i = 0; i < S * S * 4; i += 4) {
    const a = sprite.data[i + 3] / 255;
    if (!a) continue;
    for (let j = 0; j < 3; j++) out.data[i + j] = Math.round(sprite.data[i + j] * a + out.data[i + j] * (1 - a));
    out.data[i + 3] = 255;
  }
  return out;
}

// Keep only the opaque blob that touches the middle of the sprite (drops stray bits at the edges).
// Pixels outside `keepBox` [x0, y0, x1, y1] are cleared first, cutting bits that touch the blob.
function centerBlob(input, keepBox = [0, 0, S - 1, S - 1]) {
  const img = clone(input);
  for (let k = 0; k < S * S; k++) {
    const x = k % S, y = Math.floor(k / S);
    if (x < keepBox[0] || y < keepBox[1] || x > keepBox[2] || y > keepBox[3]) img.data[k * 4 + 3] = 0;
  }
  const seen = new Uint8Array(S * S);
  const opaque = (k) => img.data[k * 4 + 3] > 40;
  let start = -1;
  for (let r = 0; r < 8 && start < 0; r++)
    for (let y = 16 - r; y <= 16 + r && start < 0; y++)
      for (let x = 16 - r; x <= 16 + r; x++) if (opaque(y * S + x)) { start = y * S + x; break; }
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const k = stack.pop();
    const x = k % S, y = Math.floor(k / S);
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
      const n = ny * S + nx;
      if (!seen[n] && opaque(n)) { seen[n] = 1; stack.push(n); }
    }
  }
  const out = clone(img);
  for (let k = 0; k < S * S; k++) if (!seen[k]) out.data[k * 4 + 3] = 0;
  return out;
}

// Mushrooms sprite came with a mossy dirt block under it: keep only the caps, stems and
// flowers (reds, pinks, creams, yellows) plus the dark outline pixels touching them.
function mushroomsOnly(img) {
  const keep = new Uint8Array(S * S);
  for (let k = 0; k < S * S; k++) {
    const [r, g, b, a] = img.data.subarray(k * 4, k * 4 + 4);
    if (a < 40) continue;
    const red = r > 140 && g < 110 && b < 120;
    const pink = r > 200 && b > 140 && g < 190;
    const cream = r > 200 && g > 180 && b > 150;
    const yellow = r > 200 && g > 170 && b < 110;
    if (red || pink || cream || yellow) keep[k] = 1;
  }
  const out = newImage(S, S);
  for (let k = 0; k < S * S; k++) {
    const x = k % S, y = Math.floor(k / S);
    const [r, g, b, a] = img.data.subarray(k * 4, k * 4 + 4);
    let use = keep[k];
    if (!use && a > 40 && r + g + b < 160) {
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + ox, ny = y + oy;
        if (nx >= 0 && ny >= 0 && nx < S && ny < S && keep[ny * S + nx]) use = 1;
      }
    }
    if (use) out.data.set([r, g, b, 255], k * 4);
  }
  return out;
}

// Remove tiny islands (fewer than 4 pixels) left over from cutting a sprite out
function dropSpecks(img) {
  const out = clone(img);
  const seen = new Uint8Array(S * S);
  for (let s0 = 0; s0 < S * S; s0++) {
    if (seen[s0] || !img.data[s0 * 4 + 3]) continue;
    const blob = [s0];
    seen[s0] = 1;
    for (let i = 0; i < blob.length; i++) {
      const x = blob[i] % S, y = Math.floor(blob[i] / S);
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
        const n = ny * S + nx;
        if (!seen[n] && img.data[n * 4 + 3]) { seen[n] = 1; blob.push(n); }
      }
    }
    if (blob.length < 4) for (const k of blob) out.data[k * 4 + 3] = 0;
  }
  return out;
}

// Ground (2026-11-22 golden-hour set, see scripts/build-world.mjs): plain grass / path / water tiles
// come from the world terrain sheets, picked by their corners ("1111" = all grass, "0000" = all lower).
const WORLD = join(ROOT, 'scripts', 'art-src', 'world', 'terrain');
const terrainTile = (set, key) => {
  const sheet = readPng(join(WORLD, `${set}.png`));
  const meta = JSON.parse(readFileSync(join(WORLD, `${set}.json`), 'utf8'));
  const t = meta.tileset_data.tiles.find((t) => ['NW', 'NE', 'SW', 'SE'].map((k) => (t.corners[k] === 'upper' ? 1 : 0)).join('') === key);
  return crop(sheet, [t.bounding_box.x, t.bounding_box.y]);
};
const grass = terrainTile('grass-path', '1111');
const path = terrainTile('grass-path', '0000');
const water = terrainTile('water-grass', '0000');
const flowers = readPng(join(ROOT, 'client', 'public', 'world', 'decor', 'flowers-gold.png')); // built at 2x
const flowerSprite = newImage(S, S);
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const i = ((y * 2) * flowers.width + x * 2) * 4; // first frame, back to 1x
  flowerSprite.data.set(flowers.data.subarray(i, i + 4), (y * S + x) * 4);
}
const floors = src('floors.png');
const wood = crop(floors, LOWER);
const carpet = crop(floors, UPPER);
const tileFloor = crop(src('ceramic.png'), LOWER);
const walls = src('walls.png');
const brick = crop(walls, UPPER);
const plaster = crop(walls, LOWER);

// Room wall: plaster with a wooden wainscot band along the bottom (like the old tile)
const roomWall = clone(plaster);
for (let y = 22; y < S; y++)
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const c = y === 22 ? [92, 52, 34] : y === 23 ? [168, 104, 62] : (x + (y > 27 ? 8 : 0)) % 16 === 0 ? [110, 64, 40] : [146, 88, 52];
    roomWall.data.set([...c, 255], i);
  }

const tiles = [
  grass, // 0 GRASS
  path, // 1 PATH
  water, // 2 WATER
  over(grass, centerBlob(src('tree.png'), [6, 0, 26, 31])), // 3 TREE
  brick, // 4 WALL
  src('door.png'), // 5 DOOR
  over(grass, flowerSprite), // 6 FLOWER (golden-hour wildflowers; run build-world.mjs first)
  wood, // 7 FLOOR_WOOD
  tileFloor, // 8 FLOOR_TILE
  carpet, // 9 FLOOR_CARPET
  roomWall, // 10 ROOM_WALL
  over(wood, src('doormat.png')), // 11 DOORMAT
];

const sheet = newImage(S * tiles.length, S);
tiles.forEach((t, i) => {
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const k = (y * S + x) * 4;
      sheet.data.set([t.data[k], t.data[k + 1], t.data[k + 2], 255], ((y * sheet.width) + i * S + x) * 4);
    }
});
mkdirSync(OUT_DIR, { recursive: true });
writePng(join(OUT_DIR, 'tiles.png'), sheet);
console.log(`Wrote ${tiles.length} tiles to ${join(OUT_DIR, 'tiles.png')}`);
