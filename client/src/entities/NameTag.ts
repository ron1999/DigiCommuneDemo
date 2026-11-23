import Phaser from 'phaser';
import { HEAD_HEIGHT } from '../avatar/sprites';
import { UI_COLORS, UI_FONT, canNineSlice, uiTexture, whenUiFontReady } from '../ui/theme';

// Name sits just above the head; the chat bubble (and its tail) above the name
const NAME_GAP = 4;
const BUBBLE_GAP = 34;
const NAME_PAD_X = 5; // space between the name and the edge of its wooden plate
const NAME_PAD_Y = 2;
const BUBBLE_PAD = 6; // bubble.png has 6 px corners

// A name plate plus a temporary chat bubble that follows a player.
export class NameTag {
  private label: Phaser.GameObjects.Text;
  private plate: Phaser.GameObjects.NineSlice | null = null;
  private bubble: Phaser.GameObjects.Container | null = null;
  private hideTimer: Phaser.Time.TimerEvent | null = null;
  private x = 0;
  private y = 0;
  private headHeight = HEAD_HEIGHT;

  constructor(
    private scene: Phaser.Scene,
    name: string,
  ) {
    const hasPlate = canNineSlice(scene) && uiTexture(scene, 'ui-nametag');
    this.label = scene.add
      .text(0, 0, name, {
        fontFamily: UI_FONT,
        fontSize: '18px',
        color: UI_COLORS.cream,
        // Without the wooden plate (art not loaded yet) an outline keeps the name readable
        stroke: UI_COLORS.ink,
        strokeThickness: hasPlate ? 0 : 3,
        resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(10000);

    if (hasPlate) {
      this.plate = scene.add.nineslice(0, 0, 'ui-nametag', undefined, 12, 12, 4, 4, 4, 4).setOrigin(0.5, 1).setDepth(9999);
    }
    this.fitPlate();
    // Text drawn before the pixel font arrived keeps the fallback font: redraw it once it's here
    whenUiFontReady(() => {
      if (!this.label.active) return;
      this.label.setFontFamily(UI_FONT);
      this.fitPlate();
      this.follow(this.x, this.y);
    });
  }

  private fitPlate(): void {
    this.plate?.setSize(Math.ceil(this.label.width) + NAME_PAD_X * 2, Math.ceil(this.label.height) + NAME_PAD_Y * 2);
  }

  // Taller or shorter characters move the name up or down
  setHeadHeight(h: number): void {
    this.headHeight = h;
  }

  follow(x: number, y: number): void {
    this.x = x;
    this.y = y;
    const nameBottom = Math.round(y - this.headHeight - NAME_GAP);
    const px = Math.round(x);
    this.plate?.setPosition(px, nameBottom);
    this.label.setPosition(px, nameBottom - (this.plate ? NAME_PAD_Y : 0));
    this.bubble?.setPosition(px, Math.round(y - this.headHeight - BUBBLE_GAP));
  }

  say(text: string): void {
    this.bubble?.destroy();
    this.hideTimer?.remove();

    const s = this.scene;
    const fancy = canNineSlice(s) && uiTexture(s, 'ui-bubble') && uiTexture(s, 'ui-bubble-tail');
    const words = s.add
      .text(0, fancy ? -BUBBLE_PAD + 1 : 0, text, {
        fontFamily: UI_FONT,
        fontSize: '18px',
        color: fancy ? UI_COLORS.woodDark : '#111111',
        backgroundColor: fancy ? undefined : '#ffffffee',
        padding: fancy ? undefined : { x: 6, y: 4 },
        wordWrap: { width: 180 },
        align: 'center',
        lineSpacing: -2,
        resolution: 2,
      })
      .setOrigin(0.5, 1);

    const parts: Phaser.GameObjects.GameObject[] = [];
    if (fancy) {
      const w = Math.ceil(words.width) + BUBBLE_PAD * 2;
      const h = Math.ceil(words.height) + BUBBLE_PAD * 2 - 2;
      parts.push(s.add.nineslice(0, 0, 'ui-bubble', undefined, w, h, 6, 6, 6, 6).setOrigin(0.5, 1));
      // The tail's top row covers the bubble's bottom outline, so it opens into the bubble
      parts.push(s.add.image(0, -1, 'ui-bubble-tail').setOrigin(0.5, 0));
    }
    parts.push(words);

    this.bubble = s.add.container(0, 0, parts).setDepth(10001);
    this.follow(this.x, this.y);

    this.hideTimer = s.time.delayedCall(5000, () => {
      this.bubble?.destroy();
      this.bubble = null;
    });
  }

  destroy(): void {
    this.label.destroy();
    this.plate?.destroy();
    this.bubble?.destroy();
    this.hideTimer?.remove();
  }
}
