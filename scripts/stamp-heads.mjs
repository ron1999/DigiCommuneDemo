// One clean, consistent head per gender, stamped onto every body frame (owner: every sprite must
// have consistent eyes and faces). The walk animations redraw faces a little differently in every
// frame; stamping the same head everywhere makes eyes, brows, mouth and head shape identical.
//
// Source: scripts/art-src/heads/<gender>.png, a PixelLab edit (edit_image_pro_flash) of the
// reference body's three standing views (front, side facing left, back; 64 px panels, frame
// columns 32-95), with a clean bald head and one pure green iris pixel per eye (eye colour key).
//
// stampHead(frame, gender, dir) works on one placed 128x128 frame (feet on y=116):
//   1. finds the frame's head (top row + centre column)
//   2. erases the frame's head rows down to the chin and pastes the reference head there
//   3. trims stray bits right under the chin that stick out past the neck (hair stubs)

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, newImage } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FRAME = 128, PANEL_W = 64, PANEL_X = 32;
const PANEL = { south: 0, west: 1, north: 2 };

const cache = new Map();

const sat = (r, g, b) => (Math.max(r, g, b) - Math.min(r, g, b)) / (Math.max(r, g, b) || 1);
const lum = (r, g, b) => (r + g + b) / 765;

function anchorOf(img, x0, w) {
  let top = -1;
  for (let y = 0; y < img.height && top < 0; y++)
    for (let x = x0; x < x0 + w; x++) if (img.data[(y * img.width + x) * 4 + 3]) { top = y; break; }
  let sum = 0, n = 0;
  for (let y = top; y < top + 12; y++)
    for (let x = x0; x < x0 + w; x++) if (img.data[(y * img.width + x) * 4 + 3]) { sum += x - x0; n++; }
  return { top, cx: sum / n };
}

function rowSpan(img, x0, w, y) {
  let a = -1, b = -1;
  for (let x = x0; x < x0 + w; x++)
    if (img.data[(y * img.width + x) * 4 + 3]) { if (a < 0) a = x - x0; b = x - x0; }
  return a < 0 ? null : [a, b];
}

// Clean dull grey smudges (leftover hair) on the reference head: grey-ish mid-tone pixels
// surrounded by skin become the average of the skin around them.
function cleanSmudges(img) {
  const { width: W, height: H, data } = img;
  for (let pass = 0; pass < 3; pass++) {
    const src = new Uint8Array(data);
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = (y * W + x) * 4;
        if (src[i + 3] < 128) continue;
        const r = src[i], g = src[i + 1], b = src[i + 2];
        const l = lum(r, g, b);
        if (!(sat(r, g, b) < 0.3 && l > 0.25 && l < 0.62)) continue;
        let n = 0, sr = 0, sg = 0, sb = 0;
        for (let oy = -1; oy <= 1; oy++)
          for (let ox = -1; ox <= 1; ox++) {
            const j = ((y + oy) * W + x + ox) * 4;
            if (src[j + 3] < 128) continue;
            const R = src[j], G = src[j + 1], B = src[j + 2];
            if (R - B > 40 && R >= G && sat(R, G, B) > 0.38) { n++; sr += R; sg += G; sb += B; }
          }
        if (n >= 2) data.set([Math.round(sr / n), Math.round(sg / n), Math.round(sb / n), 255], i);
      }
  }
}

// The back of the head has no features at all: any dull, non-skin, non-outline pixel on the
// scalp is leftover hair and becomes skin (bright highlights are kept).
function cleanBackOfHead(img, x0) {
  const { width: W, data } = img;
  for (let pass = 0; pass < 6; pass++) {
    const src = new Uint8Array(data);
    for (let y = 1; y < 40; y++)
      for (let x = x0 + 1; x < x0 + PANEL_W - 1; x++) {
        const i = (y * W + x) * 4;
        if (src[i + 3] < 128) continue;
        const r = src[i], g = src[i + 1], b = src[i + 2], l = lum(r, g, b);
        if ((r - b > 40 && r >= g && sat(r, g, b) > 0.38) || l < 0.16 || l > 0.7) continue;
        let n = 0, sr = 0, sg = 0, sb = 0;
        for (let oy = -1; oy <= 1; oy++)
          for (let ox = -1; ox <= 1; ox++) {
            const j = ((y + oy) * W + x + ox) * 4;
            if (src[j + 3] < 128) continue;
            const R = src[j], G = src[j + 1], B = src[j + 2];
            if (R - B > 40 && R >= G && sat(R, G, B) > 0.38) { n++; sr += R; sg += G; sb += B; }
          }
        if (n >= 2) data.set([Math.round(sr / n), Math.round(sg / n), Math.round(sb / n), 255], i);
      }
  }
}

