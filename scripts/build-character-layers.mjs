// Builds the character layer sheets in client/public/sprites/ from ONE PixelLab-generated
// base character (bald, plain grey top + shorts), so every layer lines up exactly.
//
//   node scripts/build-character-layers.mjs
//
// Input:  scripts/art-src/base-character/  (PixelLab export: rotations/*.png = standing,
//         animations/walk4/<dir>/frame_00N.png = 4-frame walk; south, west, north)
// Output: body.png, face.png, outfit-0..2.png, hair-0..2.png, accessory-1..3.png
//         (640 x 512 sheets, see docs/ART_SPEC.md)
//
// How each layer is made:
//   body      every skin pixel of the base, turned grey by brightness (tinted in game)
//   face      eyes / mouth: non-skin pixels and inner dark lines inside the head
//   outfit-N  the base's own shirt + shorts pixels (so they move with the walk), recoloured,
//             plus sleeves / trouser legs / shoes painted onto the arm and leg pixels
//   hair-N    painted onto the head pixels of each frame (and a bit around it)
//   accessory painted from the head and eye positions of each frame
// Only Node built-ins are used (see scripts/png.mjs).

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, newImage, writePng } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scripts', 'art-src', 'base-character');
const OUT = process.argv[2] || join(ROOT, 'client', 'public', 'sprites');

const FRAME = 128;
const COLS = 5;
const ROWS = 4; // down, left, right, up
const FEET_Y = 116; // must match FEET_Y in client/src/avatar/sprites.ts

// ---------- colour helpers ----------

const lum = (r, g, b) => (r + g + b) / 765;
const isSkin = (r, g, b) => r - b > 30 && r >= g; // warm reddish tones of the base's skin
const isOpaque = (c) => c && c[3] >= 128;

// Grey value that the game's tint turns into (brightness relative to the main skin tone).
// Matches tintLayer() in client/src/avatar/sprites.ts: f = 0.35 + 1.3 * grey/255.
function greyFor(relative) {
  const g = Math.round(((relative - 0.35) / 1.3) * 255);
  return Math.max(44, Math.min(235, g));
}
const G = (v) => [v, v, v, 255];
const OUTLINE = [28, 22, 26, 255]; // < 40: stays as drawn on tinted layers
const SKIN_OUTLINE = [60, 36, 32, 255]; // warm dark brown, saturated so it is not tinted

// Shade a fixed (non-tinted) colour by a relative brightness
function shade(hex, rel) {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  const k = Math.max(0.35, Math.min(1.35, rel));
  const f = (v) => (k <= 1 ? Math.round(v * k) : Math.round(v + (255 - v) * (k - 1)));
  return [f(r), f(g), f(b), 255];
}

// ---------- frame model ----------
// A frame is a 128x128 grid of [r,g,b,a] or null, already placed with feet at FEET_Y.

function loadFrame(file, dx, dy) {
  const img = readPng(file);
  const px = Array.from({ length: FRAME * FRAME }, () => null);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      if (img.data[i + 3] < 128) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= FRAME || ny >= FRAME) continue;
      px[ny * FRAME + nx] = [img.data[i], img.data[i + 1], img.data[i + 2], 255];
    }
  }
  return px;
}

function bbox(px) {
  let x0 = FRAME, y0 = FRAME, x1 = -1, y1 = -1;
  for (let y = 0; y < FRAME; y++)
    for (let x = 0; x < FRAME; x++)
      if (px[y * FRAME + x]) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
  return { x0, y0, x1, y1 };
}

function rawBbox(file) {
  const img = readPng(file);
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (img.data[(y * img.width + x) * 4 + 3] >= 128) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
  return { x0, y0, x1, y1 };
}

// ---------- analysing one frame ----------

const DIRS = [
  { row: 0, name: 'south', facing: 'down' },
  { row: 1, name: 'west', facing: 'left' },
  { row: 3, name: 'north', facing: 'up' },
];

