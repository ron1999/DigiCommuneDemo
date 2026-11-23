import Phaser from 'phaser';

// Shared look for things the game draws itself (name tags, chat bubbles, joystick).
// The HTML panels get the same look from the CSS in index.html. Art: client/public/ui/.

export const UI_FONT = '"Jersey 15", "Trebuchet MS", sans-serif';
export const UI_COLORS = {
  ink: '#1b110a',
  cream: '#fff4d6',
  woodDark: '#4a2e1c',
};

// Small images the game needs. They load as plain <img> tags as soon as this file is imported
// (long before the town starts), and get handed to Phaser the first time a scene asks.
const IMAGES = {
  'ui-bubble': '/ui/bubble.png', // 16x16, 6 px corners
  'ui-bubble-tail': '/ui/bubble-tail.png', // 7x5
  'ui-nametag': '/ui/nametag.png', // 12x12, 4 px corners
  'ui-joy-ring': '/ui/joy-ring.png', // 100x100
  'ui-joy-knob': '/ui/round.png', // 45x45
} as const;
export type UiImage = keyof typeof IMAGES;

const loaded = new Map<UiImage, HTMLImageElement>();
for (const [key, src] of Object.entries(IMAGES) as [UiImage, string][]) {
  const img = new Image();
  img.onload = () => loaded.set(key, img);
  img.src = src;
}

// Phaser's NineSlice (stretchy frames) only draws with WebGL. Old phones that fall back to the
// Canvas renderer get the plain look instead.
export function canNineSlice(scene: Phaser.Scene): boolean {
  return scene.sys.game.config.renderType === Phaser.WEBGL;
}

// True when the image is ready as a Phaser texture in this game (adds it the first time).
export function uiTexture(scene: Phaser.Scene, key: UiImage): boolean {
  if (scene.textures.exists(key)) return true;
  const img = loaded.get(key);
  if (!img) return false;
  scene.textures.addImage(key, img);
  return true;
}

// Phaser draws text once, so text made before the font arrives would keep the fallback font.
// Calls back now if the font is ready, or once it has loaded.
export function whenUiFontReady(cb: () => void): void {
  const fonts = document.fonts;
  if (!fonts || fonts.check('16px "Jersey 15"')) {
    cb();
    return;
  }
  fonts.load('16px "Jersey 15"').then(cb, () => {});
}
