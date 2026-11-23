// Builds the town's world art (golden-hour solarpunk set) into client/public/world/:
//
//   world/decor/<name>.png   one horizontal strip of animation frames per decor piece (2x game pixels)
//   world/decor.json         list of decor pieces: frame size, frame count, fps, anchor, blocks, glow
//   world/terrain/<set>.png  4x4 corner (Wang) autotile sheets at 2x (64 px tiles)
//   world/terrain/<set>.json which sheet frame to use for each corner combination
//
//   node scripts/build-world.mjs
//
// Sources: scripts/art-src/world/ (PixelLab, 2026-11-22; every prompt starts with the owner's
// Stardew Valley x Scott Pilgrim sentence and names Studio Ghibli as the mood reference).
//   terrain/grass-path.*   create_topdown_tileset pro 352f7f4a-c2f4-4517-941b-a403adfb6dbe (palette "golden hour meadow")
//   terrain/water-grass.*  create_topdown_tileset pro 59147c01-5d40-41c4-8e4e-521cc87e834c (chained to the same grass)
//   decor/<name>.png       create_map_object stills; decor/<name>/00..07.png = animate_object v3 loops
//                          (end frame = the still, so the loop closes; the 9th returned frame is dropped)
// Small plants are animated here for free (scripts/world-sway.mjs).
// Every decor pixel is mapped to the nearest colour of the approved palette (ground + first test
// pieces), so all pieces share the same warm colours.

import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, newImage, writePng } from './png.mjs';
import { swayFrames, bobFrames, driftFrames, hangFrames } from './world-sway.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scripts', 'art-src', 'world');
const OUT = join(ROOT, 'client', 'public', 'world');
const SCALE = 2; // art is drawn at 32 px per tile; the game uses 64 px tiles

// kind: 'ai' = PixelLab loop in decor/<name>/, 'sway' / 'bob' / 'drift' = made here, 'static' = one frame.
// blocks: players can't walk through its base tile. glow: give it a soft light in the lighting overlay.
// fps: a calm default; the game should vary it a little per instance (and start on a random frame).
export const DECOR = [
  { name: 'tree-oak', kind: 'ai', fps: 6, blocks: true },
  { name: 'tree-blossom', kind: 'ai', fps: 6, blocks: true },
  { name: 'tree-willow', kind: 'ai', fps: 6, blocks: true },
  { name: 'tree-mushroom', kind: 'ai', fps: 6, blocks: true },
  { name: 'tree-solar', kind: 'ai', fps: 6, blocks: true, glow: true },
  { name: 'bush-berry', kind: 'ai', fps: 6, blocks: true },
  { name: 'bush-hedge', kind: 'ai', fps: 6, blocks: true },
  { name: 'flowers-gold', kind: 'sway', fps: 5 },
  { name: 'flowers-blue', kind: 'sway', fps: 5 },
  { name: 'flowers-poppy', kind: 'sway', fps: 5 },
  { name: 'grass-tuft', kind: 'sway', fps: 5, offsets: [0, 1, 2, 2, 1, 0, -1, -1] },
  { name: 'fern', kind: 'sway', fps: 4, offsets: [0, 1, 1, 1, 0, -1, -1, -1] },
  { name: 'reeds', kind: 'sway', fps: 5, offsets: [0, 1, 2, 3, 2, 1, 0, -1], rooted: 4 },
  { name: 'mush-red', kind: 'bob', fps: 4 },
  { name: 'mush-glow', kind: 'bob', fps: 4, glow: true },
  { name: 'lilypads', kind: 'drift', fps: 2 },
  { name: 'log-shelf', kind: 'static', blocks: true },
  { name: 'lamp', kind: 'static', blocks: true, glow: true },
];