function analyse(px, facing) {
  const at = (x, y) => (x < 0 || y < 0 || x >= FRAME || y >= FRAME ? null : px[y * FRAME + x]);
  const box = bbox(px);

  // Clothing = low-saturation pixels (the grey top and shorts and their outlines)
  const isCloth = (c) => c && !isSkin(c[0], c[1], c[2]);
  // Shirt starts at the first row (below the head) with a light grey pixel
  // (needs several in one row, so the white of the eyes doesn't count)
  let shirtTop = -1;
  for (let y = box.y0 + 10; y <= box.y1 && shirtTop < 0; y++) {
    let n = 0;
    for (let x = box.x0; x <= box.x1; x++) {
      const c = at(x, y);
      if (c && !isSkin(c[0], c[1], c[2]) && lum(c[0], c[1], c[2]) > 0.55 && Math.max(...c.slice(0, 3)) - Math.min(...c.slice(0, 3)) < 12) n++;
    }
    if (n >= 6) shirtTop = y;
  }
  const headBottom = shirtTop - 3; // rows above this belong to the head (neck is in between)

  // Head pixels (skin + face details)
  const head = new Set();
  for (let y = box.y0; y < headBottom; y++)
    for (let x = box.x0; x <= box.x1; x++) if (at(x, y)) head.add(y * FRAME + x);
  let hx0 = FRAME, hx1 = -1;
  for (const k of head) { hx0 = Math.min(hx0, k % FRAME); hx1 = Math.max(hx1, k % FRAME); }
  const headH = headBottom - box.y0;

  // Distance from the silhouette edge (for "inner" pixels)
  const edgeDist = (x, y) => {
    for (let d = 1; d <= 4; d++)
      for (let oy = -d; oy <= d; oy++)
        for (let ox = -d; ox <= d; ox++)
          if (!at(x + ox, y + oy)) return d;
    return 5;
  };

  // Face: non-skin pixels and dark inner lines inside the head, away from the edge
  const face = new Set();
  if (facing !== 'up') {
    for (const k of head) {
      const x = k % FRAME, y = Math.floor(k / FRAME);
      const c = px[k];
      if (y < box.y0 + headH * 0.35) continue; // nothing on the top of the head
      const skin = isSkin(c[0], c[1], c[2]);
      const dark = lum(c[0], c[1], c[2]) < 0.45;
      if ((!skin || dark) && edgeDist(x, y) >= 3) face.add(k);
    }
  }

  // Clothing split into top / shorts: light grey = top, dark grey = shorts,
  // outlines go to whichever is nearest.
  const top = new Set(), shorts = new Set();
  const outlines = [];
  for (let y = Math.max(shirtTop - 1, 0); y <= box.y1; y++)
    for (let x = box.x0; x <= box.x1; x++) {
      const c = at(x, y);
      if (!isCloth(c)) continue;
      const L = lum(c[0], c[1], c[2]);
      const sat = Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
      if (L > 0.55) top.add(y * FRAME + x);
      else if (L > 0.36 && sat < 12) shorts.add(y * FRAME + x);
      else outlines.push(y * FRAME + x);
    }
  for (const k of outlines) {
    const x = k % FRAME, y = Math.floor(k / FRAME);
    let best = null;
    for (let d = 1; d <= 6 && !best; d++)
      for (let oy = -d; oy <= d && !best; oy++)
        for (let ox = -d; ox <= d; ox++) {
          const n = (y + oy) * FRAME + (x + ox);
          if (top.has(n)) { best = top; break; }
          if (shorts.has(n)) { best = shorts; break; }
        }
    (best || shorts).add(k);
  }
  const outlineSet = new Set(outlines);

  let shortsTop = FRAME, shortsBottom = -1, topBottom = -1, tx0 = FRAME, tx1 = -1;
  for (const k of shorts) { const y = Math.floor(k / FRAME); shortsTop = Math.min(shortsTop, y); shortsBottom = Math.max(shortsBottom, y); }
  for (const k of top) { const x = k % FRAME, y = Math.floor(k / FRAME); topBottom = Math.max(topBottom, y); tx0 = Math.min(tx0, x); tx1 = Math.max(tx1, x); }

  // Arms / legs / feet: skin pixels below the head
  const arms = new Set(), legs = new Set(), feet = new Set(), neck = new Set();
  for (let y = headBottom; y <= box.y1; y++)
    for (let x = box.x0; x <= box.x1; x++) {
      const k = y * FRAME + x;
      const c = px[k];
      if (!c || top.has(k) || shorts.has(k)) continue;
      if (y < shirtTop) neck.add(k);
      else if (y < shortsBottom - 2) arms.add(k);
      else if (y >= box.y1 - 6) feet.add(k);
      else legs.add(k);
    }

  // Eyes (for glasses): the darkest face pixels
  const eyes = [...face].filter((k) => { const c = px[k]; return lum(c[0], c[1], c[2]) < 0.25; });

  return { px, at, box, shirtTop, headBottom, head, headH, hx0, hx1, face, top, shorts, outlineSet,
    shortsTop, shortsBottom, topBottom, tx0, tx1, arms, legs, feet, neck, eyes, facing, edgeDist };
}

