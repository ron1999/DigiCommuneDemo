// Shared helpers for the body system (build x height). See docs/ART_SPEC.md, "Body types".
//
// Builds are real PixelLab art; HEIGHT is made here by adding or removing pixel rows in the
// legs and torso. Because every layer of a frame (body, clothing, hair...) is stretched with
// the same rows, layers stay lined up at every height.

import { newImage } from './png.mjs';

export const BUILDS = ['slim', 'lean', 'average', 'stocky', 'heavyset'];
export const MUSCLE = ['soft', 'muscular']; // a second art set of the same 5 builds
export const HEIGHTS = [-12, -6, 0, 6, 12]; // pixels added to an average-height body
export const BASE_HEIGHT = 97; // average body height in pixels, feet to top of hair

// Which rows to repeat (d > 0) or drop (d < 0) for a figure of height H whose top is at y0.
// 60% of the change goes in the legs (thigh to shin), 40% in the torso.
export function stretchRows(y0, H, d) {
  const legs = Math.round(d * 0.6), torso = d - legs;
  const pick = (from, to, n) => {
    const k = Math.abs(n), out = [];
    for (let i = 0; i < k; i++) out.push(Math.round(y0 + from * H + ((to - from) * H * (i + 0.5)) / k));
    return out;
  };
  const counts = new Map();
  for (const r of [...pick(0.72, 0.88, legs), ...pick(0.38, 0.52, torso)]) counts.set(r, (counts.get(r) || 0) + 1);
  return counts;
}

// Stretch an image (any size) keeping its bottom edge (the feet) in place.
// rowCounts comes from stretchRows(), measured on the standing frame.
export function stretchImage(img, rowCounts, d) {
  const rows = [];
  for (let y = 0; y < img.height; y++) {
    const n = rowCounts.get(y) || 0;
    if (d < 0 && n) continue;
    rows.push(y);
    if (d > 0) for (let i = 0; i < n; i++) rows.push(y);
  }
  // keep the same canvas size, aligned to the bottom
  const out = newImage(img.width, img.height);
  const shift = img.height - rows.length;
  rows.forEach((sy, i) => {
    const y = i + shift;
    if (y < 0 || y >= img.height) return;
    out.data.set(img.data.subarray(sy * img.width * 4, (sy + 1) * img.width * 4), y * img.width * 4);
  });
  return out;
}

// Splits a lineup image into `count` figures. Figures are separated by empty columns; where
// figures touch (arm to arm), the widest piece is cut at its emptiest column until there are
// `count` pieces.
export function splitFigures(img, count = 0) {
  const segs = emptyColumnSplit(img);
  const colCount = (x) => {
    let n = 0;
    for (let y = 0; y < img.height; y++) if (img.data[(y * img.width + x) * 4 + 3] > 0) n++;
    return n;
  };
  while (count && segs.length < count) {
    let wi = 0;
    segs.forEach((sg, i) => { if (sg[1] - sg[0] > segs[wi][1] - segs[wi][0]) wi = i; });
    const [a, b] = segs[wi];
    const mid = (a + b) / 2;
    let best = -1, bestN = 1e9;
    for (let x = a + Math.floor((b - a) * 0.15); x <= a + Math.ceil((b - a) * 0.85); x++) {
      const n = colCount(x);
      if (n < bestN || (n === bestN && Math.abs(x - mid) < Math.abs(best - mid))) { bestN = n; best = x; }
    }
    segs.splice(wi, 1, [a, best - 1], [best + 1, b]);
  }
  return segs;
}

function emptyColumnSplit(img) {
  const col = (x) => {
    for (let y = 0; y < img.height; y++) if (img.data[(y * img.width + x) * 4 + 3] > 0) return true;
    return false;
  };
  const segs = [];
  let s = -1;
  for (let x = 0; x <= img.width; x++) {
    const on = x < img.width && col(x);
    if (on && s < 0) s = x;
    if (!on && s >= 0) {
      if (x - s > 6) segs.push([s, x - 1]);
      s = -1;
    }
  }
  return segs;
}

export function bbox(img) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (img.data[(y * img.width + x) * 4 + 3] > 0) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
  return { x0, y0, x1, y1 };
}
