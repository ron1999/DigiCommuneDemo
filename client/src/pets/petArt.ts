import Phaser from 'phaser';
import { SPECIES } from './species';

// Pet art: one sprite sheet per species in client/public/sprites/pets/<sheet>.png
// (docs/ART_SPEC.md "Pets"): 48 x 48 frames, 5 columns x 4 rows. Rows: down, left, right, up.
// Col 0 = standing, cols 1-4 = walk. The feet are at (24, 45) in every frame. Drawn at 1x.
// Sheets load on demand; the same image is used by the game and the HTML panels.

export const PET_FRAME = 48;
const COLS = 5;
export const PET_ORIGIN_Y = 45 / PET_FRAME; // feet
export const PET_DIRS = ['down', 'left', 'right', 'up'] as const;
export type PetDir = (typeof PET_DIRS)[number];

const images = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement | null>>();

function sheetOf(species: number): string {
  return (SPECIES[species] ?? SPECIES[0]).sheet;
}

function loadSheet(sheet: string): Promise<HTMLImageElement | null> {
  const hit = images.get(sheet);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(sheet);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        images.set(sheet, img);
        resolve(img);
      };
      img.onerror = () => resolve(null);
      img.src = 'sprites/pets/' + sheet + '.png';
    });
    pending.set(sheet, p);
  }
  return p;
}

export function petTextureKey(species: number): string {
  return 'pet_' + sheetOf(species);
}

export function petAnimKey(species: number, dir: PetDir): string {
  return petTextureKey(species) + '_walk_' + dir;
}

export function petStandFrame(dir: PetDir): number {
  return PET_DIRS.indexOf(dir) * COLS;
}

// Makes sure the species' sheet is a Phaser texture with its 4 walk animations.
// Calls onReady (maybe right away) once it is; returns the texture key.
export function ensurePetTexture(scene: Phaser.Scene, species: number, onReady: () => void): string {
  const key = petTextureKey(species);
  if (scene.textures.exists(key)) {
    onReady();
    return key;
  }
  void loadSheet(sheetOf(species)).then((img) => {
    if (!img || !scene.sys || !scene.sys.isActive()) return;
    if (!scene.textures.exists(key)) {
      scene.textures.addSpriteSheet(key, img, { frameWidth: PET_FRAME, frameHeight: PET_FRAME });
      PET_DIRS.forEach((dir, row) => {
        const anim = petAnimKey(species, dir);
        if (scene.anims.exists(anim)) return;
        scene.anims.create({
          key: anim,
          frames: scene.anims.generateFrameNumbers(key, { start: row * COLS + 1, end: row * COLS + 4 }),
          frameRate: 8,
          repeat: -1,
        });
      });
    }
    onReady();
  });
  return key;
}

// Draws a pet (standing, facing down) into a panel canvas, scaled up with crisp pixels.
// silhouette = a dark shape for pets not found yet. Draws once the sheet has loaded.
const boxes = new Map<string, { x: number; y: number; w: number; h: number }>();

// The visible part of the standing, facing-down frame
function standBox(sheet: string, img: HTMLImageElement): { x: number; y: number; w: number; h: number } {
  const hit = boxes.get(sheet);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = PET_FRAME;
  c.height = PET_FRAME;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0, PET_FRAME, PET_FRAME, 0, 0, PET_FRAME, PET_FRAME);
  const d = g.getImageData(0, 0, PET_FRAME, PET_FRAME).data;
  let x0 = PET_FRAME, y0 = PET_FRAME, x1 = 0, y1 = 0;
  for (let y = 0; y < PET_FRAME; y++)
    for (let x = 0; x < PET_FRAME; x++)
      if (d[(y * PET_FRAME + x) * 4 + 3] > 0) {
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
  const box = x1 >= x0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : { x: 0, y: 0, w: PET_FRAME, h: PET_FRAME };
  boxes.set(sheet, box);
  return box;
}

export function drawPetIcon(species: number, ctx: CanvasRenderingContext2D, silhouette = false): void {
  const sheet = sheetOf(species);
  void loadSheet(sheet).then((img) => {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!img) return;
    ctx.imageSmoothingEnabled = false;
    // Crop to the pet and scale by a whole number so the pixels stay square
    const b = standBox(sheet, img);
    const scale = Math.max(1, Math.floor(Math.min((w - 4) / b.w, (h - 4) / b.h)));
    const dw = b.w * scale, dh = b.h * scale;
    ctx.drawImage(img, b.x, b.y, b.w, b.h, Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh);
    if (silhouette) {
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = '#1b1b1b';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
  });
}
