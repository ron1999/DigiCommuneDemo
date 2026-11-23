// Builds the UI art in client/public/ui/ from the PixelLab downloads in scripts/art-src/ui/.
//   node scripts/build-ui.mjs
// Each frame/button is turned into a compact "9-slice" PNG: the four corners are kept as drawn,
// and a clean strip from the middle of each edge becomes the part CSS repeats or stretches
// (border-image). See docs/ART_SPEC.md "UI" for the slice sizes used in client/index.html.

import { mkdirSync, copyFileSync } from 'node:fs';
import { readPng, writePng, newImage } from './png.mjs';

const SRC = 'scripts/art-src/ui';
const OUT = 'client/public/ui';
const KIT = `${SRC}/kitzip/dc-ui-kit/elements`;
mkdirSync(`${OUT}/icons`, { recursive: true });

const dv = (im) => new DataView(im.data.buffer, im.data.byteOffset, im.data.byteLength);
const get = (im, x, y) => dv(im).getUint32((y * im.width + x) * 4);
const set = (im, x, y, v) => dv(im).setUint32((y * im.width + x) * 4, v >>> 0);

// Crop to the opaque pixels (or to an explicit rect)
function crop(im, rect) {
  let [x0, y0, x1, y1] = rect ?? [im.width, im.height, -1, -1];
  if (!rect) {
    for (let y = 0; y < im.height; y++)
      for (let x = 0; x < im.width; x++)
        if (im.data[(y * im.width + x) * 4 + 3] >= 128) {
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
  }
  const out = newImage(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++) {
      const v = get(im, x0 + x, y0 + y);
      set(out, x, y, (v & 0xff) >= 128 ? (v | 0xff) : 0); // hard alpha: pixel art has no half pixels
    }
  return out;
}

// Keep corners (cx wide, cy tall) and a mid strip (mx wide, my tall) taken from the centre.
function nineSlice(im, cx, cy, mx, my) {
  const W = cx * 2 + mx, H = cy * 2 + my;
  const out = newImage(W, H);
  const sx = Math.floor((im.width - mx) / 2), sy = Math.floor((im.height - my) / 2);
  const mapX = (x) => (x < cx ? x : x < cx + mx ? sx + (x - cx) : im.width - (W - x));
  const mapY = (y) => (y < cy ? y : y < cy + my ? sy + (y - cy) : im.height - (H - y));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(out, x, y, get(im, mapX(x), mapY(y)));
  return out;
}

function recolor(im, map) {
  const out = newImage(im.width, im.height);
  for (let y = 0; y < im.height; y++)
    for (let x = 0; x < im.width; x++) {
      const v = get(im, x, y);
      const hex = (v >>> 8).toString(16).padStart(6, '0');
      set(out, x, y, map[hex] && (v & 0xff) ? (parseInt(map[hex], 16) << 8) | 0xff : v);
    }
  return out;
}

const save = (name, im) => { writePng(`${OUT}/${name}.png`, im); console.log(name, im.width + 'x' + im.height); };

// Panel frame: 64 px corners (they hold the leaves and the mushroom), 48 px plain wood strips
const panel = crop(readPng(`${SRC}/panel.png`), [4, 14, 251, 241]);
save('panel', nineSlice(panel, 64, 64, 48, 48));

// Buttons: 12 px corners, 32 px middle strip; full height (29 px)
const btn = (file) => crop(readPng(`${KIT}/${file}`));
const B = (im) => nineSlice(im, 12, 12, 32, im.height - 24);
save('btn-main', B(btn('green_main_button/green_main_button.png')));
save('btn-main-down', B(btn('green_main_button/pressed.png')));
save('btn-wood', B(btn('wood_button/wood_button.png')));
save('btn-wood-down', B(btn('wood_button/pressed.png')));
save('btn-danger', B(btn('rose_red_button/rose_red_button.png')));
// The AI's pressed rose button came out lopsided: make it from the green pressed one instead
save('btn-danger-down', B(recolor(btn('green_main_button/pressed.png'), {
  '3e5e2a': '8e3b2e', '5e8a3a': 'c8574a', '8fb84a': 'e08a3a',
})));
save('tab', nineSlice(btn('tab.png'), 10, 10, 24, btn('tab.png').height - 20));
// The AI cut the text field off at the bottom: keep its top 12 rows and mirror them for the bottom
{
  const src = btn('text_input_field.png');
  const full = newImage(src.width, 34);
  for (let y = 0; y < 34; y++)
    for (let x = 0; x < src.width; x++) {
      const sy = y < 12 ? y : y < 22 ? 16 : 33 - y; // top as drawn, a plain parchment middle, mirrored top
      let v = get(src, x, sy);
      if (y >= 22 && sy < 12) { // the bottom is lit, not shaded: swap the dark inner shadow for parchment tones
        const hex = (v >>> 8).toString(16).padStart(6, '0');
        const swap = { '7a4e2c': 'e2c68e', 'c9a66b': 'f3e2b8' }[hex];
        if (swap && sy >= 7) v = (parseInt(swap, 16) << 8) | 0xff;
      }
      set(full, x, y, v);
    }
  save('input', nineSlice(full, 12, 12, 32, 10));
}
save('slot', nineSlice(btn('item_slot.png'), 14, 14, 24, 24));
save('round', btn('round_icon_button.png'));

// Icons: chosen frames from the 64-candidate PixelLab sheet (scripts/art-src/ui/icons/frame_N.png)
const ICONS = {
  coin: 0, shop: 1, wardrobe: 2, friends: 3, pets: 4, home: 5, decorate: 6, store: 7,
  manage: 8, logout: 9, chat: 10, send: 11, gift: 12, close: 13, lock: 14, star: 15,
  search: 46, gear: 36, mushroom: 51, lantern: 35,
};
for (const [name, i] of Object.entries(ICONS)) copyFileSync(`${SRC}/icons/frame_${i}.png`, `${OUT}/icons/${name}.png`);
console.log('icons', Object.keys(ICONS).length);

// ---- Hand-placed pixel pieces (no AI): chat bubble, name tag, joystick ring ----
const C = {
  ink: 0x1b110aff, dark: 0x4a2e1cff, wood: 0x7a4e2cff, light: 0xb07a45ff,
  cream: 0xfff4d6ff, parch: 0xf3e2b8ff, shade: 0xe2c68eff, gold: 0xf2b544ff,
};
// A rounded box with a 1 px ink outline, 2-step corners, a highlight row on top and a shade row at the bottom.
function box(w, h, fill, top, bottom) {
  const im = newImage(w, h);
  const cut = (x, y) => { // stepped corner: 2 px then 1 px
    const dx = Math.min(x, w - 1 - x), dy = Math.min(y, h - 1 - y);
    return (dx === 0 && dy < 2) || (dy === 0 && dx < 2);
  };
  const edge = (x, y) => {
    const dx = Math.min(x, w - 1 - x), dy = Math.min(y, h - 1 - y);
    return dx === 0 || dy === 0 || (dx === 1 && dy === 1);
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (cut(x, y)) continue;
      let v = fill;
      if (edge(x, y)) v = C.ink;
      else if (y === 1 || (y === 2 && (x === 1 || x === w - 2))) v = top;
      else if (y === h - 2) v = bottom;
      set(im, x, y, v);
    }
  return im;
}
save('bubble', box(16, 16, C.cream, C.cream, C.shade));        // 9-slice: 6 px corners
save('nametag', box(12, 12, C.dark, C.wood, C.ink));           // 9-slice: 4 px corners
// Bubble tail (7 x 5), drawn under the bubble's bottom edge, centred
{
  const t = newImage(7, 5);
  const rows = ['ICCCCCI', '.ICCCI.', '..ICI..', '..II...', '.......'];
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === 'I') set(t, x, y, C.ink); else if (ch === 'C') set(t, x, y, y === 0 ? C.shade : C.cream);
  }));
  save('bubble-tail', t);
}
// Joystick ring: 100 px wooden ring with a soft parchment centre
{
  const R = 50, im = newImage(R * 2, R * 2);
  for (let y = 0; y < R * 2; y++)
    for (let x = 0; x < R * 2; x++) {
      const d = Math.hypot(x + 0.5 - R, y + 0.5 - R);
      const lit = y < R - 8; // top half catches the sunset light
      let v = 0;
      if (d <= R && d > R - 1.2) v = C.ink;
      else if (d <= R - 1.2 && d > R - 3) v = lit ? C.light : C.wood;
      else if (d <= R - 3 && d > R - 6) v = C.wood;
      else if (d <= R - 6 && d > R - 7.2) v = C.ink;
      else if (d <= R - 7.2) v = 0xfff4d655; // faint parchment so the town shows through
      if (v) set(im, x, y, v);
    }
  save('joy-ring', im);
}
