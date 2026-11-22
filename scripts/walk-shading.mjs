// Cleans up PixelLab template walk frames, which paint the back arm/leg in muddy dark reds
// and odd dark greys that the standing art never uses. Every pixel is mapped back onto the
// standing frame's own colours, but too-dark pixels are first lifted to the standing art's
// shadow tones, so the back limbs get a normal shadow instead of a near-black red.
// Real outlines (near-black) are kept as they are.

const lum = (r, g, b) => (r + g + b) / 765;
const sat = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b); // (extra args, like a pixel count, are ignored)

// The standing frame's colours (ignoring transparent pixels), most used first
export function paletteOf(img) {
  const m = new Map();
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < 128) continue;
    const k = (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2];
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()]
    .filter(([, n]) => n >= 3)
    .map(([k, n]) => [(k >> 16) & 255, (k >> 8) & 255, k & 255, n]); // [r, g, b, pixel count]
}

function dist(a, b) {
  const rm = (a[0] + b[0]) / 2, dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}

// Fixes one walk frame in place. `palette` = paletteOf(standing frame).
export function fixWalkFrame(img, palette) {
  const OUTLINE = 0.13; // darker than this = outline, kept
  const WARM_MIN = 0.45, GREY_MIN = 0.33; // shadow floors for skin-like and grey (cloth) tones
  // the darkest non-outline tone the standing art uses, per colour family
  // (only tones at least `min` bright count, so the floor is a real mid shadow, not a line)
  const shadowFloor = (family, min) => {
    let best = null, bl = 1;
    for (const p of palette) {
      const l = lum(...p);
      if (l < min) continue;
      if (family(p) && l < bl) { bl = l; best = p; }
    }
    return { color: best, l: bl };
  };
  const isWarm = (p) => p[0] - p[2] > 40 && p[0] >= p[1];
  const isGrey = (p) => sat(...p) < 30;
  const warmFloor = shadowFloor(isWarm, WARM_MIN), greyFloor = shadowFloor(isGrey, GREY_MIN);
  const warmPal = palette.filter(isWarm), nonWarmPal = palette.filter((p) => !isWarm(p));
  // Brightness ceiling for skin: the tone below which 90% of the standing art's skin pixels are.
  // Brighter walk pixels (pale blotches on the legs) are mapped down to it.
  const warmCeil = (() => {
    const sorted = [...warmPal].sort((a, b) => lum(a[0], a[1], a[2]) - lum(b[0], b[1], b[2]));
    const total = sorted.reduce((t, p) => t + p[3], 0);
    let acc = 0;
    for (const p of sorted) { acc += p[3]; if (acc >= total * 0.9) return { color: p, l: lum(p[0], p[1], p[2]) }; }
    return null;
  })();
  // Solid dark patches (not thin outline lines): a dark pixel whose 8 neighbours are all
  // opaque and mostly dark is part of a blob. It gets the shadow of the nearest real colour.
  const W = img.width, H = img.height, src = new Uint8Array(img.data);
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : (y * W + x) * 4);
  const isDark = (j) => j >= 0 && src[j + 3] >= 128 && lum(src[j], src[j + 1], src[j + 2]) < OUTLINE;
  const blob = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const j = at(x, y);
      if (!isDark(j)) continue;
      let opaque = 0, dark = 0;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const n = at(x + ox, y + oy);
          if (n >= 0 && src[n + 3] >= 128) opaque++;
          if (isDark(n)) dark++;
        }
      if (opaque === 8 && dark >= 5) blob[y * W + x] = 1;
    }
  const nearestFamily = (x, y) => {
    for (let r = 1; r <= 6; r++)
      for (let oy = -r; oy <= r; oy++)
        for (let ox = -r; ox <= r; ox++) {
          const n = at(x + ox, y + oy);
          if (n < 0 || src[n + 3] < 128 || isDark(n)) continue;
          const c = [src[n], src[n + 1], src[n + 2]];
          return isWarm(c) ? warmFloor.color : greyFloor.color;
        }
    return greyFloor.color;
  };
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < 128) { img.data[i + 3] = 0; continue; }
    const c = [img.data[i], img.data[i + 1], img.data[i + 2]];
    const l = lum(...c);
    if (l < OUTLINE) {
      const k = i / 4;
      if (blob[k]) {
        const t = nearestFamily(k % W, Math.floor(k / W));
        if (t) img.data.set([t[0], t[1], t[2]], i);
      }
      continue; // a real outline stays as drawn
    }
    let target = null;
    if (isWarm(c) && warmFloor.color && l < warmFloor.l) target = warmFloor.color;
    else if (isWarm(c) && warmCeil && l > warmCeil.l + 0.04) target = warmCeil.color;
    else if (isGrey(c) && greyFloor.color && l < greyFloor.l) target = greyFloor.color;
    if (!target) {
      // snap within the same colour family, so a bright skin highlight never turns into the
      // tank top's cream, and cloth (cream or grey) never turns into skin
      const fam = isWarm(c) ? warmPal : nonWarmPal;
      const pool = fam.length ? fam : palette;
      let bd = 1e18;
      for (const p of pool) { const d = dist(c, p); if (d < bd) { bd = d; target = p; } }
    }
    img.data[i] = target[0]; img.data[i + 1] = target[1]; img.data[i + 2] = target[2]; img.data[i + 3] = 255;
  }
  // Stray cloth-coloured pixels on bare skin (the walk sometimes paints the tank top's cream
  // onto a leg): a light, non-skin pixel mostly surrounded by skin becomes a skin highlight.
  // Only below the shorts (the legs): elsewhere cream is the tank top.
  // (repeated a few times so bigger patches are eaten from their edges inwards)
  let legsFrom = H;
  for (let y = H - 1; y >= 0 && legsFrom === H; y--) {
    let n = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const c = [img.data[i], img.data[i + 1], img.data[i + 2]];
      if (img.data[i + 3] >= 128 && isGrey(c) && lum(...c) > 0.2 && lum(...c) < 0.6) n++;
    }
    if (n >= 4) legsFrom = y + 1;
  }
  for (let pass = 0; warmCeil && pass < 4; pass++) {
    const res = new Uint8Array(img.data);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (y < legsFrom || res[i + 3] < 128) continue;
        const c = [res[i], res[i + 1], res[i + 2]];
        if (isWarm(c) || lum(...c) < 0.6) continue;
        let warm = 0;
        for (let oy = -1; oy <= 1; oy++)
          for (let ox = -1; ox <= 1; ox++) {
            if (!ox && !oy) continue;
            const n = at(x + ox, y + oy);
            if (n >= 0 && res[n + 3] >= 128 && isWarm([res[n], res[n + 1], res[n + 2]])) warm++;
          }
        if (warm >= 4) img.data.set([warmCeil.color[0], warmCeil.color[1], warmCeil.color[2]], i);
      }
  }
  return img;
}
