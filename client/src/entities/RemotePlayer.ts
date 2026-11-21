import Phaser from 'phaser';
import type { PlayerInfo } from '../net/network';
import { sanitizeAvatar } from '../avatar/avatar';
import type { Avatar } from '../avatar/avatar';
import { animateCharacter, ensureAvatarTexture, setupCharacterSprite } from '../avatar/textures';
import type { Direction } from '../avatar/sprites';
import { NameTag } from './NameTag';

// Closer than this (in pixels) to the latest position counts as standing still
const STILL_DISTANCE = 1.5;

// Another person's character. It glides smoothly toward the latest position
// the server told us about, walking in the direction it is moving.
export class RemotePlayer {
  readonly tag: NameTag;
  private sprite: Phaser.GameObjects.Sprite;
  private key: string;
  private facing: Direction = 'down';
  private targetX: number;
  private targetY: number;

  constructor(
    private scene: Phaser.Scene,
    info: PlayerInfo,
  ) {
    this.key = ensureAvatarTexture(scene, sanitizeAvatar(info.avatar));
    this.sprite = scene.add.sprite(info.x, info.y, this.key, 0);
    setupCharacterSprite(this.sprite);
    this.tag = new NameTag(scene, info.name);
    this.targetX = info.x;
    this.targetY = info.y;
  }

  setAvatar(avatar: Avatar): void {
    this.key = ensureAvatarTexture(this.scene, sanitizeAvatar(avatar));
  }

  setTarget(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
  }

  update(): void {
    let dx = this.targetX - this.sprite.x;
    let dy = this.targetY - this.sprite.y;
    if (Math.hypot(dx, dy) < STILL_DISTANCE) {
      this.sprite.setPosition(this.targetX, this.targetY);
      dx = 0;
      dy = 0;
    } else {
      this.sprite.x = Phaser.Math.Linear(this.sprite.x, this.targetX, 0.25);
      this.sprite.y = Phaser.Math.Linear(this.sprite.y, this.targetY, 0.25);
    }
    this.facing = animateCharacter(this.sprite, this.key, dx, dy, this.facing);
    this.sprite.setDepth(this.sprite.y);
    this.tag.follow(this.sprite.x, this.sprite.y);
  }

  destroy(): void {
    this.sprite.destroy();
    this.tag.destroy();
  }
}