// ---- palette -------------------------------------------------------------------------------
const PALETTE_SOURCES = [
  'terrain/grass-path.png', 'terrain/water-grass.png',
  'decor/tree-oak.png', 'decor/tree-blossom.png', 'decor/mush-red.png', 'decor/mush-glow.png', 'decor/flowers-blue.png',
];
const palette = [];
{
  const seen = new Set();
  for (const f of PALETTE_SOURCES) {
    const img = readPng(join(SRC, f));
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i + 3] < 200) continue;
      const k = (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2];
      if (!seen.has(k)) { seen.add(k); palette.push([img.data[i], img.data[i + 1], img.data[i + 2]]); }
    }
  }
}
const nearCache = new Map();
function nearest(r, g, b) {
  const k = (r << 16) | (g << 8) | b;
  let c = nearCache.get(k);
  if (c) return c;
  let best = Infinity;
  for (const p of palette) {
    const d = (p[0] - r) ** 2 * 0.3 + (p[1] - g) ** 2 * 0.59 + (p[2] - b) ** 2 * 0.11;
    if (d < best) { best = d; c = p; }
  }
  nearCache.set(k, c);
  return c;
}
function harmonize(img) {
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < 128) { img.data.set([0, 0, 0, 0], i); continue; }
    const [r, g, b] = nearest(img.data[i], img.data[i + 1], img.data[i + 2]);
    img.data.set([r, g, b, 255], i);
  }
  return img;
}

// ---- helpers -------------------------------------------------------------------------------
function strip(frames, scale) {
  const w = frames[0].width, h = frames[0].height;
  const out = newImage(w * frames.length * scale, h * scale);
  frames.forEach((f, n) => {
    for (let y = 0; y < h * scale; y++)
      for (let x = 0; x < w * scale; x++) {
        const s = (Math.floor(y / scale) * w + Math.floor(x / scale)) * 4;
        out.data.set(f.data.subarray(s, s + 4), (y * out.width + n * w * scale + x) * 4);
      }
  });
  return out;
}
// Lowest opaque row over all frames: the "feet" (where the piece touches the ground).
function baseRow(frames) {
  let bottom = 0;
  for (const f of frames)
    for (let y = 0; y < f.height; y++)
      for (let x = 0; x < f.width; x++) if (f.data[(y * f.width + x) * 4 + 3]) bottom = Math.max(bottom, y);
  return bottom;
}

// ---- decor ---------------------------------------------------------------------------------
mkdirSync(join(OUT, 'decor'), { recursive: true });
const manifest = {};
for (const d of DECOR) {
  const still = readPng(join(SRC, 'decor', `${d.name}.png`));
  let frames;
  if (d.kind === 'ai') {
    const dir = join(SRC, 'decor', d.name);
    frames = readdirSync(dir).filter((f) => f.endsWith('.png')).sort().slice(0, 8).map((f) => readPng(join(dir, f)));
  } else if (d.kind === 'sway') frames = swayFrames(still, d.offsets, d.rooted);
  else if (d.kind === 'bob') frames = bobFrames(still);
  else if (d.kind === 'drift') frames = driftFrames(still);
  else frames = [still];
  frames = frames.map(harmonize);
  writePng(join(OUT, 'decor', `${d.name}.png`), strip(frames, SCALE));
  const w = frames[0].width, h = frames[0].height;
  manifest[d.name] = {
    file: `world/decor/${d.name}.png`,
    frameWidth: w * SCALE,
    frameHeight: h * SCALE,
    frames: frames.length,
    fps: d.fps ?? 0,
    // Put the sprite's origin here (as a fraction of the frame) and its position on the tile's
    // bottom-centre: then the piece stands on its tile and depth = y sorts it with the players.
    originX: 0.5,
    originY: +((baseRow(frames) + 1) / h).toFixed(3),
    blocks: !!d.blocks,
    glow: !!d.glow,
  };
}
writeFileSync(join(OUT, 'decor.json'), JSON.stringify(manifest, null, 2) + '\n');

// ---- terrain (corner autotiles) ------------------------------------------------------------
mkdirSync(join(OUT, 'terrain'), { recursive: true });
for (const [set, lower, upper] of [['grass-path', 'path', 'grass'], ['water-grass', 'water', 'grass']]) {
  const sheet = readPng(join(SRC, 'terrain', `${set}.png`));
  const meta = JSON.parse(readFileSync(join(SRC, 'terrain', `${set}.json`), 'utf8'));
  const T = meta.tile_size?.width ?? 32;
  const cols = sheet.width / T;
  const big = strip([sheet], SCALE);
  writePng(join(OUT, 'terrain', `${set}.png`), big);
  // key = corners NW NE SW SE as four digits, 1 = upper terrain (grass), 0 = lower (path / water)
  const tiles = {};
  for (const t of meta.tileset_data.tiles) {
    const c = t.corners;
    const key = ['NW', 'NE', 'SW', 'SE'].map((k) => (c[k] === 'upper' ? 1 : 0)).join('');
    tiles[key] = (t.bounding_box.y / T) * cols + t.bounding_box.x / T;
  }
  writeFileSync(join(OUT, 'terrain', `${set}.json`), JSON.stringify({
    file: `world/terrain/${set}.png`, tileSize: T * SCALE, columns: cols,
    lower, upper,
    note: 'tiles[key] = frame index in the sheet; key = corners NW,NE,SW,SE as 4 digits, 1 = upper (grass), 0 = lower. "1111" = plain grass, "0000" = plain lower.',
    tiles,
  }, null, 2) + '\n');
}

