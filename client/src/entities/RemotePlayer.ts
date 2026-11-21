import Phaser from 'phaser';
import type { PlayerInfo } from '../net/network';
import { sanitizeAvatar } from '../avatar/avatar';
import type { Avatar } from '../avatar/avatar';
import { ensureAvatarTexture } from '../avatar/textures';
import { NameTag } from './NameTag';

// Another person's character. It glides smoothly toward the latest position
// the server told us about.
export class RemotePlayer {
  readonly tag: NameTag;
  private sprite: Phaser.GameObjects.Image;
  private targetX: number;
  private targetY: number;

  constructor(
    private scene: Phaser.Scene,
    info: PlayerInfo,
  ) {
    this.sprite = scene.add.image(
      info.x,
      info.y,
      ensureAvatarTexture(scene, sanitizeAvatar(info.avatar)),
    );
    this.tag = new NameTag(scene, info.name);
    this.targetX = info.x;
    this.targetY = info.y;
  }

  setAvatar(avatar: Avatar): void {
    this.sprite.setTexture(ensureAvatarTexture(this.scene, sanitizeAvatar(avatar)));
  }

  setTarget(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
  }

  update(): void {
    this.sprite.x = Phaser.Math.Linear(this.sprite.x, this.targetX, 0.25);
    this.sprite.y = Phaser.Math.Linear(this.sprite.y, this.targetY, 0.25);
    this.sprite.setDepth(this.sprite.y);
    this.tag.follow(this.sprite.x, this.sprite.y);
  }

  destroy(): void {
    this.sprite.destroy();
    this.tag.destroy();
  }
}
