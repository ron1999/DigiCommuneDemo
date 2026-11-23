import { readPng, writePng } from '/Users/aaronaguirre/Documents/GitHub/DigiCommune/scripts/png.mjs';
const [inp, out] = process.argv.slice(2);
const im = readPng(inp); const W = im.width, H = im.height;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4; let [r, g, b] = im.data.subarray(i, i + 3);
  // warm multiply (like a Phaser MULTIPLY rectangle #FFF0D8)
  r *= 1.0; g *= 0.94; b *= 0.85;
  // sun glow from the upper left (ADD)
  const d = Math.hypot(x / W, y / H * 0.8); const glow = Math.max(0, 1 - d / 0.9) ** 2;
  r += 46 * glow; g += 28 * glow; b += 4 * glow;
  // vignette toward dusky purple
  const v = Math.min(1, Math.hypot(x / W - 0.5, y / H - 0.5) * 1.5) ** 2.2 * 0.35;
  r = r * (1 - v) + 70 * v; g = g * (1 - v) + 48 * v; b = b * (1 - v) + 78 * v;
  im.data[i] = Math.min(255, r); im.data[i + 1] = Math.min(255, g); im.data[i + 2] = Math.min(255, b);
}
writePng(out, im);
