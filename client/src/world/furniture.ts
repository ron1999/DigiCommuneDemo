import Phaser from 'phaser';
import { TILE_SIZE } from '../config';
import { FURNITURE, SLOT_SIZE } from './rooms';
import type { Furniture } from './rooms';

// Furniture art. The real art is PNGs in client/public/furniture/ (see loadFurnitureArt below);
// the painters here draw the PLACEHOLDER fallback in code at 32px per tile, scaled up to TILE_SIZE.
// An image loaded under the texture key 'furnart_<id>' before createFurnitureTextures() runs
// (same size as the piece: tiles wide x tiles tall, 64px per tile) also takes priority.

const D = 32; // design size of one tile
const OUTLINE = 0x2b2024;

type G = Phaser.GameObjects.Graphics;

function box(g: G, x: number, y: number, w: number, h: number, fill: number): void {
  g.fillStyle(OUTLINE, 1).fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle(fill, 1).fillRect(x, y, w, h);
}

const painters: Record<string, (g: G, w: number, h: number) => void> = {
  // Beds (2x2)
  furniture_0: (g) => {
    box(g, 6, 4, 52, 56, 0x8d6748);
    box(g, 9, 7, 46, 50, 0xf4f1ea);
    box(g, 14, 10, 36, 10, 0xffffff);
    box(g, 9, 26, 46, 31, 0x5b8bd0);
  },
  furniture_1: (g) => {
    box(g, 4, 2, 56, 60, 0x6e4a8e);
    box(g, 8, 6, 48, 52, 0xf4f1ea);
    box(g, 12, 9, 18, 9, 0xffffff);
    box(g, 34, 9, 18, 9, 0xffffff);
    box(g, 8, 24, 48, 34, 0xd65d7a);
    g.fillStyle(0xf2c94c, 1).fillRect(8, 30, 48, 2).fillRect(8, 44, 48, 2);
    for (const x of [3, 57]) box(g, x, 1, 4, 4, 0xf2c94c);
  },
  // Tables (2x1)
  furniture_2: (g) => {
    box(g, 4, 6, 56, 18, 0xa0703f);
    g.fillStyle(0x8a5d33, 1).fillRect(4, 14, 56, 1);
    box(g, 8, 24, 4, 6, 0x6e4a2a);
    box(g, 52, 24, 4, 6, 0x6e4a2a);
  },
  furniture_3: (g) => {
    g.fillStyle(OUTLINE, 1).fillEllipse(32, 15, 50, 22);
    g.fillStyle(0xe8e2d0, 1).fillEllipse(32, 15, 47, 19);
    box(g, 22, 10, 6, 5, 0xffffff);
    box(g, 34, 12, 6, 5, 0x5bb0d6);
    box(g, 30, 24, 4, 6, 0x6e4a2a);
  },
  // Seats (1x1)
  furniture_4: (g) => {
    g.fillStyle(OUTLINE, 1).fillCircle(16, 14, 11);
    g.fillStyle(0xb5824e, 1).fillCircle(16, 14, 10);
    box(g, 9, 22, 3, 8, 0x6e4a2a);
    box(g, 20, 22, 3, 8, 0x6e4a2a);
  },
  furniture_5: (g) => {
    box(g, 4, 4, 24, 12, 0x3f7f6b);
    box(g, 4, 14, 24, 14, 0x4f9a82);
    box(g, 2, 10, 5, 18, 0x3f7f6b);
    box(g, 25, 10, 5, 18, 0x3f7f6b);
  },
  // Rugs (3x2)
  furniture_6: (g) => {
    g.fillStyle(0xb24a3a, 1).fillEllipse(48, 32, 88, 56);
    g.fillStyle(0xe0a458, 1).fillEllipse(48, 32, 72, 42);
    g.fillStyle(0xb24a3a, 1).fillEllipse(48, 32, 44, 24);
  },
  furniture_7: (g) => {
    const colors = [0x2e86ab, 0xf6f5ae, 0xf18f01, 0xf6f5ae];
    for (let i = 0; i < 8; i++) {
      g.fillStyle(colors[i % 4], 1).fillRect(6, 6 + i * 6.5, 84, 6.5);
    }
  },
  // Plants (1x1)
  furniture_8: (g) => {
    g.fillStyle(0x2f7d32, 1);
    g.fillEllipse(10, 10, 10, 18).fillEllipse(22, 10, 10, 18).fillEllipse(16, 7, 10, 16);
    g.fillStyle(0x4caf50, 1).fillEllipse(16, 12, 14, 12);
    box(g, 9, 19, 14, 11, 0xc0673a);
  },
  furniture_9: (g) => {
    box(g, 13, 5, 7, 16, 0x5b9b46);
    box(g, 7, 10, 5, 7, 0x5b9b46);
    box(g, 21, 8, 5, 6, 0x5b9b46);
    g.fillStyle(0xff8fb1, 1).fillRect(15, 3, 3, 3);
    box(g, 9, 21, 15, 9, 0xd9c3a3);
  },
  // Lamps (1x1)
  furniture_10: (g) => {
    box(g, 9, 3, 14, 10, 0xf2e2a0);
    box(g, 15, 13, 2, 14, 0x555555);
    box(g, 10, 27, 12, 3, 0x555555);
  },
  furniture_11: (g) => {
    box(g, 11, 4, 10, 18, 0x7d3c98);
    g.fillStyle(0xff7a59, 1).fillCircle(16, 9, 3).fillCircle(15, 17, 2);
    box(g, 9, 22, 14, 8, 0xb0b0b0);
  },
  // Wall art (2x1, hangs on the wall)
  furniture_12: (g) => {
    box(g, 16, 3, 32, 18, 0xf4d35e);
    g.fillStyle(0xee6352, 1).fillCircle(32, 12, 6);
    g.fillStyle(0x0d3b66, 1).fillRect(20, 17, 24, 2);
  },
  furniture_13: (g) => {
    box(g, 10, 2, 44, 20, 0x8a5d33);
    box(g, 13, 5, 38, 14, 0x9fd3e6);
    g.fillStyle(0x4caf50, 1).fillRect(13, 14, 38, 5);
    g.fillStyle(0xfff3b0, 1).fillCircle(42, 9, 3);
  },
};

