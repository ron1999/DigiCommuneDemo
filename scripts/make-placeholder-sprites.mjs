// Draws PLACEHOLDER character sprite sheets so the game works before real art exists.
// Real (AI-generated) art replaces these files one by one: same file names, same layout.
// See docs/ART_SPEC.md for the format.
//
// Run from the repo root:   node scripts/make-placeholder-sprites.mjs
// Output:                   client/public/sprites/*.png
//
// Uses only Node's built-in modules (no installs needed).

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRAME = 128; // each frame is 128 x 128
const WALK_FRAMES = 4; // columns 1-4 are the walk cycle, column 0 is standing
const COLS = 1 + WALK_FRAMES;
const ROWS = 4; // down, left, right, up
const W = FRAME * COLS;
const H = FRAME * ROWS;

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'client', 'public', 'sprites');

// Grey tones: recolorable layers are drawn in grey, and the game tints them.
// Mid grey (~128) becomes the chosen color; darker/lighter greys become shades of it.
const OUTLINE = [24, 20, 28];
const DARK = 92;
const MID = 140;
const LIGHT = 196;
const grey = (v) => [v, v, v];

// ---------- tiny image + PNG writer ----------

function newImage() {
  return new Uint8Array(W * H * 4);
}

function px(img, x, y, c) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  img[i] = c[0];
  img[i + 1] = c[1];
  img[i + 2] = c[2];
  img[i + 3] = 255;
}

// Frame-local drawing helpers. (fx, fy) is the frame's top-left corner.
function makePen(img, fx, fy) {
  const rect = (x, y, w, h, c) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(img, fx + x + i, fy + y + j, c);
  };
  const ellipse = (cx, cy, rx, ry, c, onlyTop = false) => {
    for (let y = -ry; y <= ry; y++) {
      if (onlyTop && y > 0) continue;
      for (let x = -rx; x <= rx; x++) {
        if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) px(img, fx + cx + x, fy + cy + y, c);
      }
    }
  };
  // Shapes with a 2px dark outline, a fill, and a lighter highlight band
  const oRect = (x, y, w, h, fill, hi) => {
    rect(x - 2, y - 2, w + 4, h + 4, OUTLINE);
    rect(x, y, w, h, fill);
    if (hi) rect(x, y, Math.max(2, Math.floor(w / 3)), h, hi);
  };
  const oEllipse = (cx, cy, rx, ry, fill, hi, onlyTop = false) => {
    ellipse(cx, cy, rx + 2, ry + 2, OUTLINE, onlyTop);
    ellipse(cx, cy, rx, ry, fill, onlyTop);
    if (hi) ellipse(cx - Math.floor(rx / 3), cy - Math.floor(ry / 3), Math.floor(rx / 3), Math.floor(ry / 3), hi);
  };
  return { rect, ellipse, oRect, oEllipse };
}

