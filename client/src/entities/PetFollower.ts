import Phaser from 'phaser';
import { ensurePetTexture } from '../pets/petArt';
import type { PetInfo } from '../pets/species';

// How far behind its owner the pet walks (in pixels), and how quickly it catches up
const FOLLOW_DISTANCE = 56;
const CATCH_UP = 0.12;
const TELEPORT_DISTANCE = 400; // owner jumped (e.g. arrived in a new place): pet jumps too

// A pet that trots after its owner, bobbing as it walks.
// Its position is where its feet are, like characters.
export class PetFollower {
  private sprite: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private bobTime = 0;

  constructor(
    private scene: Phaser.Scene,
    pet: PetInfo,
    x: number,
    y: number,
  ) {
    this.sprite = scene.add.image(x, y, ensurePetTexture(scene, pet.species)).setOrigin(0.5, 0.95);
    this.label = scene.add
      .text(x, y, pet.name, {
        fontFamily: 'sans-serif',
        fontSize: '11px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
        resolution: 2,
      })
      .setOrigin(0.5, 0)
      .setAlpha(0.85);
  }

  setPet(pet: PetInfo): void {
    this.sprite.setTexture(ensurePetTexture(this.scene, pet.species));
    this.label.setText(pet.name);
  }

  // Call every frame with the owner's feet position
  update(ownerX: number, ownerY: number, deltaMs: number): void {
    const dx = ownerX - this.sprite.x;
    const dy = ownerY - this.sprite.y;
    const dist = Math.hypot(dx, dy);

    let moving = false;
    if (dist > TELEPORT_DISTANCE) {
      // Appear just behind the owner
      this.sprite.setPosition(ownerX - 40, ownerY + 8);
    } else if (dist > FOLLOW_DISTANCE) {
      const step = (dist - FOLLOW_DISTANCE) * CATCH_UP;
      this.sprite.x += (dx / dist) * step;
      this.sprite.y += (dy / dist) * step;
      moving = step > 0.3;
      if (Math.abs(dx) > 2) this.sprite.setFlipX(dx > 0);
    }

    // Hop while moving, gentle breathing while still
    this.bobTime += deltaMs;
    const bob = moving ? -Math.abs(Math.sin(this.bobTime / 90)) * 6 : Math.sin(this.bobTime / 400) * 1;
    this.sprite.setDisplayOrigin(this.sprite.width / 2, this.sprite.height * 0.95 - bob);
    this.sprite.setDepth(this.sprite.y);
    this.label.setPosition(this.sprite.x, this.sprite.y + 2).setDepth(this.sprite.y + 1);
  }

  destroy(): void {
    this.sprite.destroy();
    this.label.destroy();
  }
}
