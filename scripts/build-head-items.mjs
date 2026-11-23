// Head items (hair, hats, glasses, bandanas, piercings...): drawn ONCE per gender by PixelLab and
// placed on every body and every walk frame by following the head. Free after the one drawing.
//
//   node scripts/build-head-items.mjs <item> [--preview out.png]
//
// Source art: scripts/art-src/head/<item>/<gender>.png, a 192 x 128 image with three 64 px wide
// panels: front, side (facing left), back. It is a PixelLab edit of the reference body's
// standing frames (see REF below), with the item drawn in one pure KEY colour so it can be cut
// out exactly: tintable items (hair) in bright blue, see KEY in scripts/art-src/head/<item>/item.json.
//
// Output: client/public/sprites/head/<item>/<body>.png for every body of that gender, each a
// 640 x 512 sheet in the body layout, to stack right above the body sheet (before the height
// stretch, like every layer).
//   - tintable items come out grey (mid grey = the chosen colour, see client/src/avatar/sprites.ts)
//   - every item gets the shared outline (scripts/outline.mjs)

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, newImage, writePng } from './png.mjs';
import { OUTLINE_COLOR } from './outline.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BODIES = join(ROOT, 'client', 'public', 'sprites', 'bodies');
const FRAME = 128, COLS = 5;
// Reference body whose standing frames the art was drawn on, and where the panels came from
const REF = { male: 'male-average', female: 'female-average' };
const PANEL_W = 64, PANEL_X = 32; // each panel = frame columns 32..95
const PANELS = [['south', 0], ['west', 1], ['north', 3]]; // panel index -> sheet row

const item = process.argv[2];
if (!item) throw new Error('usage: node scripts/build-head-items.mjs <item> [--preview out.png]');
const SRC = join(ROOT, 'scripts', 'art-src', 'head', item);
const OUT = join(ROOT, 'client', 'public', 'sprites', 'head', item);
const cfg = JSON.parse(readFileSync(join(SRC, 'item.json'), 'utf8'));
const previewAt = process.argv.indexOf('--preview');

const lum = (r, g, b) => (r + g + b) / 765;
const isKey = (r, g, b) => (cfg.key === 'blue' ? b > r + 40 && b > g + 20 : false);

// ---- head anchor of a frame: top of the head and its centre column ----
function headAnchor(sheet, row, col) {
  const x0 = col * FRAME, y0 = row * FRAME;
  let top = -1;
  for (let y = 0; y < FRAME && top < 0; y++)
    for (let x = 0; x < FRAME; x++)
      if (sheet.data[((y0 + y) * sheet.width + x0 + x) * 4 + 3]) { top = y; break; }
  let sum = 0, n = 0;
  for (let y = top; y < top + 12; y++)
    for (let x = 0; x < FRAME; x++)
      if (sheet.data[((y0 + y) * sheet.width + x0 + x) * 4 + 3]) { sum += x; n++; }
  return { top, cx: sum / n };
}

