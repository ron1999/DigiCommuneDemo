import Phaser from 'phaser';
import { TILE_SIZE } from '../config';

// Draws simple placeholder art in code so the prototype needs no image files.
// Later we will replace this with real tileset images (AI-generated art + Tiled).
// The art is designed at 32px and scaled up to TILE_SIZE with crisp pixels.
const DESIGN_SIZE = 32;

export function createTilesetTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('tiles')) return;

  const S = DESIGN_SIZE;
  const g = scene.make.graphics({}, false);

  const grassBase = (ox: number) => {
    g.fillStyle(0x5cb85c, 1).fillRect(ox, 0, S, S);
    g.fillStyle(0x4ca64c, 1);
    g.fillRect(ox + 6, 8, 2, 2);
    g.fillRect(ox + 20, 22, 2, 2);
    g.fillRect(ox + 26, 6, 2, 2);
    g.fillRect(ox + 10, 26, 2, 2);
  };

  // 0 grass
  grassBase(0);

  // 1 path
  let ox = S * 1;
  g.fillStyle(0xd9c28f, 1).fillRect(ox, 0, S, S);
  g.fillStyle(0xc8b07a, 1);
  g.fillRect(ox + 5, 6, 3, 2);
  g.fillRect(ox + 20, 14, 3, 2);
  g.fillRect(ox + 12, 25, 3, 2);

  // 2 water
  ox = S * 2;
  g.fillStyle(0x4a90d9, 1).fillRect(ox, 0, S, S);
  g.fillStyle(0x78b4ee, 1);
  g.fillRect(ox + 4, 10, 10, 2);
  g.fillRect(ox + 16, 22, 10, 2);

  // 3 tree (on grass)
  ox = S * 3;
  grassBase(ox);
  g.fillStyle(0x6b4423, 1).fillRect(ox + 14, 20, 4, 10);
  g.fillStyle(0x2e7d32, 1).fillCircle(ox + 16, 14, 11);
  g.fillStyle(0x43a047, 1).fillCircle(ox + 12, 10, 4);

  // 4 wall (brick)
  ox = S * 4;
  g.fillStyle(0x9c6b43, 1).fillRect(ox, 0, S, S);
  g.fillStyle(0x7d5233, 1);
  for (let r = 0; r < 4; r++) {
    g.fillRect(ox, r * 8, S, 1);
    const offset = r % 2 === 0 ? 0 : 8;
    for (let c = offset; c < S; c += 16) g.fillRect(ox + c, r * 8, 1, 8);
  }

  // 5 door
  ox = S * 5;
  g.fillStyle(0x9c6b43, 1).fillRect(ox, 0, S, S);
  g.fillStyle(0x4e3219, 1).fillRect(ox + 8, 6, 16, 26);
  g.fillStyle(0xf2c94c, 1).fillCircle(ox + 20, 20, 2);

  // 6 flower (on grass)
  ox = S * 6;
  grassBase(ox);
  g.fillStyle(0xff8fb1, 1);
  g.fillCircle(ox + 10, 12, 3);
  g.fillCircle(ox + 22, 20, 3);
  g.fillStyle(0xffe066, 1);
  g.fillCircle(ox + 10, 12, 1);
  g.fillCircle(ox + 22, 20, 1);

  g.generateTexture('tiles-design', S * 7, S);
  g.destroy();

  // Scale up to the real tile size without blurring
  const scale = TILE_SIZE / DESIGN_SIZE;
  const src = scene.textures.get('tiles-design').getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const canvas = scene.textures.createCanvas('tiles', S * 7 * scale, S * scale)!;
  const ctx = canvas.getContext();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, S * 7 * scale, S * scale);
  canvas.refresh();
  scene.textures.remove('tiles-design');
}
