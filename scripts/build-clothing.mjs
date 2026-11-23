// Clothing layers: drawn by PixelLab (edit_animation) on a KEY body's own walk frames in pure
// magenta, cut out exactly, turned grey (tintable to any colour) with the shared outline, and
// written as sheets in the body layout.
//
//   node scripts/build-clothing.mjs <item>
//
// Source: scripts/art-src/clothing/<item>/<key-body>/<dir>_<1..4>.png  (dir = south/west/north;
//   1..4 = the key body's sheet columns 1..4, exported exactly as in the body sheet) and
//   scripts/art-src/clothing/<item>/item.json ({ name, slot, tint, fits: { "<body>": "<key-body>" } }).
// Output: client/public/sprites/clothing/<item>/<body>.png for every body listed in "fits".
//   A body that isn't the key body gets the key body's layer moved to follow its own head
//   (centre + top) frame by frame.

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, newImage, writePng } from './png.mjs';
import { OUTLINE_COLOR } from './outline.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BODIES = join(ROOT, 'client', 'public', 'sprites', 'bodies');
const FRAME = 128, COLS = 5;
const DIRS = [['south', 0], ['west', 1], ['north', 3]];

const item = process.argv[2];
if (!item) throw new Error('usage: node scripts/build-clothing.mjs <item>');
const SRC = join(ROOT, 'scripts', 'art-src', 'clothing', item);
const OUT = join(ROOT, 'client', 'public', 'sprites', 'clothing', item);
const cfg = JSON.parse(readFileSync(join(SRC, 'item.json'), 'utf8'));

const lum = (r, g, b) => (r + g + b) / 765;
// magenta key, including its pale pink highlights and pink-red side shading: red and blue both
// above green
const isKey = (r, g, b) => r - g > 25 && b - g > 10 && r + b - 2 * g > 40; // also very dark shadow magenta; skin has blue < green, cream and the outline are neutral

const frameOf = (sheet, row, col) => {
  const f = newImage(FRAME, FRAME);
  for (let y = 0; y < FRAME; y++)
    f.data.set(sheet.data.subarray(((row * FRAME + y) * sheet.width + col * FRAME) * 4, ((row * FRAME + y) * sheet.width + col * FRAME + FRAME) * 4), y * FRAME * 4);
  return f;
};
const same = (a, b) => { for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false; return true; };

function headAnchor(f) {
  let top = -1;
  for (let y = 0; y < FRAME && top < 0; y++) for (let x = 0; x < FRAME; x++) if (f.data[(y * FRAME + x) * 4 + 3]) { top = y; break; }
  let sum = 0, n = 0;
  for (let y = top; y < top + 12; y++) for (let x = 0; x < FRAME; x++) if (f.data[(y * FRAME + x) * 4 + 3]) { sum += x; n++; }
  return { top, cx: sum / n };
}

