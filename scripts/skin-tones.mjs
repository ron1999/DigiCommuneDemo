// Skin tones: a palette swap, not a tint. Every skin pixel of a body is mapped to one of 8
// brightness steps (STEP_LUM) and repainted with that step of a hand-picked 8-colour ramp, so
// shading and highlights stay crisp in every tone. Outline, eyes, tank top and shorts are
// untouched (only warm "skin" pixels change).
//
//   node scripts/skin-tones.mjs [--preview out.png]
//
// Output: client/public/sprites/bodies/skins/<tone>/<body>.png for every tone and body, plus
// client/public/sprites/bodies/skins/skins.json (tone ids, names, swatch colour) for the game.
// The plain client/public/sprites/bodies/<body>.png stays as the original (= tone "sunset").

import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, newImage, writePng } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BODIES = join(ROOT, 'client', 'public', 'sprites', 'bodies');
const OUT = join(BODIES, 'skins');

// brightness ((r+g+b)/765) of each of the 8 steps in the original art, dark -> light
const STEP_LUM = [0.33, 0.42, 0.49, 0.55, 0.62, 0.68, 0.73, 0.79];

// Hand-picked ramps, 8 colours dark -> light. Shadows lean red/purple, highlights lean warm.
// Step 5-6 is the main skin colour; the swatch shown in the wardrobe is step 6.
export const TONES = [
  { id: 'porcelain', name: 'Porcelain', ramp: ['6e3b3a', '9a5650', 'c27f72', 'dc9f8f', 'efbfae', 'f7d3c3', 'fce3d6', 'fff1e8'] },
  { id: 'fair', name: 'Fair', ramp: ['6b3626', '984f37', 'c0704f', 'd98e6c', 'edac88', 'f6c29f', 'fbd5b6', 'fde6d1'] },
  { id: 'sunset', name: 'Sunset', ramp: null }, // the original art, unchanged
  { id: 'golden', name: 'Golden', ramp: ['5e3418', '8a4f23', 'b06b2e', 'cc8740', 'dfa257', 'eab86e', 'f2cb88', 'f8dea8'] },
  { id: 'olive', name: 'Olive', ramp: ['5c3220', '845030', 'a86d3f', 'c48a55', 'd7a36d', 'e2b783', 'ecc99b', 'f4dcb8'] },
  { id: 'tan', name: 'Tan', ramp: ['532a1a', '7a3f24', 'a05a32', 'bb7441', 'cf8f56', 'dca46a', 'e7b881', 'f0cd9f'] },
  { id: 'brown', name: 'Brown', ramp: ['42210f', '63331b', '854a28', 'a06038', 'b67a4b', 'c69060', 'd4a576', 'e2bd94'] },
  { id: 'umber', name: 'Umber', ramp: ['341710', '4f2418', '6b3622', '864a30', '9c5f40', 'b07455', 'c28a6a', 'd3a385'] },
  { id: 'deep', name: 'Deep', ramp: ['24100c', '3a1a13', '52271c', '6a3727', '7f4a36', '935d47', 'a5725b', 'b98973'] },
  { id: 'ebony', name: 'Ebony', ramp: ['1b0d0d', '2c1615', '402220', '553027', '6a4035', '7d5245', '90665a', 'a37d70'] },
];

const hex = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
// warm AND saturated: the tank top's beige shading is warm too, but much less saturated
const isSkin = (r, g, b) => r - b > 40 && r >= g && (r - Math.min(g, b)) / r > 0.38;

export function swapSkin(img, ramp) {
  const cols = ramp.map(hex);
  const out = { width: img.width, height: img.height, data: new Uint8Array(img.data) };
  for (let i = 0; i < out.data.length; i += 4) {
    if (!out.data[i + 3]) continue;
    const r = out.data[i], g = out.data[i + 1], b = out.data[i + 2];
    if (!isSkin(r, g, b)) continue;
    const l = (r + g + b) / 765;
    let step = 0, best = 9;
    STEP_LUM.forEach((s, k) => { if (Math.abs(s - l) < best) { best = Math.abs(s - l); step = k; } });
    out.data.set(cols[step], i);
  }
  return out;
}

const bodies = readdirSync(BODIES).filter((f) => f.endsWith('.png'));
for (const t of TONES) {
  if (!t.ramp) continue;
  mkdirSync(join(OUT, t.id), { recursive: true });
  for (const f of bodies) writePng(join(OUT, t.id, f), swapSkin(readPng(join(BODIES, f)), t.ramp));
}
writeFileSync(
  join(OUT, 'skins.json'),
  JSON.stringify(
    {
      _about: 'Skin tones in wardrobe order. ramp null = the original sheet in sprites/bodies/; otherwise sprites/bodies/skins/<id>/<body>.png. swatch = colour to show in the picker.',
      tones: TONES.map((t) => ({ id: t.id, name: t.name, file: t.ramp ? `skins/${t.id}/` : '', swatch: '#' + (t.ramp ? t.ramp[6] : 'f7b37d') })),
    },
    null,
    2,
  ),
);
console.log(`${TONES.filter((t) => t.ramp).length} tones x ${bodies.length} bodies written to ${OUT}`);

const pv = process.argv.indexOf('--preview');
if (pv > 0) {
  // each tone: male-average + female-muscular-average + male-heavyset, front stand + side walk
  const picks = [['male-average', [[0, 0], [1, 2]]], ['female-average-muscular', [[0, 0], [1, 2]]], ['male-heavyset', [[0, 0], [3, 0]]]];
  const cw = 56, ch = 108;
  const img = newImage(TONES.length * (cw * 2 + 8), ch * picks.length);
  TONES.forEach((t, ti) => {
    picks.forEach(([name, cells], pi) => {
      const src = readPng(t.ramp ? join(OUT, t.id, `${name}.png`) : join(BODIES, `${name}.png`));
      cells.forEach(([row, col], k) => {
        for (let y = 0; y < ch; y++)
          for (let x = 0; x < cw; x++) {
            const i = ((row * 128 + 12 + y) * src.width + col * 128 + 36 + x) * 4;
            if (!src.data[i + 3]) continue;
            img.data.set(src.data.subarray(i, i + 4), ((pi * ch + y) * img.width + ti * (cw * 2 + 8) + k * cw + x) * 4);
          }
      });
    });
  });
  writePng(process.argv[pv + 1], img);
  console.log('preview:', process.argv[pv + 1]);
}
