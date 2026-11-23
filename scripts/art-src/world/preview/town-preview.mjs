// Preview of the whole town with autotiled ground + decor (frame 0), y-sorted, at 1x (32 px tiles).
import { readFileSync } from 'node:fs';
import { readPng, newImage, writePng } from '/Users/aaronaguirre/Documents/GitHub/DigiCommune/scripts/png.mjs';
const R = '/Users/aaronaguirre/Documents/GitHub/DigiCommune/';
const W = 40, H = 30, S = 32;
const T = { GRASS: 0, PATH: 1, WATER: 2, TREE: 3, WALL: 4, DOOR: 5, FLOWER: 6 };
const PROPS = [
  { id: 0, kind: 'building', x: 4, y: 3, w: 6, h: 5, door: { x: 7, y: 7 }, top: false },
  { id: 1, kind: 'building', x: 13, y: 3, w: 5, h: 5, door: { x: 15, y: 7 }, top: false },
  { id: 2, kind: 'building', x: 5, y: 19, w: 6, h: 5, door: { x: 8, y: 23 }, top: false, walk: [[4, 24], [4, 16]] },
  { id: 3, kind: 'building', x: 26, y: 19, w: 7, h: 5, door: { x: 29, y: 23 }, top: false, walk: [[25, 24], [25, 16]] },
  { id: 4, kind: 'lot', x: 13, y: 19, w: 5, h: 5, door: { x: 15, y: 23 }, top: false, walk: [[18, 24]] },
  { id: 5, kind: 'lot', x: 22, y: 3, w: 4, h: 5, door: { x: 24, y: 7 }, top: false },
  { id: 6, kind: 'lot', x: 34, y: 19, w: 4, h: 5, door: { x: 35, y: 23 }, top: false, walk: [[38, 24], [38, 16]] },
  { id: 7, kind: 'lot', x: 1, y: 9, w: 4, h: 4, door: { x: 2, y: 12 }, top: false },
];
function seeded(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const rand = seeded(1234);
const d = Array.from({ length: H }, () => Array(W).fill(T.GRASS));
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const r = rand(); if (r < 0.07) d[y][x] = T.TREE; else if (r < 0.15) d[y][x] = T.FLOWER; }
for (let x = 0; x < W; x++) { d[0][x] = T.TREE; d[H - 1][x] = T.TREE; }
for (let y = 0; y < H; y++) { d[y][0] = T.TREE; d[y][W - 1] = T.TREE; }
for (let x = 1; x < W - 1; x++) { d[14][x] = T.PATH; d[15][x] = T.PATH; }
for (let y = 1; y < H - 1; y++) { d[y][19] = T.PATH; d[y][20] = T.PATH; }
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dx = (x - 31) / 5, dy = (y - 7) / 3; if (dx * dx + dy * dy <= 1) d[y][x] = T.WATER; }
for (const p of PROPS) {
  const built = p.kind === 'building' || process.env.LOTS === 'built';
  for (let yy = p.y; yy < p.y + p.h; yy++) for (let xx = p.x; xx < p.x + p.w; xx++) d[yy][xx] = built ? T.WALL : T.PATH;
  if (built) d[p.door.y][p.door.x] = T.DOOR;
  if (p.walk) { const pts = [[p.door.x, p.door.y + 1], ...p.walk]; for (let i = 1; i < pts.length; i++) { const [ax, ay] = pts[i-1], [bx, by] = pts[i]; const sx = Math.sign(bx-ax), sy = Math.sign(by-ay); for (let x = ax, y = ay; ; x += sx, y += sy) { d[y][x] = T.PATH; if (x === bx && y === by) break; } } }
  else if (p.top) for (let yy = p.door.y - 1; yy >= 16; yy--) d[yy][p.door.x] = T.PATH; else for (let yy = p.door.y + 1; yy <= 13; yy++) d[yy][p.door.x] = T.PATH;
}
// --- ground
const out = newImage(W * S, H * S);
function blit(src, sx, sy, w, h, dx, dy, k = 1) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = dx + x, Y = dy + y; if (X < 0 || Y < 0 || X >= out.width || Y >= out.height) continue;
    const s = ((sy + y * k) * src.width + sx + x * k) * 4, a = src.data[s + 3] / 255; if (!a) continue;
    const o = (Y * out.width + X) * 4;
    for (let j = 0; j < 3; j++) out.data[o + j] = Math.round(src.data[s + j] * a + out.data[o + j] * (1 - a)); out.data[o + 3] = 255;
  }
}
const terr = (set) => ({ img: readPng(R + `client/public/world/terrain/${set}.png`), meta: JSON.parse(readFileSync(R + `client/public/world/terrain/${set}.json`)) });
const gp = terr('grass-path'), wg = terr('water-grass');
const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? T.GRASS : d[y][x]);
const isPath = (t) => t === T.PATH || t === T.DOOR;
// DUAL GRID: each drawn ground tile sits on a tile CORNER; its 4 corners are the 4 map tiles around it.
// So terrain edges land exactly on tile borders. Drawn tiles go from -1..W-1 (one extra row/column).
const lowerP = (x, y) => isPath(at(x, y));
const lowerW = (x, y) => at(x, y) === T.WATER;
const tileOf = (set, key) => { const f = set.meta.tiles[key]; return [(f % 4) * 64, Math.floor(f / 4) * 64]; };
const brick = readPng(R + 'client/public/tiles/tiles.png');
for (let y = -1; y < H; y++) for (let x = -1; x < W; x++) {
  const c = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]];
  const wkey = c.map(([a, b]) => (lowerW(a, b) ? 0 : 1)).join('');
  const pkey = c.map(([a, b]) => (lowerP(a, b) ? 0 : 1)).join('');
  const set = wkey !== '1111' ? wg : gp, key = wkey !== '1111' ? wkey : pkey;
  const [sx, sy] = tileOf(set, key); blit(set.img, sx, sy, S, S, x * S + S / 2, y * S + S / 2, 2);
}
// --- decor
const man = JSON.parse(readFileSync(R + 'client/public/world/decor.json'));
const sprite = Object.fromEntries(Object.entries(man).map(([n, m]) => [n, { img: readPng(R + 'client/public/' + m.file), ...m }]));
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h ^ (h >>> 16)) / 4294967296; };
const pick = (list, r) => { let t = list.reduce((a, [, w]) => a + w, 0) * r; for (const [n, w] of list) { if ((t -= w) < 0) return n; } return list[0][0]; };
const nearWater = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => at(x + a, y + b) === T.WATER);
const TREES = [['tree-oak', 30], ['tree-blossom', 15], ['tree-solar', 12], ['tree-mushroom', 10], ['tree-willow', 8], ['bush-berry', 12], ['bush-hedge', 13]];
const BORDER = [['tree-oak', 45], ['tree-willow', 15], ['tree-blossom', 15], ['bush-hedge', 25]];
const SMALL = [['flowers-gold', 18], ['flowers-blue', 16], ['flowers-poppy', 16], ['mush-red', 10], ['mush-glow', 6], ['fern', 14], ['grass-tuft', 20]];
const items = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const t = d[y][x], r = hash(x, y);
  let n = null;
  const border = x === 0 || y === 0 || x === W - 1 || y === H - 1;
  if (t === T.TREE) n = nearWater(x, y) ? 'tree-willow' : pick(border ? BORDER : TREES, r);
  else if (t === T.FLOWER) n = pick(SMALL, r);
  else if (t === T.GRASS && nearWater(x, y) && r < 0.22) n = 'reeds';
  else if (t === T.GRASS && r < 0.035) n = 'grass-tuft';
  else if (t === T.WATER && !nearWater(x, y) === false && r < 0.0) n = null;
  else if (t === T.WATER && r < 0.12 && [[1,0],[-1,0],[0,1],[0,-1]].every(([a,b]) => at(x+a,y+b) === T.WATER)) n = 'lilypads';
  if (!n) continue;
  const s = sprite[n];
  items.push({ s, x: x * S + S / 2, y: n === 'lilypads' ? y * S + S : y * S + S });
}
// lamps along the main road (grass tiles just above/below it)
for (let x = 3; x < W - 2; x += 6) for (const yy of [13, 16]) { const xx = yy === 13 ? x : x + 3; if (at(xx, yy) === T.GRASS || at(xx, yy) === T.FLOWER) items.push({ s: sprite.lamp, x: xx * S + S / 2, y: yy * S + S }); }
const bman = JSON.parse(readFileSync(R + 'client/public/world/buildings.json'));
for (const p of PROPS) {
  if (!(p.kind === 'building' || process.env.LOTS === 'built')) continue;
  const b = bman[p.id], img = readPng(R + 'client/public/' + b.file);
  const fy = (p.y + p.h) * S;
  items.push({ b: { img, x: Math.round((p.door.x * S + S / 2) - b.doorX / 2), y: Math.round(fy - b.baseY / 2), w: b.width / 2, h: b.height / 2 }, y: fy });
}
items.sort((a, b) => a.y - b.y);
for (const it of items) {
  if (it.b) { blit(it.b.img, 0, 0, it.b.w, it.b.h, it.b.x, it.b.y, 2); continue; }
  const fw = it.s.frameWidth / 2, fh = it.s.frameHeight / 2;
  blit(it.s.img, 0, 0, fw, fh, Math.round(it.x - fw * it.s.originX), Math.round(it.y - fh * it.s.originY), 2);
}
// demo: the test cottage on building 0
writePng(process.argv[2], out);