// ---- cut the item out of one panel -> 128x128 layer at the reference frame's coordinates ----
function cutPanel(art, ref, p, mainLum) {
  const out = newImage(FRAME, FRAME);
  const ax = p * PANEL_W;
  const A = (x, y) => (x < 0 || y < 0 || x >= PANEL_W || y >= FRAME ? null : art.data.subarray(((y * art.width) + ax + x) * 4, ((y * art.width) + ax + x) * 4 + 4));
  const R = (x, y) => (x < 0 || y < 0 || x >= PANEL_W || y >= FRAME ? null : ref.data.subarray(((y * ref.width) + ax + x) * 4, ((y * ref.width) + ax + x) * 4 + 4));
  const key = new Uint8Array(PANEL_W * FRAME);
  for (let y = 0; y < FRAME; y++)
    for (let x = 0; x < PANEL_W; x++) {
      const c = A(x, y);
      if (c[3] >= 128 && isKey(c[0], c[1], c[2])) key[y * PANEL_W + x] = 1;
    }
  for (let y = 0; y < FRAME; y++)
    for (let x = 0; x < PANEL_W; x++) {
      const o = (y * FRAME + x + PANEL_X) * 4;
      const c = A(x, y);
      if (key[y * PANEL_W + x]) {
        const exact = cfg.shades && cfg.shades[`${c[0]},${c[1]},${c[2]}`];
        if (exact) {
          // hand-placed items: exact greys per shade
          out.data.set([exact, exact, exact, 255], o);
        } else if (cfg.tint) {
          // grey that the game's tint turns into this brightness of the chosen colour
          const f = lum(c[0], c[1], c[2]) / mainLum;
          const g = Math.max(44, Math.min(235, Math.round(((f - 0.35) / 1.3) * 255)));
          out.data.set([g, g, g, 255], o);
        } else out.data.set([c[0], c[1], c[2], 255], o);
        continue;
      }
      // the item's own outline: dark pixels touching the item that weren't dark lines on the body
      if (c[3] >= 128 && lum(c[0], c[1], c[2]) < 0.2) {
        let touches = false;
        for (let oy = -1; oy <= 1 && !touches; oy++)
          for (let ox = -1; ox <= 1; ox++) {
            const nx = x + ox, ny = y + oy;
            if (nx >= 0 && ny >= 0 && nx < PANEL_W && ny < FRAME && key[ny * PANEL_W + nx]) { touches = true; break; }
          }
        const r = R(x, y);
        const wasLine = r && r[3] >= 128 && lum(r[0], r[1], r[2]) < 0.2;
        if (touches && !wasLine) out.data.set([...OUTLINE_COLOR, 255], o);
      }
    }
  // close the outline: item pixels on the item's outside edge that touch transparency or skin
  // (not for tiny hand-placed items, "outline": false, where it would swallow the item)
  if (cfg.outline === false) return out;
  const src = new Uint8Array(out.data);
  for (let y = 0; y < FRAME; y++)
    for (let x = 0; x < FRAME; x++) {
      const o = (y * FRAME + x) * 4;
      if (!src[o + 3]) continue;
      const rx = x - PANEL_X;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= FRAME || ny >= FRAME) continue;
        const inItem = src[(ny * FRAME + nx) * 4 + 3];
        const r = R(rx + ox, ny);
        const onBody = r && r[3] >= 128;
        if (!inItem && !onBody) { out.data.set([...OUTLINE_COLOR, 255], o); break; }
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

// Hats: hair would poke out through the hat, so every hat also gets a MASK sheet
// (head/<hat>/mask/<body>.png): in each frame, every pixel above the hat's brim (the hat's lowest
// pixel in that column; beside the hat, the brim at the hat's nearest edge) is opaque. The game
// erases hair pixels under the mask before drawing the hat. Hair with "underHat": "tuck" in
// head/items.json is hidden completely under any hat.
function hatMask(hat) {
  const m = newImage(hat.width, hat.height);
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < COLS; col++) {
      const brim = new Int32Array(FRAME).fill(-1);
      for (let x = 0; x < FRAME; x++)
        for (let y = 0; y < FRAME; y++) if (hat.data[((row * FRAME + y) * hat.width + col * FRAME + x) * 4 + 3]) brim[x] = y;
      const cols = [...brim.keys()].filter((x) => brim[x] >= 0);
      if (!cols.length) continue;
      const x0 = cols[0], x1 = cols[cols.length - 1];
      for (let x = 0; x < FRAME; x++) {
        const b = x < x0 ? brim[x0] : x > x1 ? brim[x1] : brim[x] >= 0 ? brim[x] : Math.max(brim[x0], brim[x1]);
        for (let y = 0; y <= b; y++) m.data.set([255, 0, 255, 255], ((row * FRAME + y) * hat.width + col * FRAME + x) * 4);
      }
    }
  return m;
}

mkdirSync(OUT, { recursive: true });
const written = [];
for (const gender of ['male', 'female']) {
  const artFile = join(SRC, `${gender}.png`);
  if (!existsSync(artFile)) continue;
  const art = readPng(artFile);
  const refSheet = readPng(join(BODIES, `${REF[gender]}.png`));
  // the reference panels, rebuilt from the reference body's standing frames
  const ref = newImage(PANEL_W * 3, FRAME);
  PANELS.forEach(([, row], p) => {
    for (let y = 0; y < FRAME; y++)
      for (let x = 0; x < PANEL_W; x++) {
        const i = ((row * FRAME + y) * refSheet.width + PANEL_X + x) * 4;
        ref.data.set(refSheet.data.subarray(i, i + 4), (y * ref.width + p * PANEL_W + x) * 4);
      }
  });
  // mid grey = the MEDIAN brightness of all key pixels in all three views, so every view
  // (and every frame) tints to the same colour
  const keyLums = [];
  for (let i = 0; i < art.data.length; i += 4)
    if (art.data[i + 3] >= 128 && isKey(art.data[i], art.data[i + 1], art.data[i + 2])) keyLums.push(lum(art.data[i], art.data[i + 1], art.data[i + 2]));
  keyLums.sort((a, b) => a - b);
  const mainLum = keyLums[Math.floor(keyLums.length / 2)] || 0.5;
  const layers = PANELS.map(([, row], p) => ({ row, layer: cutPanel(art, ref, p, mainLum), anchor: headAnchor(refSheet, row, 0) }));
  for (const f of readdirSync(BODIES).filter((n) => n.startsWith(gender + '-'))) {
    const body = readPng(join(BODIES, f));
    const sheet = newImage(FRAME * COLS, FRAME * 4);
    for (const { row, layer, anchor } of layers)
      for (let col = 0; col < COLS; col++) {
        const a = headAnchor(body, row, col);
        const dx = Math.round(a.cx - anchor.cx), dy = a.top - anchor.top;
        blit(sheet, layer, col, row, dx, dy, false);
        if (row === 1) {
          // right row = left row mirrored, so follow the mirrored body's head
          const m = headAnchor(body, 2, col);
          blit(sheet, layer, col, 2, Math.round((FRAME - 1 - m.cx) - anchor.cx), m.top - anchor.top, true);
        }
      }
    writePng(join(OUT, f), sheet);
    if (cfg.kind === 'hat') {
      mkdirSync(join(OUT, 'mask'), { recursive: true });
      writePng(join(OUT, 'mask', f), hatMask(sheet));
    }
    written.push(f);
  }
}
console.log(`head/${item}: ${written.length} sheets${cfg.kind === 'hat' ? ' + masks' : ''}`);

