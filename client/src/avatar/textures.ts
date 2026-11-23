import Phaser from 'phaser';
import { avatarKey } from './avatar';
import type { Avatar } from './avatar';
import {
  DIRECTIONS,
  FEET_Y,
  FRAME_SIZE,
  SHEET_COLS,
  WALK_FRAMES,
  composeAvatarSheet,
  directionFor,
  frameIndex,
  onSheetUpdated,
} from './sprites';
import type { Direction } from './sprites';

const WALK_FPS = 8;

// A look's art may still be loading when its texture is made; when it arrives the sheet
// canvas is redrawn, and the texture must be sent to the graphics card again.
const managers = new Set<Phaser.Textures.TextureManager>();
onSheetUpdated((key) => {
  managers.forEach((m) => {
    if (m.exists(key)) (m.get(key) as Phaser.Textures.CanvasTexture).refresh();
  });
});

// Returns the texture name for this look, creating the texture and its walk
// animations the first time it is needed.
export function ensureAvatarTexture(scene: Phaser.Scene, avatar: Avatar): string {
  const key = avatarKey(avatar);
  managers.add(scene.textures);
  if (scene.textures.exists(key)) return key;

  const tex = scene.textures.addCanvas(key, composeAvatarSheet(avatar))!;
  for (let row = 0; row < DIRECTIONS.length; row++) {
    for (let col = 0; col < SHEET_COLS; col++) {
      tex.add(row * SHEET_COLS + col, 0, col * FRAME_SIZE, row * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE);
    }
  }

  for (const dir of DIRECTIONS) {
    const frames: Phaser.Types.Animations.AnimationFrame[] = [];
    for (let i = 1; i <= WALK_FRAMES; i++) frames.push({ key, frame: frameIndex(dir, i) });
    scene.anims.create({ key: key + ':walk-' + dir, frames, frameRate: WALK_FPS, repeat: -1 });
  }
  return key;
}

// Sets a character sprite up so its position is where its feet are.
export function setupCharacterSprite(sprite: Phaser.GameObjects.Sprite): void {
  sprite.setOrigin(0.5, FEET_Y / FRAME_SIZE);
}

// Shows the right animation for a character, given how it is moving this frame.
// Returns the direction it now faces.
export function animateCharacter(
  sprite: Phaser.GameObjects.Sprite,
  key: string,
  dx: number,
  dy: number,
  facing: Direction,
): Direction {
  const dir = directionFor(dx, dy, facing);
  if (dx === 0 && dy === 0) {
    sprite.anims.stop();
    sprite.setTexture(key, frameIndex(dir, 0));
  } else {
    sprite.anims.play(key + ':walk-' + dir, true);
  }
  return dir;
}