// Is pixel k on the outside edge of the set (next to something not in the set)?
function onEdge(set, k) {
  const x = k % FRAME, y = Math.floor(k / FRAME);
  for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + ox, ny = y + oy;
    if (nx < 0 || ny < 0 || nx >= FRAME || ny >= FRAME || !set.has(ny * FRAME + nx)) return true;
  }
  return false;
}

// ---------- the layers (each returns a frame grid) ----------

const MAIN_SKIN_LUM = lum(0xf9, 0xb8, 0xa4); // main skin tone of the base

function bodyLayer(a) {
  const out = Array(FRAME * FRAME).fill(null);
  a.px.forEach((c, k) => {
    if (!c) return;
    if (a.top.has(k) || a.shorts.has(k)) { out[k] = [46, 58, 89, 255]; return; } // underwear, always covered
    if (a.face.has(k)) { out[k] = G(greyFor(1)); return; } // plain skin under the face layer
    if (!isSkin(c[0], c[1], c[2])) { out[k] = c; return; }
    const x = k % FRAME, y = Math.floor(k / FRAME);
    const silhouetteEdge = !a.at(x + 1, y) || !a.at(x - 1, y) || !a.at(x, y + 1) || !a.at(x, y - 1);
    if (silhouetteEdge && lum(c[0], c[1], c[2]) < 0.5) { out[k] = SKIN_OUTLINE; return; }
    out[k] = G(greyFor(lum(c[0], c[1], c[2]) / MAIN_SKIN_LUM));
  });
  return out;
}

function faceLayer(a) {
  const out = Array(FRAME * FRAME).fill(null);
  for (const k of a.face) out[k] = a.px[k];
  return out;
}

