// One consistent outline for every character sprite and item (owner's rule: all bodies and all
// items share the same darker outline colour).
//
//   applyOutline(img)  -> recolours, in place:
//     1. every near-black pixel (any dark line: outlines, inner lines) to OUTLINE_COLOR
//     2. every pixel on the outside edge of the shape (next to transparency) to OUTLINE_COLOR,
//        which also closes gaps where the art had no outline
// Works on any RGBA image from scripts/png.mjs; run it on single frames or whole sheets
// (sheet frames have transparent borders, so frames don't touch).

export const OUTLINE_COLOR = [0x1b, 0x11, 0x0a]; // the dark warm brown-black the approved art uses most
const DARK = 0.16; // pixels darker than this (average of r, g, b / 255) count as lines

export function applyOutline(img, color = OUTLINE_COLOR) {
  const { width: W, height: H, data } = img;
  const src = new Uint8Array(data);
  const opaque = (x, y) => x >= 0 && y >= 0 && x < W && y < H && src[(y * W + x) * 4 + 3] >= 128;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (src[i + 3] < 128) {
        data[i + 3] = 0; // no half-transparent pixels in pixel art
        continue;
      }
      const dark = (src[i] + src[i + 1] + src[i + 2]) / 765 < DARK;
      const edge = !opaque(x + 1, y) || !opaque(x - 1, y) || !opaque(x, y + 1) || !opaque(x, y - 1);
      if (dark || edge) {
        data[i] = color[0];
        data[i + 1] = color[1];
        data[i + 2] = color[2];
      }
      data[i + 3] = 255;
    }
  return img;
}