// Cut the key-coloured garment out of one edited frame; `base` = the same frame without it
function cut(edited, base, mainLum) {
  const out = newImage(FRAME, FRAME);
  const key = new Uint8Array(FRAME * FRAME);
  for (let k = 0; k < FRAME * FRAME; k++) {
    const i = k * 4;
    if (edited.data[i + 3] >= 128 && isKey(edited.data[i], edited.data[i + 1], edited.data[i + 2])) key[k] = 1;
  }
  for (let y = 0; y < FRAME; y++)
    for (let x = 0; x < FRAME; x++) {
      const k = y * FRAME + x, i = k * 4;
      const c = edited.data.subarray(i, i + 4);
      if (key[k]) {
        if (cfg.tint) {
          const f = lum(c[0], c[1], c[2]) / mainLum;
          const g = Math.max(44, Math.min(235, Math.round(((f - 0.35) / 1.3) * 255)));
          out.data.set([g, g, g, 255], i);
        } else out.data.set([c[0], c[1], c[2], 255], i);
        continue;
      }
      // the garment's own dark lines: dark pixels touching it that weren't dark lines on the body
      if (c[3] >= 128 && lum(c[0], c[1], c[2]) < 0.2) {
        let touches = false;
        for (let oy = -1; oy <= 1 && !touches; oy++)
          for (let ox = -1; ox <= 1; ox++) {
            const nx = x + ox, ny = y + oy;
            if (nx >= 0 && ny >= 0 && nx < FRAME && ny < FRAME && key[ny * FRAME + nx]) { touches = true; break; }
          }
        const b = base.data.subarray(i, i + 4);
        const wasLine = b[3] >= 128 && lum(b[0], b[1], b[2]) < 0.2;
        if (touches && !wasLine) out.data.set([...OUTLINE_COLOR, 255], i);
      }
    }
  // fill holes fully enclosed by the garment (pale highlights the key missed, letting the body
  // show through): flood from the frame border over empty pixels; empty pixels not reached are
  // holes. Natural openings (gap between arm and body) connect to the outside and stay open.
  {
    const reached = new Uint8Array(FRAME * FRAME);
    const stack = [];
    for (let i = 0; i < FRAME; i++) stack.push(i, (FRAME - 1) * FRAME + i, i * FRAME, i * FRAME + FRAME - 1);
    while (stack.length) {
      const k = stack.pop();
      if (reached[k] || out.data[k * 4 + 3]) continue;
      reached[k] = 1;
      const x = k % FRAME, y = Math.floor(k / FRAME);
      if (x > 0) stack.push(k - 1);
      if (x < FRAME - 1) stack.push(k + 1);
      if (y > 0) stack.push(k - FRAME);
      if (y < FRAME - 1) stack.push(k + FRAME);
    }
    // also: pixels the AI left transparent inside the figure (real holes in its drawing), found
    // by flooding over the edited frame's transparent pixels only. The flood above can miss them
    // when the garment's edge sits on the body's own outline (dropped from the cut, so it leaks).
    const outside = new Uint8Array(FRAME * FRAME);
    for (let i = 0; i < FRAME; i++) stack.push(i, (FRAME - 1) * FRAME + i, i * FRAME, i * FRAME + FRAME - 1);
    while (stack.length) {
      const k = stack.pop();
      if (outside[k] || edited.data[k * 4 + 3] >= 128) continue;
      outside[k] = 1;
      const x = k % FRAME, y = Math.floor(k / FRAME);
      if (x > 0) stack.push(k - 1);
      if (x < FRAME - 1) stack.push(k + 1);
      if (y > 0) stack.push(k - FRAME);
      if (y < FRAME - 1) stack.push(k + FRAME);
    }
    for (let k = 0; k < FRAME * FRAME; k++) if (!outside[k] && edited.data[k * 4 + 3] < 128) reached[k] = 0;
    for (let pass = 0; pass < 8; pass++) {
      let changed = false;
      for (let k = 0; k < FRAME * FRAME; k++) {
        if (reached[k] || out.data[k * 4 + 3]) continue;
        const x = k % FRAME, y = Math.floor(k / FRAME);
        let n = 0, sum = 0;
        for (const j of [k - 1, k + 1, k - FRAME, k + FRAME]) {
          if (j < 0 || j >= FRAME * FRAME) continue;
          const g = out.data[j * 4];
          if (out.data[j * 4 + 3] && g >= 40 && g === out.data[j * 4 + 1]) { n++; sum += g; }
        }
        if (n) { const g = Math.round(sum / n); out.data.set([g, g, g, 255], k * 4); changed = true; }
      }
      if (!changed) break;
    }
  }
  // tiny specks (<= 6 px of empty, 4-connected) that are mostly ringed by fabric: the key missed
  // a few pixels and the skin shows through as dots. Real openings are bigger than this.
  {
    const seen = new Uint8Array(FRAME * FRAME);
    const isG = (j) => out.data[j * 4 + 3] && out.data[j * 4] >= 40 && out.data[j * 4] === out.data[j * 4 + 1];
    for (let s = 0; s < FRAME * FRAME; s++) {
      if (seen[s] || out.data[s * 4 + 3]) continue;
      const comp = [s];
      seen[s] = 1;
      let big = false;
      for (let q = 0; q < comp.length && !big; q++) {
        const k = comp[q], x = k % FRAME;
        for (const j of [x > 0 ? k - 1 : -1, x < FRAME - 1 ? k + 1 : -1, k - FRAME, k + FRAME]) {
          if (j < 0 || j >= FRAME * FRAME || seen[j] || out.data[j * 4 + 3]) continue;
          seen[j] = 1;
          comp.push(j);
          if (comp.length > 6) { big = true; break; }
        }
      }
      if (big) continue;
      let ring = 0, fab = 0, sum = 0;
      const inComp = new Set(comp);
      for (const k of comp) {
        const x = k % FRAME;
        for (const j of [x > 0 ? k - 1 : -1, x < FRAME - 1 ? k + 1 : -1, k - FRAME, k + FRAME]) {
          if (j < 0 || j >= FRAME * FRAME || inComp.has(j)) continue;
          ring++;
          if (isG(j)) { fab++; sum += out.data[j * 4]; }
        }
      }
      if (ring && fab / ring >= 0.75) {
        const g = Math.round(sum / fab);
        for (const k of comp) out.data.set([g, g, g, 255], k * 4);
      }
    }
  }
  // items that are solid fabric across every row (a skirt): fill each row edge to edge, so a
  // leg the AI drew over the fabric doesn't show through ("solidRows": true in item.json)
  if (cfg.solidRows)
    for (let y = 0; y < FRAME; y++) {
      let x0 = -1, x1 = -1;
      for (let x = 0; x < FRAME; x++) if (out.data[(y * FRAME + x) * 4 + 3]) { if (x0 < 0) x0 = x; x1 = x; }
      if (x0 < 0) continue;
      let last = null;
      for (let x = x0; x <= x1; x++) {
        const i = (y * FRAME + x) * 4;
        if (out.data[i + 3]) { if (out.data[i] >= 40 && out.data[i] === out.data[i + 1]) last = out.data[i]; continue; }
        if (last !== null) out.data.set([last, last, last, 255], i);
      }
    }
  // outline where the garment meets transparency (its silhouette)
  const src = new Uint8Array(out.data);
  for (let y = 0; y < FRAME; y++)
    for (let x = 0; x < FRAME; x++) {
      const i = (y * FRAME + x) * 4;
      if (!src[i + 3]) continue;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= FRAME || ny >= FRAME) { out.data.set([...OUTLINE_COLOR, 255], i); break; }
        const j = (ny * FRAME + nx) * 4;
        if (!src[j + 3] && !base.data[j + 3]) { out.data.set([...OUTLINE_COLOR, 255], i); break; }
      }
    }
  return out;
}