function headsFor(gender) {
  if (cache.has(gender)) return cache.get(gender);
  const art = readPng(join(ROOT, 'scripts', 'art-src', 'heads', `${gender}.png`));
  cleanSmudges(art);
  cleanBackOfHead(art, PANEL.north * PANEL_W);
  const panels = {};
  for (const [dir, p] of Object.entries(PANEL)) {
    const x0 = p * PANEL_W;
    const a = anchorOf(art, x0, PANEL_W);
    // chin: first row below the widest head row where the width drops under 72% of it
    let maxW = 0, maxRow = a.top;
    for (let y = a.top; y < a.top + 20; y++) {
      const s = rowSpan(art, x0, PANEL_W, y);
      if (s && s[1] - s[0] + 1 > maxW) { maxW = s[1] - s[0] + 1; maxRow = y; }
    }
    let chin = maxRow + 1;
    while (chin < a.top + 26) {
      const s = rowSpan(art, x0, PANEL_W, chin);
      if (!s || s[1] - s[0] + 1 <= maxW * 0.72) break;
      chin++;
    }
    const head = newImage(PANEL_W, chin - a.top);
    for (let y = a.top; y < chin; y++)
      for (let x = 0; x < PANEL_W; x++) {
        const i = (y * art.width + x0 + x) * 4;
        head.data.set(art.data.subarray(i, i + 4), ((y - a.top) * PANEL_W + x) * 4);
      }
    // neck span just under the chin, to trim stubs that stick out past it
    const neck = [];
    for (let y = chin; y < chin + 8; y++) neck.push(rowSpan(art, x0, PANEL_W, y));
    panels[dir] = { head, cx: a.cx, neck };
  }
  cache.set(gender, panels);
  return panels;
}