export function furnitureTextureKey(f: Furniture): string {
  return 'furn_' + f.id;
}

// Real art (PixelLab): client/public/furniture/<id>.png at the piece's size in game pixels
// (64px per tile), made by scripts/build-furniture.mjs. Loaded here so the scenes don't need
// to know about it; until a file has loaded (or if it's missing) the placeholder is shown,
// and the texture is redrawn as soon as the image arrives.
const FURNITURE_ART_DIR = 'furniture/';
const furnitureArt = new Map<string, HTMLImageElement>();
const furnitureArtWaiting = new Map<string, (() => void)[]>();

function loadFurnitureArt(id: string, onLoad: () => void): HTMLImageElement | null {
  const ready = furnitureArt.get(id);
  if (ready) return ready;
  const waiting = furnitureArtWaiting.get(id);
  if (waiting) {
    waiting.push(onLoad);
    return null;
  }
  furnitureArtWaiting.set(id, [onLoad]);
  const img = new Image();
  img.onload = () => {
    furnitureArt.set(id, img);
    for (const cb of furnitureArtWaiting.get(id) ?? []) cb();
    furnitureArtWaiting.delete(id);
  };
  img.onerror = () => furnitureArtWaiting.delete(id);
  img.src = FURNITURE_ART_DIR + id + '.png';
  return null;
}

// Makes sure every piece of furniture has a texture (real art if loaded, or the placeholder)
export function createFurnitureTextures(scene: Phaser.Scene): void {
  const scale = TILE_SIZE / D;
  for (const f of FURNITURE) {
    const key = furnitureTextureKey(f);
    if (scene.textures.exists(key)) continue;
    const size = SLOT_SIZE[f.type];
    const w = size.w * D;
    const h = size.h * D;

    const canvas = scene.textures.createCanvas(key, w * scale, h * scale)!;
    const ctx = canvas.getContext();
    ctx.imageSmoothingEnabled = false;

    const drawArt = (img: HTMLImageElement) => {
      ctx.clearRect(0, 0, w * scale, h * scale);
      ctx.drawImage(img, 0, 0, w * scale, h * scale);
      canvas.refresh();
    };
    const art = scene.textures.exists('furnart_' + f.id)
      ? (scene.textures.get('furnart_' + f.id).getSourceImage() as HTMLImageElement)
      : loadFurnitureArt(f.id, () => {
          const img = furnitureArt.get(f.id);
          // the texture may have been removed if the game was torn down meanwhile
          if (img && scene.textures.exists(key)) drawArt(img);
        });

    if (art) {
      ctx.drawImage(art, 0, 0, w * scale, h * scale);
    } else {
      const g = scene.make.graphics({}, false);
      (painters[f.id] ?? ((gg: G) => box(gg, 2, 2, w - 4, h - 4, 0xff00ff)))(g, w, h);
      const tmpKey = key + '_design';
      g.generateTexture(tmpKey, w, h);
      g.destroy();
      ctx.drawImage(scene.textures.get(tmpKey).getSourceImage() as HTMLCanvasElement, 0, 0, w * scale, h * scale);
      scene.textures.remove(tmpKey);
    }
    canvas.refresh();
  }
}

// Draws a small picture of a piece of furniture (for the Decorate panel and shop)
export function drawFurnitureIcon(scene: Phaser.Scene | null, f: Furniture, ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (!scene || !scene.textures.exists(furnitureTextureKey(f))) return;
  const src = scene.textures.get(furnitureTextureKey(f)).getSourceImage() as HTMLCanvasElement;
  const s = Math.min(ctx.canvas.width / src.width, ctx.canvas.height / src.height);
  const w = src.width * s;
  const h = src.height * s;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, (ctx.canvas.width - w) / 2, (ctx.canvas.height - h) / 2, w, h);
}
