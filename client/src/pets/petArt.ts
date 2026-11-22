import Phaser from 'phaser';
import { SPECIES } from './species';

// PLACEHOLDER pet art drawn in code: one 64x64 picture per species, facing down.
// The follower bobs and flips it to look alive. Real art can replace this later.
// Drawn on a plain canvas so both the game and the HTML panels can use it.

const D = 32; // designed at 32px, scaled 2x
export const PET_SIZE = 64;
const OUTLINE = '#2b2024';

const css = (c: number) => '#' + c.toString(16).padStart(6, '0');

type Ctx = CanvasRenderingContext2D;

function ellipse(g: Ctx, cx: number, cy: number, rx: number, ry: number, color: string): void {
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

function blob(g: Ctx, cx: number, cy: number, rx: number, ry: number, color: number): void {
  ellipse(g, cx, cy, rx + 1, ry + 1, OUTLINE);
  ellipse(g, cx, cy, rx, ry, css(color));
}

function rect(g: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}

function tri(g: Ctx, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, color: string): void {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.lineTo(x3, y3);
  g.fill();
}

function eyes(g: Ctx, y: number, gap: number): void {
  rect(g, 16 - gap - 2, y, 2, 3, '#222222');
  rect(g, 16 + gap, y, 2, 3, '#222222');
  rect(g, 16 - gap - 2, y, 1, 1, '#ffffff');
  rect(g, 16 + gap, y, 1, 1, '#ffffff');
}

const painters: ((g: Ctx, body: number, accent: number) => void)[] = [
  // Mossling: round fluffball with a sprout
  (g, body, accent) => {
    blob(g, 16, 21, 10, 8, body);
    rect(g, 15, 8, 2, 6, css(accent));
    blob(g, 12, 9, 3, 2, accent);
    blob(g, 20, 9, 3, 2, accent);
    eyes(g, 19, 3);
    rect(g, 8, 23, 3, 2, '#ff9fb0');
    rect(g, 21, 23, 3, 2, '#ff9fb0');
  },
  // Pebblet: little beetle
  (g, body, accent) => {
    blob(g, 16, 20, 10, 9, accent);
    blob(g, 16, 19, 8, 7, body);
    rect(g, 15, 12, 2, 14, css(accent));
    rect(g, 9, 9, 1, 4, OUTLINE);
    rect(g, 22, 9, 1, 4, OUTLINE);
    eyes(g, 26, 3);
  },
  // Fluffin: cloud-puff bird
  (g, body, accent) => {
    blob(g, 10, 20, 6, 5, body);
    blob(g, 22, 20, 6, 5, body);
    blob(g, 16, 17, 8, 8, body);
    tri(g, 14, 20, 18, 20, 16, 23, '#f2a03d');
    eyes(g, 15, 3);
    rect(g, 14, 8, 4, 3, css(accent));
  },
  // Glimmoth: glowing moth
  (g, body, accent) => {
    blob(g, 9, 15, 7, 8, body);
    blob(g, 23, 15, 7, 8, body);
    ellipse(g, 9, 15, 2, 2, '#fff3b0');
    ellipse(g, 23, 15, 2, 2, '#fff3b0');
    blob(g, 16, 19, 4, 8, accent);
    eyes(g, 15, 1);
  },
  // Snorbit: snail with a planet shell
  (g, body, accent) => {
    blob(g, 16, 25, 12, 3, body);
    blob(g, 18, 17, 8, 8, accent);
    ellipse(g, 18, 17, 10, 1.5, '#f5d58f');
    blob(g, 8, 20, 4, 5, body);
    rect(g, 6, 18, 2, 3, '#222222');
  },
  // Quillip: hedgehog with soft quills
  (g, body, accent) => {
    for (let i = 0; i < 7; i++) tri(g, 6 + i * 3, 16, 9 + i * 3, 6 + (i % 2) * 3, 12 + i * 3, 16, css(accent));
    blob(g, 16, 20, 10, 8, accent);
    blob(g, 16, 22, 7, 6, body);
    eyes(g, 20, 3);
    rect(g, 15, 24, 2, 2, OUTLINE);
  },
];

const pictures = new Map<number, HTMLCanvasElement>();

// The 64x64 picture of a species
export function petPicture(species: number): HTMLCanvasElement {
  const hit = pictures.get(species);
  if (hit) return hit;
  const sp = SPECIES[species] ?? SPECIES[0];

  const design = document.createElement('canvas');
  design.width = D;
  design.height = D;
  (painters[species] ?? painters[0])(design.getContext('2d')!, sp.body, sp.accent);

  const c = document.createElement('canvas');
  c.width = PET_SIZE;
  c.height = PET_SIZE;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(design, 0, 0, PET_SIZE, PET_SIZE);
  pictures.set(species, c);
  return c;
}

export function ensurePetTexture(scene: Phaser.Scene, species: number): string {
  const key = 'pet_' + species;
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, petPicture(species));
  return key;
}

// Draws a pet into a panel canvas. silhouette = a dark shape for pets not found yet.
export function drawPetIcon(species: number, ctx: CanvasRenderingContext2D, silhouette = false): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(petPicture(species), 0, 0, w, h);
  if (silhouette) {
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }
}
