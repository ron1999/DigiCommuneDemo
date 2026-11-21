// Avatar options and drawing. The look is described by a few numbers (an index into each
// list below), so it is tiny to save and send. The art is drawn from simple shapes for now;
// later we can replace drawAvatar with real layered sprite images.
//
// IMPORTANT: the option counts here must match server/src/avatar.ts.

export interface Avatar {
  skin: number;
  hairStyle: number;
  hairColor: number;
  outfitStyle: number;
  outfitColor: number;
  accessory: number;
}

export const AVATAR_W = 24;
export const AVATAR_H = 32;

export const SKIN_TONES = [0xf8d9b8, 0xf2c9a0, 0xd9a06f, 0xa86b43, 0x6b4228];
export const HAIR_STYLES = ['Short', 'Long', 'Spiky', 'Bald'];
export const HAIR_COLORS = [0x2b1b12, 0x5a3825, 0xb5651d, 0xe6c35c, 0xc0392b, 0x7d3c98, 0x2e86c1, 0xecf0f1];
export const OUTFIT_STYLES = ['T-shirt', 'Hoodie', 'Overalls'];
export const OUTFIT_COLORS = [0x3b6fd4, 0xd9534f, 0x4caf50, 0xf2c94c, 0x8e5ac8, 0xf0883e, 0x20b2aa, 0xff8fb1];
export const ACCESSORIES = ['None', 'Glasses', 'Cap', 'Headband'];

export const DEFAULT_AVATAR: Avatar = {
  skin: 1,
  hairStyle: 0,
  hairColor: 1,
  outfitStyle: 0,
  outfitColor: 0,
  accessory: 0,
};

export const AVATAR_LIMITS: Record<keyof Avatar, number> = {
  skin: SKIN_TONES.length,
  hairStyle: HAIR_STYLES.length,
  hairColor: HAIR_COLORS.length,
  outfitStyle: OUTFIT_STYLES.length,
  outfitColor: OUTFIT_COLORS.length,
  accessory: ACCESSORIES.length,
};

// What the wardrobe screen shows, in order
export interface Category {
  key: keyof Avatar;
  label: string;
  colors?: number[]; // shown as color swatches
  names?: string[]; // shown as text buttons
}

export const CATEGORIES: Category[] = [
  { key: 'skin', label: 'Skin', colors: SKIN_TONES },
  { key: 'hairStyle', label: 'Hair', names: HAIR_STYLES },
  { key: 'hairColor', label: 'Hair color', colors: HAIR_COLORS },
  { key: 'outfitStyle', label: 'Outfit', names: OUTFIT_STYLES },
  { key: 'outfitColor', label: 'Outfit color', colors: OUTFIT_COLORS },
  { key: 'accessory', label: 'Accessory', names: ACCESSORIES },
];

// Turns anything (such as an empty database value) into a valid avatar.
export function sanitizeAvatar(raw: unknown): Avatar {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Avatar = { ...DEFAULT_AVATAR };
  (Object.keys(AVATAR_LIMITS) as (keyof Avatar)[]).forEach((k) => {
    const v = src[k];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < AVATAR_LIMITS[k]) {
      out[k] = v;
    }
  });
  return out;
}

// True for an account that has never chosen a look (empty avatar in the database)
export function isEmptyAvatar(raw: unknown): boolean {
  return !raw || typeof raw !== 'object' || Object.keys(raw as object).length === 0;
}

export function avatarKey(a: Avatar): string {
  return (
    'avatar_' + [a.skin, a.hairStyle, a.hairColor, a.outfitStyle, a.outfitColor, a.accessory].join('_')
  );
}

// Drawing is done through this tiny interface so the same code can paint into the
// game (Phaser) and into the wardrobe preview (an HTML canvas).
export interface Painter {
  rect(x: number, y: number, w: number, h: number, color: number): void;
  circle(x: number, y: number, r: number, color: number): void;
}

export function canvasPainter(ctx: CanvasRenderingContext2D): Painter {
  const css = (c: number) => '#' + c.toString(16).padStart(6, '0');
  return {
    rect(x, y, w, h, color) {
      ctx.fillStyle = css(color);
      ctx.fillRect(x, y, w, h);
    },
    circle(x, y, r, color) {
      ctx.fillStyle = css(color);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    },
  };
}

