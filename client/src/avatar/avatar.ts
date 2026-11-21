// Avatar options and drawing. The look is described by a few numbers (an index into each
// list below), so it is tiny to save and send. The art is layered sprite sheets:
// see sprites.ts and docs/ART_SPEC.md.
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
