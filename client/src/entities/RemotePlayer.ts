import Phaser from 'phaser';
import type { PlayerInfo } from '../net/network';
import { NameTag } from './NameTag';

// Another person's character. It glides smoothly toward the latest position
// the server told us about.
export class RemotePlayer {
  readonly tag: NameTag;
  private sprite: Phaser.GameObjects.Image;
  private targetX: number;
  private targetY: number;

  constructor(scene: Phaser.Scene, info: PlayerInfo) {
    this.sprite = scene.add.image(info.x, info.y, 'player');
    this.sprite.setTint(colorFromId(info.id));
    this.tag = new NameTag(scene, info.name);
    this.targetX = info.x;
    this.targetY = info.y;
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

// Gives each player a stable color tint (temporary until avatar customization).
function colorFromId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return Phaser.Display.Color.HSLToColor((hash % 360) / 360, 0.55, 0.75).color;
}