// Recolour a set of base pixels: tinted grey (hex = null) or a fixed colour
function paint(out, a, set, hex, { outline = true } = {}) {
  for (const k of set) {
    const c = a.px[k];
    if (!c) continue;
    if (outline && onEdgeOfFigure(a, k)) { out[k] = OUTLINE; continue; }
    // inner dark lines (seams, the far leg in shadow) become a dark shade, not black
    const rel = a.outlineSet.has(k) ? 0.6 : lum(c[0], c[1], c[2]) / setMainLum(a, set);
    out[k] = hex === null ? G(greyFor(rel)) : shade(hex, rel);
  }
}
function onEdgeOfFigure(a, k) {
  const x = k % FRAME, y = Math.floor(k / FRAME);
  return !a.at(x + 1, y) || !a.at(x - 1, y) || !a.at(x, y + 1) || !a.at(x, y - 1);
}
const mainLumCache = new WeakMap();
function setMainLum(a, set) {
  if (mainLumCache.has(set)) return mainLumCache.get(set);
  const counts = new Map();
  for (const k of set) {
    const c = a.px[k];
    if (!c || a.outlineSet.has(k)) continue;
    const key = c.slice(0, 3).join(',');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let best = null, n = -1;
  for (const [key, v] of counts) if (v > n) { n = v; best = key; }
  const L = best ? lum(...best.split(',').map(Number)) : 0.5;
  mainLumCache.set(set, L);
  return L;
}

// Skin pixels in a row range -> a new set (used for sleeves and trouser legs)
function rows(set, y0, y1) {
  const s = new Set();
  for (const k of set) { const y = Math.floor(k / FRAME); if (y >= y0 && y <= y1) s.add(k); }
  return s;
}
// Pixels of `set` that touch the outline of the figure or the edge of the set -> outline
function paintLimb(out, a, set, hex, relMain = 1) {
  for (const k of set) {
    const c = a.px[k];
    if (!c) continue;
    const L = lum(c[0], c[1], c[2]) / MAIN_SKIN_LUM;
    if (onEdgeOfFigure(a, k) || L < 0.4) { out[k] = OUTLINE; continue; }
    const rel = L * relMain;
    out[k] = hex === null ? G(greyFor(rel)) : shade(hex, rel);
  }
}
// Close the open end of a sleeve / leg with an outline row
function capBelow(out, a, set) {
  for (const k of set) {
    const below = k + FRAME;
    if (a.px[below] && !set.has(below) && !a.top.has(below) && !a.shorts.has(below) && out[below] === null) out[below] = OUTLINE;
  }
}

function trousers(out, a, hex, shoeHex, tinted = false) {
  paint(out, a, a.shorts, tinted ? null : hex);
  paintLimb(out, a, a.legs, tinted ? null : hex, 0.92);
  paintLimb(out, a, a.feet, shoeHex);
}

function outfitTShirt(a) {
  const out = Array(FRAME * FRAME).fill(null);
  paint(out, a, a.top, null);
  const sleeves = rows(a.arms, a.shirtTop - 1, a.shirtTop + 7);
  paintLimb(out, a, sleeves, null, 1.0);
  capBelow(out, a, sleeves);
  trousers(out, a, 0x3b5b8c, 0x6b3f2a);
  return out;
}

function outfitHoodie(a) {
  const out = Array(FRAME * FRAME).fill(null);
  paint(out, a, a.top, null);
  const sleeves = rows(a.arms, a.shirtTop - 1, a.shortsTop - 4);
  paintLimb(out, a, sleeves, null, 0.95);
  capBelow(out, a, sleeves);
  // hood collar around the neck
  const collar = new Set([...a.neck]);
  paintLimb(out, a, collar, null, 0.8);
  // front pocket line (front view only)
  if (a.facing === 'down') {
    const py = a.topBottom - 5;
    for (let x = a.tx0 + 6; x <= a.tx1 - 6; x++) if (a.top.has(py * FRAME + x)) out[py * FRAME + x] = G(70);
  }
  trousers(out, a, 0x33405a, 0xefe3c8);
  return out;
}

function outfitOveralls(a) {
  const out = Array(FRAME * FRAME).fill(null);
  // shirt underneath: a fixed warm red, short sleeves
  paint(out, a, a.top, 0xc8553d);
  const sleeves = rows(a.arms, a.shirtTop - 1, a.shirtTop + 6);
  paintLimb(out, a, sleeves, 0xc8553d);
  capBelow(out, a, sleeves);
  // bib: lower part of the top, middle columns (front and back)
  const midX = (a.tx0 + a.tx1) / 2;
  const half = Math.max(5, Math.round((a.tx1 - a.tx0) * 0.3));
  const bibTop = Math.round(a.shirtTop + (a.topBottom - a.shirtTop) * 0.4);
  const bib = new Set();
  for (const k of a.top) {
    const x = k % FRAME, y = Math.floor(k / FRAME);
    if (y >= bibTop && Math.abs(x - midX) <= half) bib.add(k);
  }
  paint(out, a, bib, null, { outline: false });
  for (const k of bib) if (onEdge(bib, k) && !a.top.has(k + FRAME) === false) { /* keep fill */ }
  for (const k of bib) {
    const x = k % FRAME, y = Math.floor(k / FRAME);
    if (y === bibTop || Math.abs(x - midX) >= half) out[k] = OUTLINE;
  }
  // straps from the bib to the shoulders
  if (a.facing !== 'left') {
    for (const sx of [Math.round(midX - half + 1), Math.round(midX + half - 1)])
      for (let y = a.shirtTop; y < bibTop; y++) {
        const k = y * FRAME + sx;
        if (a.top.has(k)) { out[k] = G(120); if (a.top.has(k + 1)) out[k + 1] = G(96); }
      }
  } else {
    const sx = Math.round(midX);
    for (let y = a.shirtTop; y < bibTop; y++) { const k = y * FRAME + sx; if (a.top.has(k)) { out[k] = G(120); out[k + 1] = G(96); } }
  }
  trousers(out, a, null, 0x5a3a26, true);
  return out;
}

// ---------- hair ----------

// Builds a hair mask from the head, then shades it (mid grey, light top, dark edge).
function hairLayer(a, style) {
  const out = Array(FRAME * FRAME).fill(null);
  const mask = new Set();
  const { box, headH, hx0, hx1, facing } = a;
  const y0 = box.y0;
  const cx = (hx0 + hx1) / 2;
  const add = (x, y) => { if (x >= 0 && y >= 0 && x < FRAME && y < FRAME) mask.add(y * FRAME + x); };

  for (const k of a.head) {
    const x = k % FRAME, y = Math.floor(k / FRAME);
    const t = (y - y0) / headH; // 0 top of head .. 1 chin
    const fromEdge = Math.min(x - hx0, hx1 - x);
    let on = false;
    if (facing === 'up') on = t < 0.8;
    else if (facing === 'down') on = t < 0.3 || (t < 0.5 && fromEdge < 4);
    else {
      // facing left: the back of the head is on the right
      const back = x > cx + 1;
      on = t < 0.3 || (back && t < 0.62) || (t < 0.45 && x > cx - 4);
    }
    if (style === 1 && facing === 'down' && fromEdge < 6 && t < 1) on = true;
    if (on) add(x, y);
  }

  // A little volume: grow 1px outward above and to the sides of the head
  const grown = new Set(mask);
  for (const k of mask) {
    const x = k % FRAME, y = Math.floor(k / FRAME);
    for (const [ox, oy] of [[0, -1], [-1, 0], [1, 0], [-1, -1], [1, -1]]) {
      const n = (y + oy) * FRAME + (x + ox);
      if (!a.px[n]) grown.add(n);
    }
  }
  for (const k of grown) mask.add(k);

  // Long hair: curtains hanging down to the shoulders, rounded at the ends
  if (style === 1) {
    const bottom = a.headBottom + 8;
    const yStart = Math.round(y0 + headH * 0.35);
    if (facing === 'down') {
      for (let y = yStart; y <= bottom; y++) {
        const inset = y > bottom - 2 ? 1 : 0;
        for (let x = hx0 - 1 + inset; x <= hx0 + 3; x++) add(x, y);
        for (let x = hx1 - 3; x <= hx1 + 1 - inset; x++) add(x, y);
      }
    } else if (facing === 'up') {
      for (let y = y0 + Math.round(headH * 0.5); y <= bottom; y++) {
        const inset = 2 + Math.max(0, y - (bottom - 3));
        for (let x = hx0 + inset; x <= hx1 - inset; x++) add(x, y);
      }
    } else {
      for (let y = y0 + Math.round(headH * 0.4); y <= bottom - 2; y++) {
        const inset = Math.max(0, y - (bottom - 5));
        for (let x = Math.round(cx + 1); x <= hx1 + 1 - inset; x++) add(x, y);
      }
    }
  }

  // Spiky hair: triangles sticking up from the top of the head
  if (style === 2) {
    const n = facing === 'left' ? 4 : 5;
    const w = (hx1 - hx0) / n;
    for (let i = 0; i < n; i++) {
      const sx = hx0 + w * i + w / 2 + (facing === 'left' ? 2 : 0);
      const h = 6 + ((i * 7) % 3);
      for (let dy = 0; dy < h; dy++) {
        const half = (w / 2) * (1 - dy / h);
        for (let x = Math.round(sx - half); x <= Math.round(sx + half); x++) add(x, y0 - dy + 2);
      }
    }
  }

  // Shade: outline on the outside edge, shadow along the bottom, highlight band near the top
  for (const k of mask) {
    const x = k % FRAME, y = Math.floor(k / FRAME);
    const t = (y - y0) / headH;
    if (onEdge(mask, k)) { out[k] = OUTLINE; continue; }
    if (!mask.has(k + 2 * FRAME) || !mask.has(k + FRAME)) { out[k] = G(92); continue; }
    const hl = t > 0.04 && t < 0.14 && x > cx - (hx1 - hx0) * 0.3 && x < cx + (hx1 - hx0) * 0.1;
    out[k] = G(hl ? 176 : (x + y) % 9 === 0 ? 108 : 128);
  }
  // Fringe strands on the forehead (front view)
  if (facing === 'down' && style !== 2) {
    const fy = Math.round(y0 + headH * 0.3);
    for (let x = hx0 + 3; x <= hx1 - 3; x++) {
      const k = fy * FRAME + x;
      if (mask.has(k) && x % 4 === 0) out[k + FRAME] = OUTLINE;
    }
  }
  return out;
}

// ---------- accessories (fixed colours) ----------

function glasses(a) {
  const out = Array(FRAME * FRAME).fill(null);
  if (a.facing === 'up' || a.eyes.length === 0) return out;
  const frame = [34, 30, 40, 255];
  const lens = [150, 210, 255, 110];
  const ey = Math.round(a.eyes.reduce((s, k) => s + Math.floor(k / FRAME), 0) / a.eyes.length);
  const xs = a.eyes.map((k) => k % FRAME);
  const ring = (cx, cy, r) => {
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r - 1; x <= cx + r + 1; x++) {
        const edge = y === cy - r || y === cy + r || x === cx - r - 1 || x === cx + r + 1;
        out[y * FRAME + x] = edge ? frame : lens;
      }
  };
  if (a.facing === 'down') {
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    const left = xs.filter((x) => x < mid), right = xs.filter((x) => x >= mid);
    const lc = Math.round(left.reduce((s, x) => s + x, 0) / left.length);
    const rc = Math.round(right.reduce((s, x) => s + x, 0) / right.length);
    ring(lc, ey, 3);
    ring(rc, ey, 3);
    for (let x = lc + 5; x <= rc - 5; x++) out[(ey - 1) * FRAME + x] = frame;
    for (let x = a.hx0; x <= lc - 5; x++) out[(ey - 1) * FRAME + x] = frame;
    for (let x = rc + 5; x <= a.hx1; x++) out[(ey - 1) * FRAME + x] = frame;
  } else {
    const ex = Math.round(xs.reduce((s, x) => s + x, 0) / xs.length);
    ring(ex, ey, 3);
    for (let x = ex + 5; x <= Math.round((a.hx0 + a.hx1) / 2) + 3; x++) out[(ey - 1) * FRAME + x] = frame;
  }
  return out;
}