function shift(layer, dx, dy) {
  if (!dx && !dy) return layer;
  const out = newImage(FRAME, FRAME);
  for (let y = 0; y < FRAME; y++)
    for (let x = 0; x < FRAME; x++) {
      const i = (y * FRAME + x) * 4;
      if (!layer.data[i + 3]) continue;
      const tx = x + dx, ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= FRAME || ty >= FRAME) continue;
      out.data.set(layer.data.subarray(i, i + 4), (ty * FRAME + tx) * 4);
    }
  return out;
}
function mirrorFrame(f) {
  const out = newImage(FRAME, FRAME);
  for (let y = 0; y < FRAME; y++)
    for (let x = 0; x < FRAME; x++) out.data.set(f.data.subarray((y * FRAME + x) * 4, (y * FRAME + x) * 4 + 4), (y * FRAME + FRAME - 1 - x) * 4);
  return out;
}

// Fit a borrowed garment to another body: row by row, where the body's skin pokes out past the
// garment's left or right edge by up to MAX_GAP pixels, extend the garment over it (copying the
// garment's edge colour inwards and keeping the outline on the new edge).
const MAX_GAP = 4;
function conform(layer, body) {
  const out = { width: FRAME, height: FRAME, data: new Uint8Array(layer.data) };
  const L = (x, y) => layer.data[(y * FRAME + x) * 4 + 3];
  const B = (x, y) => x >= 0 && x < FRAME && body.data[(y * FRAME + x) * 4 + 3];
  for (let y = 0; y < FRAME; y++) {
    let x0 = -1, x1 = -1;
    for (let x = 0; x < FRAME; x++) if (L(x, y)) { if (x0 < 0) x0 = x; x1 = x; }
    if (x0 < 0) continue;
    for (const [edge, step] of [[x0, -1], [x1, 1]]) {
      let n = 0;
      while (n <= MAX_GAP && B(edge + step * (n + 1), y)) n++;
      if (n === 0 || n > MAX_GAP) continue;
      // fill colour: the garment's first non-outline pixel inside the edge
      let fill = null;
      for (let k = 1; k < 4 && !fill; k++) {
        const j = (y * FRAME + edge - step * k) * 4;
        const g = layer.data[j];
        if (layer.data[j + 3] && g >= 40) fill = [g, g, g, 255];
      }
      if (!fill) continue;
      out.data.set(fill, (y * FRAME + edge) * 4);
      for (let k = 1; k <= n; k++) out.data.set(k === n ? [...OUTLINE_COLOR, 255] : fill, (y * FRAME + edge + step * k) * 4);
    }
    // small holes inside the garment (e.g. the gap between arm and body on the key body) where
    // this body has skin: fill with the fabric next to the hole
    for (let x = x0 + 1; x < x1; x++) {
      if (out.data[(y * FRAME + x) * 4 + 3] || !B(x, y)) continue;
      let gapEnd = x;
      while (gapEnd < x1 && !out.data[(y * FRAME + gapEnd) * 4 + 3]) gapEnd++;
      if (gapEnd - x > 3) { x = gapEnd; continue; }
      let fill = null;
      for (const xx of [x - 2, x - 1, gapEnd, gapEnd + 1]) {
        const j = (y * FRAME + xx) * 4;
        if (out.data[j + 3] && out.data[j] >= 40 && out.data[j] === out.data[j + 1]) { fill = [out.data[j], out.data[j], out.data[j], 255]; break; }
      }
      if (fill) for (let k = x; k < gapEnd; k++) if (B(k, y)) out.data.set(fill, (y * FRAME + k) * 4);
      x = gapEnd;
    }
  }
  return out;
}

