import Phaser from 'phaser';
import { AVATAR_H, AVATAR_W, avatarKey, drawAvatar } from './avatar';
import type { Avatar, Painter } from './avatar';

// Returns the texture name for this look, creating the texture the first time it is needed.
export function ensureAvatarTexture(scene: Phaser.Scene, avatar: Avatar): string {
  const key = avatarKey(avatar);
  if (scene.textures.exists(key)) return key;

  const g = scene.make.graphics({}, false);
  const painter: Painter = {
    rect(x, y, w, h, color) {
      g.fillStyle(color, 1).fillRect(x, y, w, h);
    },
    circle(x, y, r, color) {
      g.fillStyle(color, 1).fillCircle(x, y, r);
    },
  };
  drawAvatar(painter, avatar);
  g.generateTexture(key, AVATAR_W, AVATAR_H);
  g.destroy();
  return key;
}