// head/items.json: every built head item, for the game's wardrobe
{
  const HEAD = join(ROOT, 'client', 'public', 'sprites', 'head');
  const SRC_ALL = join(ROOT, 'scripts', 'art-src', 'head');
  const items = readdirSync(SRC_ALL)
    .filter((id) => existsSync(join(SRC_ALL, id, 'item.json')) && existsSync(join(HEAD, id)))
    .map((id) => {
      const c = JSON.parse(readFileSync(join(SRC_ALL, id, 'item.json'), 'utf8'));
      const e = { id, name: c.name, kind: c.kind, tint: !!c.tint };
      if (c.underHat) e.underHat = c.underHat;
      if (c.kind === 'hat') e.mask = `${id}/mask/`;
      return e;
    });
  writeFileSync(
    join(HEAD, 'items.json'),
    JSON.stringify({ _about: 'Head items: sheets at sprites/head/<id>/<body>.png, grey pixels tint to the chosen colour. Stack after clothing, before the height stretch, by kind: neck (bandana), face (piercings, face tattoos), hair, band (headband), hat, glasses. Hats: erase hair pixels where sprites/head/<mask><body>.png is opaque, then draw the hat; hair with underHat "tuck" is not drawn at all under a hat. One hat, one glasses, one band, one neck; face items stack.', items }, null, 2),
  );
}

// Optional preview: every body with the item, front/side/back standing + one walk frame,
// tinted with a few hair colours
if (previewAt > 0) {
  const out = process.argv[previewAt + 1];
  const colors = [0x3b2416, 0xc0392b, 0xe6c35c, 0x7d3c98, 0x2e86c1];
  const cells = [[0, 0], [0, 2], [1, 2], [3, 0]];
  const cw = 60, ch = 110;
  const img = newImage(cw * cells.length * 5 + 48, ch * Math.ceil(written.length / 5));
  written.forEach((f, n) => {
    const body = readPng(join(BODIES, f));
    const layer = readPng(join(OUT, f));
    const tint = colors[n % colors.length];
    const tr = (tint >> 16) & 255, tg = (tint >> 8) & 255, tb = tint & 255;
    cells.forEach(([row, col], k) => {
      for (let y = 0; y < ch; y++)
        for (let x = 0; x < cw; x++) {
          const sx = col * FRAME + 34 + x, sy = row * FRAME + 10 + y;
          const i = (sy * 640 + sx) * 4;
          const ox = (n % 5) * (cw * 4 + 12) + k * cw + x, oy = Math.floor(n / 5) * ch + y;
          const o = (oy * img.width + ox) * 4;
          if (body.data[i + 3]) img.data.set(body.data.subarray(i, i + 4), o);
          if (layer.data[i + 3]) {
            let [r, g, b] = layer.data.subarray(i, i + 3);
            if (r === g && g === b && r >= 40 && cfg.tint) {
              const fct = 0.35 + (r / 255) * 1.3;
              if (fct <= 1) { r = tr * fct; g = tg * fct; b = tb * fct; }
              else { const t = Math.min(1, fct - 1); r = tr + (255 - tr) * t; g = tg + (255 - tg) * t; b = tb + (255 - tb) * t; }
            }
            img.data.set([r, g, b, 255], o);
          }
        }
    });
  });
  writePng(out, img);
  console.log('preview:', out);
}
