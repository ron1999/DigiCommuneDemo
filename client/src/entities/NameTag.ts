import Phaser from 'phaser';
import { HEAD_HEIGHT } from '../avatar/sprites';

// Name sits just above the head; the chat bubble above the name
const NAME_Y = HEAD_HEIGHT + 4;
const BUBBLE_Y = HEAD_HEIGHT + 24;

// A name label plus a temporary chat bubble that follows a player.
export class NameTag {
  private label: Phaser.GameObjects.Text;
  private bubble: Phaser.GameObjects.Text | null = null;
  private hideTimer: Phaser.Time.TimerEvent | null = null;
  private x = 0;
  private y = 0;

  constructor(
    private scene: Phaser.Scene,
    name: string,
  ) {
    this.label = scene.add
      .text(0, 0, name, {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
        resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(10000);
  }

  follow(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.label.setPosition(x, y - NAME_Y);
    this.bubble?.setPosition(x, y - BUBBLE_Y);
  }

  say(text: string): void {
    this.bubble?.destroy();
    this.hideTimer?.remove();

    this.bubble = this.scene.add
      .text(this.x, this.y - BUBBLE_Y, text, {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#111111',
        backgroundColor: '#ffffffee',
        padding: { x: 6, y: 4 },
        wordWrap: { width: 180 },
        resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(10001);

    this.hideTimer = this.scene.time.delayedCall(5000, () => {
      this.bubble?.destroy();
      this.bubble = null;
    });
  }

  destroy(): void {
    this.label.destroy();
    this.bubble?.destroy();
    this.hideTimer?.remove();
  }
}
