import Phaser from 'phaser';
import type { PlayerInfo } from '../net/network';
import { sanitizeAvatar } from '../avatar/avatar';
import type { Avatar } from '../avatar/avatar';
import { animateCharacter, ensureAvatarTexture, setupCharacterSprite } from '../avatar/textures';
import { headHeightFor } from '../avatar/sprites';
import type { Direction } from '../avatar/sprites';
import { NameTag } from './NameTag';
import { PetFollower } from './PetFollower';
import { sanitizePet } from '../pets/species';

// Closer than this (in pixels) to the latest position counts as standing still
const STILL_DISTANCE = 1.5;

// Another person's character. It glides smoothly toward the latest position
// the server told us about, walking in the direction it is moving.
export class RemotePlayer {
  readonly tag: NameTag;
  readonly name: string;
  private sprite: Phaser.GameObjects.Sprite;
  private key: string;
  private facing: Direction = 'down';
  private targetX: number;
  private targetY: number;
  private pet: PetFollower | null = null;

  constructor(
    private scene: Phaser.Scene,
    info: PlayerInfo,
  ) {
    this.key = ensureAvatarTexture(scene, sanitizeAvatar(info.avatar));
    this.sprite = scene.add.sprite(info.x, info.y, this.key, 0);
    setupCharacterSprite(this.sprite);
    this.name = info.name;
    this.tag = new NameTag(scene, info.name);
    this.tag.setHeadHeight(headHeightFor(sanitizeAvatar(info.avatar)));
    this.targetX = info.x;
    this.targetY = info.y;
    this.setPet(info.pet);
  }

  // Show, change, or remove the pet following this player
  setPet(raw: unknown): void {
    const pet = sanitizePet(raw);
    if (!pet) {
      this.pet?.destroy();
      this.pet = null;
    } else if (this.pet) {
      this.pet.setPet(pet);
    } else {
      this.pet = new PetFollower(this.scene, pet, this.sprite.x - 40, this.sprite.y + 8);
    }
  }

  setAvatar(avatar: Avatar): void {
    const a = sanitizeAvatar(avatar);
    this.key = ensureAvatarTexture(this.scene, a);
    this.tag.setHeadHeight(headHeightFor(a));
  }

  setTarget(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
  }

  update(deltaMs: number): void {
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
    this.pet?.update(this.sprite.x, this.sprite.y, deltaMs);
  }

  destroy(): void {
    this.sprite.destroy();
    this.tag.destroy();
    this.pet?.destroy();
  }
}