export function stampHead(frame, gender, dir) {
  const ref = headsFor(gender)[dir];
  const a = anchorOf(frame, 0, FRAME);
  const dx = Math.round(a.cx - ref.cx) + 0; // frame x = panel x + dx
  const H = ref.head.height;
  // 1-2. replace the head rows
  for (let y = 0; y < H; y++) {
    const fy = a.top + y;
    if (fy < 0 || fy >= FRAME) continue;
    for (let x = 0; x < FRAME; x++) frame.data[(fy * FRAME + x) * 4 + 3] = 0;
    for (let x = 0; x < PANEL_W; x++) {
      const i = (y * PANEL_W + x) * 4;
      if (ref.head.data[i + 3] < 128) continue;
      const fx = x + dx;
      if (fx < 0 || fx >= FRAME) continue;
      frame.data.set(ref.head.data.subarray(i, i + 4), (fy * FRAME + fx) * 4);
    }
  }
  // 3a. dark stubs inside the neck just under the head (hair tails on the nape): side and back
  // (front view: only the first rows under the chin, where an old mouth/chin can peek out)
  {
    const rowsUnder = dir === 'south' ? 4 : 10;
    for (let k = 0; k < rowsUnder; k++) {
      const fy = a.top + H + k;
      if (fy >= FRAME) break;
      for (let x = 1; x < FRAME - 1; x++) {
        const i = (fy * FRAME + x) * 4;
        // darker than the skin's normal shadow (hair stub, tie, smudge); only in the neck rows
        if (!frame.data[i + 3]) continue;
        const r0 = frame.data[i], g0 = frame.data[i + 1], b0 = frame.data[i + 2], l0 = lum(r0, g0, b0);
        const tooDark = l0 < 0.42;
        const dull = dir !== 'south' && sat(r0, g0, b0) < 0.38 && l0 > 0.3 && l0 < 0.62; // grey hair leftovers
        if (!tooDark && !dull) continue;
        // interior = opaque on both sides and above (not the body's own outline)
        const L = frame.data[i - 4 + 3], R = frame.data[i + 4 + 3], U = frame.data[i - FRAME * 4 + 3];
        if (!(L && R && U)) continue;
        // fill from the nearest warm (skin) pixel on this row
        for (let r = 1; r < 6; r++) {
          let done = false;
          for (const xx of [x - r, x + r]) {
            const j = (fy * FRAME + xx) * 4;
            if (xx < 0 || xx >= FRAME || !frame.data[j + 3]) continue;
            const R2 = frame.data[j], G2 = frame.data[j + 1], B2 = frame.data[j + 2];
            if (R2 - B2 > 40 && R2 >= G2 && sat(R2, G2, B2) > 0.38 && lum(R2, G2, B2) >= 0.45) { frame.data.set([R2, G2, B2, 255], i); done = true; break; }
          }
          if (done) break;
        }
      }
    }
  }
  // 3c. back view: a narrow band of shadow tone running down the middle of the nape (a hair
  //     tail drawn in skin shadow) becomes the row's normal skin; dark marks surrounded by the
  //     tank top's cream (a hair tie) become cream.
  if (dir === 'north') {
    const px = (x, y) => frame.data.subarray((y * FRAME + x) * 4, (y * FRAME + x) * 4 + 4);
    for (let k = 0; k < 16; k++) {
      const fy = a.top + H + k;
      if (fy >= FRAME) break;
      // the row's most common light skin tone
      const counts = new Map();
      for (let x = 0; x < FRAME; x++) {
        const c = px(x, fy);
        if (c[3] && c[0] - c[2] > 40 && c[0] >= c[1] && lum(c[0], c[1], c[2]) >= 0.5) {
          const key = (c[0] << 16) | (c[1] << 8) | c[2];
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
      let main = null, best = 0;
      for (const [key, n] of counts) if (n > best) { best = n; main = [(key >> 16) & 255, (key >> 8) & 255, key & 255]; }
      for (let x = 4; x < FRAME - 4; x++) {
        const c = px(x, fy);
        if (!c[3]) continue;
        const l = lum(c[0], c[1], c[2]);
        const near = (d) => { const n = px(x + d, fy); return n[3] ? lum(n[0], n[1], n[2]) : -1; };
        const centre = Math.abs(x - Math.round(a.cx)) <= 3;
        if (centre && k < 10 && main && c[0] - c[2] > 40 && l < 0.47 && near(-4) >= 0.5 && near(4) >= 0.5) frame.data.set([...main, 255], (fy * FRAME + x) * 4);
        else if (centre && l < 0.4 && (near(-2) > 0.8 || near(-3) > 0.8) && (near(2) > 0.8 || near(3) > 0.8)) {
          const n = px(x - 3, fy);
          frame.data.set([n[0], n[1], n[2], 255], (fy * FRAME + x) * 4);
        }
      }
    }
  }
  // 3b. trim stubs under the chin (only on the side view, where hair stubs hang off the nape)
  if (dir === 'west')
    ref.neck.forEach((span, k) => {
      if (!span) return; // (neck rows below the chin, see headsFor)
      const fy = a.top + H + k;
      if (fy >= FRAME) return;
      for (let x = 0; x < FRAME; x++) {
        const px = x - dx;
        if (px > span[1] + 3) frame.data[(fy * FRAME + x) * 4 + 3] = 0; // behind the neck
      }
    });
  return frame;
}

// Pixels in the head area that don't belong to a bald body (grey smudges, blue-ish, hair):
// used to spot broken walk frames.
export function foreignHeadPixels(frame) {
  const a = anchorOf(frame, 0, FRAME);
  let n = 0;
  for (let y = a.top; y < a.top + 22 && y < FRAME; y++)
    for (let x = 0; x < FRAME; x++) {
      const i = (y * FRAME + x) * 4;
      if (!frame.data[i + 3]) continue;
      const r = frame.data[i], g = frame.data[i + 1], b = frame.data[i + 2];
      const s = Math.max(r, g, b) - Math.min(r, g, b), l = lum(r, g, b);
      if ((s < 25 && l > 0.2 && l < 0.55) || b > r) n++;
    }
  return n;
}