// ---- buildings -----------------------------------------------------------------------------
// One sprite per place in town (ids match PROPERTIES in client/src/world/properties.ts):
// building-0..3 are always standing, lot-4..7 appear once someone builds on the lot.
// doorX = the middle of the door in the 1x sprite, measured by eye; the game lines it up with the
// middle of the door tile, and puts the lowest opaque row on the bottom edge of the footprint.
// Sources: create_map_object (low top-down, 1 gen each) 2026-11-22; first tries in rejected/buildings-v1.
export const BUILDINGS = [
  { id: 0, name: 'building-0', doorX: 96 }, // cottage
  { id: 1, name: 'building-1', doorX: 80 }, // greenhouse tea house
  { id: 2, name: 'building-2', doorX: 110 }, // bakery workshop
  { id: 3, name: 'building-3', doorX: 112 }, // community hall
  { id: 4, name: 'lot-4', doorX: 80 }, // hill home
  { id: 5, name: 'lot-5', doorX: 82 }, // townhouse
  { id: 6, name: 'lot-6', doorX: 61 }, // mushroom house
  { id: 7, name: 'lot-7', doorX: 43 }, // garden cottage
];
mkdirSync(join(OUT, 'buildings'), { recursive: true });
// Vines: PixelLab inpaint_image painted vines into each building under its eaves (10 gens each,
// masks = the rects in buildings/vines/rects.json); only the vine-coloured pixels were lifted out
// into buildings/vines/<name>.png, so the building itself stays exactly as approved. Here the vine
// layer is bent per frame (hangFrames) and drawn over the building: each building is an 8-frame strip.
const VINE_RECTS = JSON.parse(readFileSync(join(SRC, 'buildings', 'vines', 'rects.json'), 'utf8'));
function buildingFrames(baseName, vineName) {
  const base = readPng(join(SRC, 'buildings', `${baseName}.png`));
  const vineFile = join(SRC, 'buildings', 'vines', `${vineName}.png`);
  if (!existsSync(vineFile)) return [base];
  return hangFrames(readPng(vineFile), VINE_RECTS[vineName]).map((v) => {
    const f = { width: base.width, height: base.height, data: new Uint8Array(base.data) };
    for (let i = 0; i < v.data.length; i += 4) if (v.data[i + 3]) f.data.set(v.data.subarray(i, i + 4), i);
    return f;
  });
}
const bmanifest = {};
for (const b of BUILDINGS) {
  const frames = buildingFrames(b.name, b.name).map(harmonize);
  writePng(join(OUT, 'buildings', `${b.name}.png`), strip(frames, SCALE));
  bmanifest[b.id] = {
    file: `world/buildings/${b.name}.png`,
    width: frames[0].width * SCALE, // one frame
    height: frames[0].height * SCALE,
    frames: frames.length,
    fps: 5,
    // Place the frame's top-left at: x = doorTileCentreX - doorX, y = footprintBottomY - baseY.
    // Depth = footprintBottomY so players walking in front of it are drawn over it.
    doorX: b.doorX * SCALE,
    baseY: (baseRow(frames) + 1) * SCALE,
  };
}
// The cottage also has a softer lavender-wisteria version (same size and door), not used by default.
{
  const frames = buildingFrames('building-0', 'building-0-wisteria').map(harmonize);
  writePng(join(OUT, 'buildings', 'building-0-wisteria.png'), strip(frames, SCALE));
  bmanifest[0].variants = { wisteria: 'world/buildings/building-0-wisteria.png' };
}
writeFileSync(join(OUT, 'buildings.json'), JSON.stringify(bmanifest, null, 2) + '\n');

console.log(`World art: ${DECOR.length} decor pieces, ${BUILDINGS.length} buildings, 2 terrain sets, palette ${palette.length} colours -> ${OUT}`);
if (!existsSync(join(OUT, 'decor.json'))) process.exit(1);
