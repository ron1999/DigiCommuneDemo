// Free "wind sway" for small plants: bends a sprite sideways, more at the top than at the base,
// one whole pixel at a time (crisp pixel art, no blur). Rows near the bottom stay fixed so the
// plant stays rooted. Returns a list of frames that loop seamlessly.
//
//   import { swayFrames, bobFrames } from './world-sway.mjs';
import { newImage } from './png.mjs';

const copyPx = (src, sx, sy, dst, dx, dy) => {
  if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) return;
  if (dx < 0 || dy < 0 || dx >= dst.width || dy >= dst.height) return;
  const s = (sy * src.width + sx) * 4;
  if (!src.data[s + 3]) return;
  dst.data.set(src.data.subarray(s, s + 4), (dy * dst.width + dx) * 4);
};

function bounds(img) {
  let top = img.height, bottom = -1;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (img.data[(y * img.width + x) * 4 + 3]) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
  return { top, bottom };
}

// offsets: the tip's sideways shift for each frame, e.g. [0, 1, 2, 1, 0, -1, -2, -1].
// rooted: how many bottom rows never move.
export function swayFrames(img, offsets = [0, 1, 2, 1, 0, -1, -2, -1], rooted = 3) {
  const { top, bottom } = bounds(img);
  const span = Math.max(1, bottom - rooted - top);
  return offsets.map((tip) => {
    const out = newImage(img.width, img.height);
    for (let y = 0; y < img.height; y++) {
      const t = Math.max(0, Math.min(1, (bottom - rooted - y) / span)); // 0 at the base, 1 at the tip
      const dx = Math.round(tip * t * t); // curve: the top bends most
      for (let x = 0; x < img.width; x++) copyPx(img, x, y, out, x + dx, y);
    }
    return out;
  });
}

// Mushrooms: a tiny 1px squash-and-stretch of the caps instead of a sway.
export function bobFrames(img, pattern = [0, 0, 1, 1, 0, 0, -1, -1], rooted = 6) {
  const { top, bottom } = bounds(img);
  return pattern.map((d) => {
    const out = newImage(img.width, img.height);
    for (let y = 0; y < img.height; y++) {
      // rows above the stem base shift up/down by d (only the top half moves)
      const dy = y < bottom - rooted && y < (top + bottom) / 2 ? -d : 0;
      for (let x = 0; x < img.width; x++) copyPx(img, x, y, out, x, y + dy);
    }
    // fill any 1px gap left under the moved part with the row below it
    if (pattern.some(Boolean)) for (let y = 0; y < img.height - 1; y++) for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4, j = ((y + 1) * img.width + x) * 4;
      if (!out.data[i + 3] && img.data[i + 3] && out.data[j + 3]) out.data.set(img.data.subarray(i, i + 4), i);
    }
    return out;
  });
}

// Floating things (lily pads): the whole sprite drifts by whole pixels, e.g. a slow 1px circle.
export function driftFrames(img, path = [[0, 0], [0, 0], [1, 0], [1, 0], [1, 1], [1, 1], [0, 1], [0, 1]]) {
  return path.map(([dx, dy]) => {
    const out = newImage(img.width, img.height);
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) copyPx(img, x, y, out, x + dx, y + dy);
    return out;
  });
}

// Hanging vines on a building: a vine layer (same size as the building) bends sideways inside each
// rect [x0, y0, x1, y1]: the top row (under the eave) stays put, the bottom swings the most.
export function hangFrames(vines, rects, tips = [0, 1, 1, 2, 1, 1, 0, -1]) {
  return tips.map((t) => {
    const out = newImage(vines.width, vines.height);
    for (let y = 0; y < vines.height; y++)
      for (let x = 0; x < vines.width; x++) {
        const r = rects.find(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
        const dx = r ? Math.round(t * ((y - r[1]) / Math.max(1, r[3] - r[1])) ** 1.5) : 0;
        copyPx(vines, x, y, out, x + dx, y);
      }
    return out;
  });
}