function blit(sheet, layer, col, row, dx, dy, mirror) {
  for (let y = 0; y < FRAME; y++)
    for (let x = 0; x < FRAME; x++) {
      const i = (y * FRAME + x) * 4;
      if (!layer.data[i + 3]) continue;
      let tx = x + dx;
      const ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= FRAME || ty >= FRAME) continue;
      if (mirror) tx = FRAME - 1 - tx;
      sheet.data.set(layer.data.subarray(i, i + 4), ((row * FRAME + ty) * FRAME * COLS + col * FRAME + tx) * 4);
    }
}

mkdirSync(OUT, { recursive: true });
// only key bodies whose art exists (an item can be built before every key body is drawn)
const keyBodies = [...new Set(Object.values(cfg.fits))].filter((kb) => existsSync(join(SRC, kb, 'north_4.png')));
const fits = Object.fromEntries(Object.entries(cfg.fits).filter(([, kb]) => keyBodies.includes(kb)));
const layers = {}; // keyBody -> dir -> [col0..col4] layers + anchors
for (const kb of keyBodies) {
  const sheet = readPng(join(BODIES, `${kb}.png`));
  layers[kb] = {};
  // one tint reference for the whole item on this body: median key brightness over all frames
  const lums = [];
  const edits = {};
  for (const [d] of DIRS)
    for (let c = 1; c <= 4; c++) {
      const f = join(SRC, kb, `${d}_${c}.png`);
      if (!existsSync(f)) throw new Error(`missing ${f}`);
      const e = readPng(f);
      edits[`${d}_${c}`] = e;
      for (let i = 0; i < e.data.length; i += 4) if (e.data[i + 3] >= 128 && isKey(e.data[i], e.data[i + 1], e.data[i + 2])) lums.push(lum(e.data[i], e.data[i + 1], e.data[i + 2]));
    }
  lums.sort((a, b) => a - b);
  const mainLum = lums[Math.floor(lums.length / 2)];
  for (const [d, row] of DIRS) {
    const cols = [];
    for (let c = 1; c <= 4; c++) cols[c] = { layer: cut(edits[`${d}_${c}`], frameOf(sheet, row, c), mainLum), anchor: headAnchor(frameOf(sheet, row, c)) };
    // col 0 (standing) is a copy of one walk column: use that column's layer
    const stand = frameOf(sheet, row, 0);
    let match = 1;
    for (let c = 1; c <= 4; c++) if (same(stand, frameOf(sheet, row, c))) { match = c; break; }
    cols[0] = cols[match];
    layers[kb][d] = cols;
  }
}

for (const [body, kb] of Object.entries(fits)) {
  const target = readPng(join(BODIES, `${body}.png`));
  const sheet = newImage(FRAME * COLS, FRAME * 4);
  for (const [d, row] of DIRS)
    for (let col = 0; col < COLS; col++) {
      const { layer, anchor } = layers[kb][d][col];
      const a = headAnchor(frameOf(target, row, col));
      const dx = body === kb ? 0 : Math.round(a.cx - anchor.cx), dy = body === kb ? 0 : a.top - anchor.top;
      const fitted = body === kb ? layer : conform(shift(layer, dx, dy), frameOf(target, row, col));
      blit(sheet, fitted, col, row, 0, 0, false);
      if (d === 'west') {
        const m = headAnchor(frameOf(target, 2, col));
        const mdx = body === kb ? 0 : -Math.round((FRAME - 1 - m.cx) - anchor.cx), mdy = body === kb ? 0 : m.top - anchor.top;
        // right row: fit on the mirrored body frame, then mirror back
        const mirroredBody = mirrorFrame(frameOf(target, 2, col));
        const fittedR = body === kb ? layer : conform(shift(layer, -mdx + 0, mdy), mirroredBody);
        blit(sheet, fittedR, col, 2, 0, 0, true);
      }
    }
  writePng(join(OUT, `${body}.png`), sheet);
}
console.log(`clothing/${item}: ${Object.keys(fits).length} sheets (key bodies: ${keyBodies.join(', ')})`);
