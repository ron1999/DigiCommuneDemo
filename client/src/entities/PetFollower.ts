import Phaser from 'phaser';
import { ensurePetTexture, petAnimKey, petStandFrame, petTextureKey, PET_ORIGIN_Y } from '../pets/petArt';
import type { PetDir } from '../pets/petArt';
import type { PetInfo } from '../pets/species';
import { UI_FONT } from '../ui/theme';

// How far behind its owner the pet walks (in pixels), and how quickly it catches up
const FOLLOW_DISTANCE = 52;
const CATCH_UP = 0.12;
const TELEPORT_DISTANCE = 400; // owner jumped (e.g. arrived in a new place): pet jumps too
const MOVING_STEP = 0.3; // px per frame below which the pet counts as standing still

// A pet that walks after its owner, using its species' sprite sheet (4 directions, walk cycle).
// Its position is where its feet are, like characters.
export class PetFollower {
  private sprite: Phaser.GameObjects.Sprite;
  private label: Phaser.GameObjects.Text;
  private species = -1;
  private ready = false; // the sheet has loaded
  private dir: PetDir = 'down';
  private walking = false;

  constructor(
    private scene: Phaser.Scene,
    pet: PetInfo,
    x: number,
    y: number,
  ) {
    this.sprite = scene.add.sprite(x, y, '__DEFAULT').setOrigin(0.5, PET_ORIGIN_Y).setVisible(false);
    this.label = scene.add
      .text(x, y, pet.name, {
        fontFamily: UI_FONT,
        fontSize: '16px',
        color: '#ffffff',
        stroke: '#1b110a',
        strokeThickness: 3,
        resolution: 2,
      })
      .setOrigin(0.5, 0)
      .setAlpha(0.85);
    this.setPet(pet);
  }

  setPet(pet: PetInfo): void {
    this.label.setText(pet.name);
    if (pet.species === this.species) return;
    this.species = pet.species;
    this.ready = false;
    this.sprite.setVisible(false);
    const species = pet.species;
    // (onReady may run right away, before ensurePetTexture returns, so don't use its result inside)
    ensurePetTexture(this.scene, species, () => {
      // Ignore a sheet that finished loading after the pet was switched or removed
      if (species !== this.species || !this.sprite.active) return;
      this.sprite.setTexture(petTextureKey(species));
      this.ready = true;
      this.walking = false;
      this.show();
      this.sprite.setVisible(true);
    });
  }

  // Shows the walk (or standing frame) for the current direction
  private show(): void {
    if (!this.ready) return;
    if (this.walking) this.sprite.play(petAnimKey(this.species, this.dir), true);
    else this.sprite.stop().setFrame(petStandFrame(this.dir));
  }

  // Call every frame with the owner's feet position
  update(ownerX: number, ownerY: number, _deltaMs: number): void {
    const dx = ownerX - this.sprite.x;
    const dy = ownerY - this.sprite.y;
    const dist = Math.hypot(dx, dy);

    let moving = false;
    let dir = this.dir;
    if (dist > TELEPORT_DISTANCE) {
      // Appear just behind the owner
      this.sprite.setPosition(ownerX - 40, ownerY + 8);
    } else if (dist > FOLLOW_DISTANCE) {
      const step = (dist - FOLLOW_DISTANCE) * CATCH_UP;
      this.sprite.x += (dx / dist) * step;
      this.sprite.y += (dy / dist) * step;
      moving = step > MOVING_STEP;
      if (moving) {
        // Prefer the axis it already faces, so walking diagonally doesn't flicker between rows
        const sideways = this.dir === 'left' || this.dir === 'right';
        const horizontal = Math.abs(dx) > Math.abs(dy) * (sideways ? 0.8 : 1.25);
        dir = horizontal ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
      }
    }
    if (moving !== this.walking || dir !== this.dir) {
      this.walking = moving;
      this.dir = dir;
      this.show();
    }

    this.sprite.setDepth(this.sprite.y);
    this.label.setPosition(this.sprite.x, this.sprite.y + 2).setDepth(this.sprite.y + 1);
  }

  destroy(): void {
    this.sprite.destroy();
    this.label.destroy();
  }
}