function shade(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 255) * factor);
  const g = Math.round(((color >> 8) & 255) * factor);
  const b = Math.round((color & 255) * factor);
  return (r << 16) | (g << 8) | b;
}

// Draws the character in a 24 x 32 box, back to front.
export function drawAvatar(p: Painter, a: Avatar): void {
  const skin = SKIN_TONES[a.skin];
  const hair = HAIR_COLORS[a.hairColor];
  const oc = OUTFIT_COLORS[a.outfitColor];
  const pants = 0x2a2a55;

  // Legs and shoes
  p.rect(6, 26, 5, 4, pants);
  p.rect(13, 26, 5, 4, pants);
  p.rect(5, 30, 6, 2, 0x222222);
  p.rect(13, 30, 6, 2, 0x222222);

  // Outfit
  if (a.outfitStyle === 0) {
    // T-shirt
    p.rect(5, 14, 14, 13, oc);
    p.rect(3, 14, 3, 5, oc);
    p.rect(18, 14, 3, 5, oc);
    p.rect(3, 19, 3, 5, skin);
    p.rect(18, 19, 3, 5, skin);
  } else if (a.outfitStyle === 1) {
    // Hoodie
    p.rect(5, 14, 14, 13, oc);
    p.rect(3, 14, 3, 11, oc);
    p.rect(18, 14, 3, 11, oc);
    p.rect(3, 25, 3, 2, skin);
    p.rect(18, 25, 3, 2, skin);
    p.rect(7, 13, 10, 3, shade(oc, 0.8));
    p.rect(8, 22, 8, 1, shade(oc, 0.75));
    p.rect(10, 16, 1, 4, 0xeeeeee);
    p.rect(13, 16, 1, 4, 0xeeeeee);
  } else {
    // Overalls
    const shirt = 0xf4f4f4;
    p.rect(5, 14, 14, 13, shirt);
    p.rect(3, 14, 3, 6, shirt);
    p.rect(18, 14, 3, 6, shirt);
    p.rect(3, 20, 3, 4, skin);
    p.rect(18, 20, 3, 4, skin);
    p.rect(6, 20, 12, 7, oc);
    p.rect(7, 14, 2, 6, oc);
    p.rect(15, 14, 2, 6, oc);
    p.rect(7, 19, 2, 2, 0xf2c94c);
    p.rect(15, 19, 2, 2, 0xf2c94c);
  }

  // Head and eyes
  p.circle(12, 9, 7, skin);
  p.rect(8, 9, 2, 2, 0x222222);
  p.rect(14, 9, 2, 2, 0x222222);

  // Hair
  if (a.hairStyle === 0) {
    p.rect(5, 1, 14, 5, hair);
    p.rect(5, 4, 2, 4, hair);
    p.rect(17, 4, 2, 4, hair);
  } else if (a.hairStyle === 1) {
    p.rect(5, 1, 14, 5, hair);
    p.rect(4, 3, 3, 15, hair);
    p.rect(17, 3, 3, 15, hair);
  } else if (a.hairStyle === 2) {
    p.rect(5, 3, 14, 3, hair);
    p.rect(5, 1, 3, 3, hair);
    p.rect(9, 0, 3, 4, hair);
    p.rect(13, 0, 3, 4, hair);
    p.rect(17, 1, 2, 3, hair);
    p.rect(5, 4, 2, 3, hair);
    p.rect(17, 4, 2, 3, hair);
  }

  // Accessory
  if (a.accessory === 1) {
    p.rect(6, 8, 5, 4, 0x222222);
    p.rect(13, 8, 5, 4, 0x222222);
    p.rect(7, 9, 3, 2, 0xcfe8ff);
    p.rect(14, 9, 3, 2, 0xcfe8ff);
    p.rect(11, 9, 2, 1, 0x222222);
  } else if (a.accessory === 2) {
    p.rect(5, 0, 14, 6, oc);
    p.rect(4, 5, 16, 2, shade(oc, 0.8));
  } else if (a.accessory === 3) {
    p.rect(5, 3, 14, 2, oc);
  }
}