function cap(a) {
  const out = Array(FRAME * FRAME).fill(null);
  const { box, headH, hx0, hx1, facing } = a;
  const y0 = box.y0;
  const brimY = Math.round(y0 + headH * 0.3);
  const mask = new Set();
  for (const k of a.head) if (Math.floor(k / FRAME) <= brimY) mask.add(k);
  for (const k of [...mask]) if (!a.px[k - FRAME]) mask.add(k - FRAME);
  for (const k of mask) {
    const x = k % FRAME;
    out[k] = onEdge(mask, k) ? [70, 22, 20, 255] : shade(0xd9503f, x < (hx0 + hx1) / 2 - 4 ? 1.12 : 1);
  }
  if (facing === 'down') {
    for (let y = brimY; y <= brimY + 2; y++)
      for (let x = hx0 - 1; x <= hx1 + 1; x++)
        out[y * FRAME + x] = y === brimY + 2 || x === hx0 - 1 || x === hx1 + 1 ? [70, 22, 20, 255] : shade(0xb63c2e, 1);
  } else if (facing === 'left') {
    for (let y = brimY; y <= brimY + 1; y++)
      for (let x = hx0 - 8; x <= hx0 + 6; x++)
        out[y * FRAME + x] = y === brimY + 1 || x === hx0 - 8 ? [70, 22, 20, 255] : shade(0xb63c2e, 1);
  } else {
    const cx = Math.round((hx0 + hx1) / 2);
    for (let x = cx - 3; x <= cx + 3; x++) out[brimY * FRAME + x] = [70, 22, 20, 255];
  }
  // a small leaf badge (solarpunk touch) on the front
  if (facing === 'down') {
    const cx = Math.round((hx0 + hx1) / 2), cy = brimY - 4;
    for (const [ox, oy, c] of [[0, 0, 0x7bc96f], [1, -1, 0x7bc96f], [-1, 1, 0x4e9a4a], [0, 1, 0x4e9a4a], [1, 0, 0xa8e08f]])
      out[(cy + oy) * FRAME + cx + ox] = shade(c, 1);
  }
  return out;
}

