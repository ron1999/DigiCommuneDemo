import Phaser from 'phaser';
import type { JoystickState } from './TownScene';

const JOY_RADIUS = 50;
const DEAD_ZONE = 0.15;

const TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'sans-serif',
  fontSize: '14px',
  color: '#ffffff',
  stroke: '#000000',
  strokeThickness: 3,
};

// Draws the on-screen overlay (title, status, hint, touch joystick).
// It runs as its own scene on top of the town so the camera zoom doesn't affect it.
export class UIScene extends Phaser.Scene {
  private joyPointer: Phaser.Input.Pointer | null = null;
  private origin = new Phaser.Math.Vector2();
  private base!: Phaser.GameObjects.Arc;
  private thumb!: Phaser.GameObjects.Arc;
  private hint!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;

  constructor() {
    super('UIScene');
  }

  create(): void {
    const joy = this.registry.get('joy') as JoystickState;
    const isTouch = this.sys.game.device.input.touch;

    this.add.text(10, 8, 'DigiCommune  |  prototype', TEXT_STYLE);

    // Connection status, top right
    this.status = this.add
      .text(this.scale.width - 10, 8, String(this.registry.get('status') ?? ''), TEXT_STYLE)
      .setOrigin(1, 0);
    this.registry.events.on('changedata-status', (_parent: unknown, _key: string, value: string) => {
      this.status.setText(value);
    });

    // Hint, top center
    this.hint = this.add
      .text(
        this.scale.width / 2,
        36,
        isTouch
          ? 'Drag on the left side to move  |  tap the box below to chat'
          : 'Move: WASD or arrows  |  Press Enter to chat',
        TEXT_STYLE,
      )
      .setOrigin(0.5, 0);

    this.scale.on('resize', (size: Phaser.Structs.Size) => {
      this.status.setPosition(size.width - 10, 8);
      this.hint.setPosition(size.width / 2, 36);
    });

    // Hint fades out after a few seconds
    this.tweens.add({
      targets: this.hint,
      alpha: 0,
      delay: 8000,
      duration: 800,
    });

    // Floating joystick: appears wherever the left side of the screen is touched
    this.base = this.add
      .circle(0, 0, JOY_RADIUS, 0xffffff, 0.15)
      .setStrokeStyle(2, 0xffffff, 0.4)
      .setVisible(false);
    this.thumb = this.add.circle(0, 0, 22, 0xffffff, 0.45).setVisible(false);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch || this.joyPointer) return;
      if (p.x > this.scale.width * 0.6) return;
      this.joyPointer = p;
      this.origin.set(p.x, p.y);
      this.base.setPosition(p.x, p.y).setVisible(true);
      this.thumb.setPosition(p.x, p.y).setVisible(true);
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p !== this.joyPointer) return;
      const dx = p.x - this.origin.x;
      const dy = p.y - this.origin.y;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(dist, JOY_RADIUS);
      const nx = dist > 0 ? dx / dist : 0;
      const ny = dist > 0 ? dy / dist : 0;

      this.thumb.setPosition(
        this.origin.x + nx * clamped,
        this.origin.y + ny * clamped,
      );

      const strength = clamped / JOY_RADIUS;
      if (strength < DEAD_ZONE) {
        joy.x = 0;
        joy.y = 0;
      } else {
        joy.x = nx * strength;
        joy.y = ny * strength;
      }
    });

    const release = (p: Phaser.Input.Pointer) => {
      if (p !== this.joyPointer) return;
      this.joyPointer = null;
      joy.x = 0;
      joy.y = 0;
      this.base.setVisible(false);
      this.thumb.setVisible(false);
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
  }
}