function writePng(file, img) {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0; // filter: none
    Buffer.from(img.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(join(OUT, file), png);
}

// The "right" row is a mirror of the "left" row
function mirrorLeftToRight(img) {
  for (let col = 0; col < COLS; col++) {
    for (let y = 0; y < FRAME; y++) {
      for (let x = 0; x < FRAME; x++) {
        const src = ((1 * FRAME + y) * W + col * FRAME + x) * 4;
        const dst = ((2 * FRAME + y) * W + col * FRAME + (FRAME - 1 - x)) * 4;
        for (let k = 0; k < 4; k++) img[dst + k] = img[src + k];
      }
    }
  }
}

// ---------- the character ----------
// Character is centred at x = 64, feet at about y = 118. Head centre about (64, 46).

const DIRS = ['down', 'left', 'right', 'up'];

// Pose for a frame: body bob and leg/arm swing
function pose(col) {
  if (col === 0) return { bob: 0, swing: 0 };
  const cycle = [1, 0, -1, 0][(col - 1) % 4]; // step, pass, other step, pass
  return { bob: cycle === 0 ? -2 : 0, swing: cycle };
}

// Draws one layer into every frame. draw(pen, dir, pose)
function makeSheet(file, draw) {
  const img = newImage();
  for (let row = 0; row < ROWS; row++) {
    if (DIRS[row] === 'right') continue;
    for (let col = 0; col < COLS; col++) {
      const p = pose(col);
      draw(makePen(img, col * FRAME, row * FRAME + p.bob), DIRS[row], p);
    }
  }
  mirrorLeftToRight(img);
  writePng(file, img);
  console.log('wrote', file);
}

const side = (d) => d === 'left' || d === 'right';

// Body: skin (recolored). Head, neck, hands, legs.
function drawBody(pen, dir, { swing }) {
  const skin = grey(MID);
  const hi = grey(LIGHT);
  // legs (shown below shorts/trousers only where the outfit doesn't cover)
  if (side(dir)) {
    pen.oRect(58 + swing * 6, 94, 10, 22, skin);
    pen.oRect(58 - swing * 6, 94, 10, 22, skin);
  } else {
    pen.oRect(50, 94 - Math.max(0, swing) * 3, 11, 22, skin);
    pen.oRect(67, 94 - Math.max(0, -swing) * 3, 11, 22, skin);
  }
  // arms
  if (side(dir)) {
    pen.oRect(59 - swing * 5, 66, 10, 28, skin, hi);
  } else {
    pen.oRect(38, 66 + swing * 2, 9, 28, skin, hi);
    pen.oRect(81, 66 - swing * 2, 9, 28, skin, hi);
  }
  // neck and head
  pen.oRect(58, 60, 12, 8, skin);
  pen.oEllipse(64, 44, side(dir) ? 18 : 20, 20, skin, hi);
  if (side(dir)) pen.oEllipse(48, 46, 4, 6, skin); // nose bump on the facing side
}

// Face: kept in its own colors (not recolored). Eyes and mouth.
function drawFace(pen, dir) {
  const eye = [30, 26, 40];
  const white = [250, 250, 250];
  const mouth = [196, 90, 100];
  if (dir === 'down') {
    pen.rect(54, 42, 5, 8, eye);
    pen.rect(69, 42, 5, 8, eye);
    pen.rect(55, 43, 2, 2, white);
    pen.rect(70, 43, 2, 2, white);
    pen.rect(60, 55, 8, 2, mouth);
  } else if (dir === 'left') {
    pen.rect(52, 42, 5, 8, eye);
    pen.rect(53, 43, 2, 2, white);
    pen.rect(50, 55, 6, 2, mouth);
  }
}

// Outfits: recolored. Saturated details (trousers, shoes) keep their colors.
const TROUSERS = [52, 60, 110];
const SHOES = [90, 52, 30];

function legsAndShoes(pen, dir, swing, trousers) {
  if (side(dir)) {
    for (const s of [swing, -swing]) {
      if (trousers) pen.oRect(57 + s * 6, 92, 12, 18, trousers);
      pen.oRect(55 + s * 6, 110, 14, 6, SHOES);
    }
  } else {
    const l = Math.max(0, swing) * 3;
    const r = Math.max(0, -swing) * 3;
    if (trousers) {
      pen.oRect(49, 92 - l, 13, 18, trousers);
      pen.oRect(66, 92 - r, 13, 18, trousers);
    }
    pen.oRect(48, 110 - l, 14, 6, SHOES);
    pen.oRect(66, 110 - r, 14, 6, SHOES);
  }
}

function torso(pen, dir, fill, hi) {
  if (side(dir)) pen.oRect(52, 64, 24, 32, fill, hi);
  else pen.oRect(46, 64, 36, 32, fill, hi);
}

function sleeves(pen, dir, swing, fill, long) {
  const h = long ? 26 : 12;
  if (side(dir)) pen.oRect(58 - swing * 5, 65, 12, h, fill);
  else {
    pen.oRect(37, 65 + swing * 2, 11, h, fill);
    pen.oRect(80, 65 - swing * 2, 11, h, fill);
  }
}

function drawTshirt(pen, dir, { swing }) {
  legsAndShoes(pen, dir, swing, TROUSERS);
  torso(pen, dir, grey(MID), grey(LIGHT));
  sleeves(pen, dir, swing, grey(MID), false);
}

function drawHoodie(pen, dir, { swing }) {
  legsAndShoes(pen, dir, swing, TROUSERS);
  torso(pen, dir, grey(MID), grey(LIGHT));
  sleeves(pen, dir, swing, grey(MID), true);
  if (dir === 'down') {
    pen.rect(56, 66, 16, 4, grey(DARK)); // hood edge
    pen.rect(58, 70, 2, 10, [235, 235, 235]); // drawstrings (light grey: recolored lighter)
    pen.rect(68, 70, 2, 10, [235, 235, 235]);
    pen.rect(54, 84, 20, 8, grey(DARK)); // pocket
  } else if (dir === 'up') {
    pen.oRect(50, 60, 28, 12, grey(DARK)); // hood on the back
  } else {
    pen.oRect(62, 60, 14, 12, grey(DARK));
  }
}

function drawOveralls(pen, dir, { swing }) {
  legsAndShoes(pen, dir, swing, null);
  // shirt underneath keeps its own color
  const shirt = [236, 232, 220];
  torso(pen, dir, shirt);
  sleeves(pen, dir, swing, shirt, false);
  // bib and legs are the recolored part
  if (side(dir)) {
    pen.oRect(54, 76, 20, 20, grey(MID), grey(LIGHT));
    for (const s of [swing, -swing]) pen.oRect(57 + s * 6, 92, 12, 18, grey(MID));
  } else {
    pen.oRect(52, 72, 24, 24, grey(MID), grey(LIGHT));
    pen.rect(52, 64, 4, 10, grey(DARK)); // straps
    pen.rect(72, 64, 4, 10, grey(DARK));
    const l = Math.max(0, swing) * 3;
    const r = Math.max(0, -swing) * 3;
    pen.oRect(49, 92 - l, 13, 18, grey(MID));
    pen.oRect(66, 92 - r, 13, 18, grey(MID));
    if (dir === 'down') {
      pen.rect(55, 74, 4, 4, [230, 200, 80]); // buttons keep their color
      pen.rect(69, 74, 4, 4, [230, 200, 80]);
    }
  }
}

// Hair: recolored.
function hairCap(pen, dir) {
  const c = grey(MID);
  if (dir === 'up') {
    pen.oEllipse(64, 44, 21, 21, c, grey(LIGHT));
  } else if (side(dir)) {
    pen.oEllipse(66, 38, 19, 15, c, grey(LIGHT), true);
    pen.oRect(70, 34, 12, 20, c); // back of the head
  } else {
    pen.oEllipse(64, 38, 21, 15, c, grey(LIGHT), true);
    pen.rect(44, 36, 6, 12, c); // sideburns
    pen.rect(78, 36, 6, 12, c);
  }
}

function drawShortHair(pen, dir) {
  hairCap(pen, dir);
}

function drawLongHair(pen, dir) {
  const c = grey(MID);
  if (dir === 'up') pen.oRect(44, 44, 40, 30, c, grey(LIGHT));
  else if (side(dir)) pen.oRect(68, 40, 16, 32, c);
  else {
    pen.oRect(42, 40, 9, 32, c);
    pen.oRect(77, 40, 9, 32, c);
  }
  hairCap(pen, dir);
}

function drawSpikyHair(pen, dir) {
  hairCap(pen, dir);
  const c = grey(MID);
  const spikes = side(dir) ? [52, 62, 72, 80] : [48, 58, 68, 78];
  for (const x of spikes) {
    for (let i = 0; i < 10; i++) {
      pen.rect(x - 5 + Math.floor(i / 2), 26 - i, 12 - i, 1, i === 9 ? OUTLINE : c);
    }
  }
}

// Accessories: keep their own colors.
function drawGlasses(pen, dir) {
  const frame = [30, 30, 36];
  const lens = [170, 210, 230];
  if (dir === 'down') {
    pen.oRect(51, 41, 10, 8, lens);
    pen.oRect(67, 41, 10, 8, lens);
    pen.rect(61, 43, 6, 2, frame);
  } else if (side(dir)) {
    pen.oRect(48, 41, 10, 8, lens);
    pen.rect(58, 43, 16, 2, frame);
  }
}

function drawCap(pen, dir) {
  const red = [200, 50, 50];
  const hi = [235, 95, 90];
  if (dir === 'up') pen.oEllipse(64, 34, 22, 14, red, hi, true);
  else if (side(dir)) {
    pen.oEllipse(66, 34, 20, 14, red, hi, true);
    pen.oRect(38, 32, 18, 5, red); // brim points forward
  } else {
    pen.oEllipse(64, 34, 22, 14, red, hi, true);
    pen.oRect(46, 33, 36, 5, red);
  }
}

function drawHeadband(pen, dir) {
  const band = [240, 190, 40];
  if (side(dir)) pen.oRect(46, 30, 38, 5, band);
  else pen.oRect(44, 30, 40, 5, band);
}

mkdirSync(OUT, { recursive: true });
makeSheet('body.png', drawBody);
makeSheet('face.png', drawFace);
makeSheet('outfit-0.png', drawTshirt);
makeSheet('outfit-1.png', drawHoodie);
makeSheet('outfit-2.png', drawOveralls);
makeSheet('hair-0.png', drawShortHair);
makeSheet('hair-1.png', drawLongHair);
makeSheet('hair-2.png', drawSpikyHair);
// hair 3 is "Bald": no file
makeSheet('accessory-1.png', drawGlasses);
makeSheet('accessory-2.png', drawCap);
makeSheet('accessory-3.png', drawHeadband);