function headband(a) {
  const out = Array(FRAME * FRAME).fill(null);
  const { box, headH } = a;
  const yA = Math.round(box.y0 + headH * 0.24), yB = yA + 3;
  for (const k of a.head) {
    const y = Math.floor(k / FRAME);
    if (y < yA || y > yB) continue;
    out[k] = y === yA || y === yB ? [24, 70, 60, 255] : shade(0x3fb58a, y === yA + 1 ? 1.15 : 0.95);
  }
  // little flower on the side
  if (a.facing !== 'up') {
    const fx = a.facing === 'down' ? a.hx1 - 4 : Math.round((a.hx0 + a.hx1) / 2) + 2;
    const fy = yA + 1;
    for (const [ox, oy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) out[(fy + oy) * FRAME + fx + ox] = shade(0xffb3c7, 1);
    out[fy * FRAME + fx] = shade(0xffd45c, 1);
  }
  return out;
}

// ---------- assembling sheets ----------

const LAYERS = {
  'body.png': bodyLayer,
  'face.png': faceLayer,
  'outfit-0.png': outfitTShirt,
  'outfit-1.png': outfitHoodie,
  'outfit-2.png': outfitOveralls,
  'hair-0.png': (a) => hairLayer(a, 0),
  'hair-1.png': (a) => hairLayer(a, 1),
  'hair-2.png': (a) => hairLayer(a, 2),
  'accessory-1.png': glasses,
  'accessory-2.png': cap,
  'accessory-3.png': headband,
};

function framesFor(dir) {
  const files = [join(SRC, 'rotations', `${dir}.png`)];
  for (let i = 0; i < 4; i++) files.push(join(SRC, 'animations', 'walk4', dir, `frame_00${i}.png`));
  // Same offset for every frame of a direction (keeps the walk bob), from the standing frame
  const b = rawBbox(files[0]);
  const dx = Math.round(FRAME / 2 - (b.x0 + b.x1 + 1) / 2);
  const dy = FEET_Y - b.y1;
  return files.map((f) => loadFrame(f, dx, dy));
}

function blit(sheet, grid, col, row, mirror = false) {
  for (let y = 0; y < FRAME; y++)
    for (let x = 0; x < FRAME; x++) {
      const c = grid[y * FRAME + (mirror ? FRAME - 1 - x : x)];
      if (!c) continue;
      const i = ((row * FRAME + y) * FRAME * COLS + col * FRAME + x) * 4;
      sheet.data.set(c, i);
    }
}

mkdirSync(OUT, { recursive: true });
const sheets = Object.fromEntries(Object.keys(LAYERS).map((f) => [f, newImage(FRAME * COLS, FRAME * ROWS)]));

for (const d of DIRS) {
  framesFor(d.name).forEach((px, col) => {
    const a = analyse(px, d.facing);
    for (const [file, make] of Object.entries(LAYERS)) {
      const grid = make(a);
      blit(sheets[file], grid, col, d.row);
      if (d.facing === 'left') blit(sheets[file], grid, col, 2, true); // right = left mirrored
    }
  });
}

for (const [file, img] of Object.entries(sheets)) writePng(join(OUT, file), img);
console.log(`Wrote ${Object.keys(sheets).length} layer sheets to ${OUT}`);
