// Avatar options. The look is described by a few small numbers (an index into each list
// below), so it is tiny to save and send. The art is layered sprite sheets: see sprites.ts
// and docs/ART_SPEC.md ("Body types", "Starter wardrobe").
//
// IMPORTANT: keep these lists in sync with LIMITS in server/src/avatar.ts and the items
// in supabase/009_body_types.sql (one item per option, same order).

export interface Avatar {
  preset: number; // 0 = build your own (everything below); 1+ = a ready-made character
  gender: number;
  build: number;
  muscle: number;
  height: number;
  skin: number;
  hairStyle: number;
  hairColor: number;
  top: number;
  topColor: number;
  bottom: number;
  bottomColor: number;
  onepiece: number;
  onepieceColor: number;
  shoes: number;
  shoesColor: number;
  hat: number;
  hatColor: number;
  glasses: number;
  glassesColor: number;
  band: number;
  bandColor: number;
  neck: number;
  neckColor: number;
  face: number; // several at once: bit i set = FACE_ITEMS[i] is worn
  faceColor: number;
}

// Ready-made characters (complete sprite sheets in client/public/sprites/presets/<file>.png).
export const PRESETS = ['Custom', 'Sprout'];
export const PRESET_FILES = ['', 'sprout'];

// Body files are sprites/bodies/<gender>-<build>[-muscular].png
export const GENDERS = ['Male', 'Female'];
export const GENDER_FILES = ['male', 'female'];
export const BUILDS = ['Slim', 'Lean', 'Average', 'Stocky', 'Heavyset'];
export const BUILD_FILES = ['slim', 'lean', 'average', 'stocky', 'heavyset'];
export const MUSCLES = ['Soft', 'Muscular'];
// Pixels added to (or removed from) the average height
export const HEIGHTS = ['Shortest', 'Short', 'Average', 'Tall', 'Tallest'];
export const HEIGHT_PX = [-12, -6, 0, 6, 12];

// Skin tones are separate pre-colored sheets (a palette swap, not a tint).
// Same order as client/public/sprites/bodies/skins/skins.json. dir '' = the original sheets.
export const SKIN_NAMES = ['Porcelain', 'Fair', 'Sunset', 'Golden', 'Olive', 'Tan', 'Brown', 'Umber', 'Deep', 'Ebony'];
export const SKIN_DIRS = ['skins/porcelain/', 'skins/fair/', '', 'skins/golden/', 'skins/olive/', 'skins/tan/', 'skins/brown/', 'skins/umber/', 'skins/deep/', 'skins/ebony/'];
export const SKIN_TONES = [0xfce3d6, 0xfbd5b6, 0xf7b37d, 0xf2cb88, 0xecc99b, 0xe7b881, 0xd4a576, 0xc28a6a, 0xa5725b, 0x90665a];

// Hair files are sprites/head/<file>/<body>.png. '' = Bald (no layer).
export const HAIR_STYLES = ['Messy', 'Bob', 'Buzz', 'Long', 'Curls', 'Ponytail', 'Buns', 'Undercut', 'Locs', 'Spiky', 'Bald'];
export const HAIR_FILES = ['hair-messy', 'hair-bob', 'hair-buzz', 'hair-long', 'hair-curls', 'hair-ponytail', 'hair-buns', 'hair-undercut', 'hair-locs', 'hair-spiky', ''];
export const HAIR_COLORS = [0x2b1b12, 0x5a3825, 0xb5651d, 0xe6c35c, 0xc0392b, 0x7d3c98, 0x2e86c1, 0xecf0f1];

// Clothing files are sprites/clothing/<file>/<body>.png. '' = nothing in that slot.
export const TOPS = ['Tank top', 'Tee', 'Hoodie', 'Flannel', 'Sweater'];
export const TOP_FILES = ['', 'top-tee', 'top-hoodie', 'top-flannel', 'top-sweater'];
export const BOTTOMS = ['Shorts', 'Jeans', 'Cargo', 'Skirt', 'Trousers'];
export const BOTTOM_FILES = ['', 'bottom-jeans', 'bottom-cargo', 'bottom-skirt', 'bottom-trousers'];
export const ONEPIECES = ['None', 'Overalls']; // worn over the top, replaces the bottom
export const ONEPIECE_FILES = ['', 'onepiece-overalls'];
export const SHOES = ['Barefoot', 'Sneakers', 'Boots', 'Sandals'];
export const SHOE_FILES = ['', 'shoes-sneakers', 'shoes-boots', 'shoes-sandals'];
// Accessories (sprites/head/<file>/<body>.png, see sprites/head/items.json). '' = none.
// Hats hide the hair under them using sprites/head/<file>/mask/<body>.png.
export const HATS = ['None', 'Beanie', 'Cap', 'Sun hat', 'Bucket hat', 'Mushroom hat'];
export const HAT_FILES = ['', 'hat-beanie', 'hat-cap', 'hat-sunhat', 'hat-bucket', 'hat-mushroom'];
export const GLASSES = ['None', 'Round', 'Square', 'Sunglasses'];
export const GLASSES_FILES = ['', 'glasses-round', 'glasses-square', 'glasses-sun'];
export const BANDS = ['None', 'Bandana'];
export const BAND_FILES = ['', 'band-bandana'];
export const NECKS = ['None', 'Neck bandana'];
export const NECK_FILES = ['', 'neck-bandana'];
export const FACE_ITEMS = ['Ear hoops', 'Nose ring', 'Lip ring', 'Brow bar', 'Leaf tattoo'];
export const FACE_FILES = ['face-ear-hoops', 'face-nose-ring', 'face-lip-ring', 'face-brow-bar', 'face-tattoo-leaf'];
// Hair that is not drawn at all under a hat (items.json "underHat": "tuck")
export const HAIR_TUCKED_UNDER_HAT = ['hair-curls'];

export const CLOTH_COLORS = [
  0x3b6fd4, 0xd9534f, 0x4caf50, 0xf2c94c, 0x8e5ac8, 0xf0883e,
  0x20b2aa, 0xff8fb1, 0x2d3047, 0xf4f1e8, 0x8b5a2b, 0x6b7f3a,
];

export const DEFAULT_AVATAR: Avatar = {
  preset: 0,
  gender: 0,
  build: 2,
  muscle: 0,
  height: 2,
  skin: 2,
  hairStyle: 0,
  hairColor: 1,
  top: 1,
  topColor: 0,
  bottom: 1,
  bottomColor: 8,
  onepiece: 0,
  onepieceColor: 11,
  shoes: 1,
  shoesColor: 1,
  hat: 0,
  hatColor: 1,
  glasses: 0,
  glassesColor: 8,
  band: 0,
  bandColor: 1,
  neck: 0,
  neckColor: 1,
  face: 0,
  faceColor: 9,
};

export const AVATAR_LIMITS: Record<keyof Avatar, number> = {
  preset: PRESETS.length,
  gender: GENDERS.length,
  build: BUILDS.length,
  muscle: MUSCLES.length,
  height: HEIGHTS.length,
  skin: SKIN_TONES.length,
  hairStyle: HAIR_STYLES.length,
  hairColor: HAIR_COLORS.length,
  top: TOPS.length,
  topColor: CLOTH_COLORS.length,
  bottom: BOTTOMS.length,
  bottomColor: CLOTH_COLORS.length,
  onepiece: ONEPIECES.length,
  onepieceColor: CLOTH_COLORS.length,
  shoes: SHOES.length,
  shoesColor: CLOTH_COLORS.length,
  hat: HATS.length,
  hatColor: CLOTH_COLORS.length,
  glasses: GLASSES.length,
  glassesColor: CLOTH_COLORS.length,
  band: BANDS.length,
  bandColor: CLOTH_COLORS.length,
  neck: NECKS.length,
  neckColor: CLOTH_COLORS.length,
  face: 1 << FACE_ITEMS.length, // any combination
  faceColor: CLOTH_COLORS.length,
};

export const AVATAR_KEYS = Object.keys(AVATAR_LIMITS) as (keyof Avatar)[];

// What the wardrobe screen shows, in order
export interface Category {
  key: keyof Avatar;
  label: string;
  colors?: number[]; // shown as color swatches
  names?: string[]; // shown as text buttons
  multi?: boolean; // several can be picked: the value is a bit per option
  group: 'Character' | 'Body' | 'Hair' | 'Clothes' | 'Extras';
  // Only shown when this returns true (e.g. a color for a slot that has something in it)
  when?: (a: Avatar) => boolean;
}

const custom = (a: Avatar) => a.preset === 0;

export const CATEGORIES: Category[] = [
  { key: 'preset', label: 'Character', names: PRESETS, group: 'Character' },
  { key: 'gender', label: 'Body', names: GENDERS, group: 'Body', when: custom },
  { key: 'build', label: 'Build', names: BUILDS, group: 'Body', when: custom },
  { key: 'muscle', label: 'Muscle', names: MUSCLES, group: 'Body', when: custom },
  { key: 'height', label: 'Height', names: HEIGHTS, group: 'Body', when: custom },
  { key: 'skin', label: 'Skin', colors: SKIN_TONES, group: 'Body', when: custom },
  { key: 'hairStyle', label: 'Hair', names: HAIR_STYLES, group: 'Hair', when: custom },
  { key: 'hairColor', label: 'Hair color', colors: HAIR_COLORS, group: 'Hair', when: (a) => custom(a) && HAIR_FILES[a.hairStyle] !== '' },
  { key: 'top', label: 'Top', names: TOPS, group: 'Clothes', when: custom },
  { key: 'topColor', label: 'Top color', colors: CLOTH_COLORS, group: 'Clothes', when: (a) => custom(a) && a.top > 0 },
  { key: 'bottom', label: 'Bottom', names: BOTTOMS, group: 'Clothes', when: (a) => custom(a) && a.onepiece === 0 },
  { key: 'bottomColor', label: 'Bottom color', colors: CLOTH_COLORS, group: 'Clothes', when: (a) => custom(a) && a.onepiece === 0 && a.bottom > 0 },
  { key: 'onepiece', label: 'Overalls', names: ONEPIECES, group: 'Clothes', when: custom },
  { key: 'onepieceColor', label: 'Overalls color', colors: CLOTH_COLORS, group: 'Clothes', when: (a) => custom(a) && a.onepiece > 0 },
  { key: 'shoes', label: 'Shoes', names: SHOES, group: 'Clothes', when: custom },
  { key: 'shoesColor', label: 'Shoes color', colors: CLOTH_COLORS, group: 'Clothes', when: (a) => custom(a) && a.shoes > 0 },
  { key: 'hat', label: 'Hat', names: HATS, group: 'Extras', when: custom },
  { key: 'hatColor', label: 'Hat color', colors: CLOTH_COLORS, group: 'Extras', when: (a) => custom(a) && a.hat > 0 },
  { key: 'glasses', label: 'Glasses', names: GLASSES, group: 'Extras', when: custom },
  { key: 'glassesColor', label: 'Glasses color', colors: CLOTH_COLORS, group: 'Extras', when: (a) => custom(a) && a.glasses > 0 },
  { key: 'band', label: 'Headband', names: BANDS, group: 'Extras', when: custom },
  { key: 'bandColor', label: 'Headband color', colors: CLOTH_COLORS, group: 'Extras', when: (a) => custom(a) && a.band > 0 },
  { key: 'neck', label: 'Neck', names: NECKS, group: 'Extras', when: custom },
  { key: 'neckColor', label: 'Neck color', colors: CLOTH_COLORS, group: 'Extras', when: (a) => custom(a) && a.neck > 0 },
  { key: 'face', label: 'Piercings & tattoos (pick any)', names: FACE_ITEMS, multi: true, group: 'Extras', when: custom },
  { key: 'faceColor', label: 'Piercing & tattoo color', colors: CLOTH_COLORS, group: 'Extras', when: (a) => custom(a) && a.face > 0 },
];

// Turns anything (such as an empty or old-format database value) into a valid avatar.
export function sanitizeAvatar(raw: unknown): Avatar {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Avatar = { ...DEFAULT_AVATAR };
  for (const k of AVATAR_KEYS) {
    const v = src[k];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < AVATAR_LIMITS[k]) {
      out[k] = v;
    }
  }
  return out;
}

// True for an account that has never chosen a look (empty avatar in the database)
export function isEmptyAvatar(raw: unknown): boolean {
  return !raw || typeof raw !== 'object' || Object.keys(raw as object).length === 0;
}

export function avatarKey(a: Avatar): string {
  return 'avatar_' + AVATAR_KEYS.map((k) => a[k]).join('_');
}

// The body sheet name shared by every layer file, e.g. "female-stocky-muscular"
export function bodyName(a: Avatar): string {
  return GENDER_FILES[a.gender] + '-' + BUILD_FILES[a.build] + (a.muscle ? '-muscular' : '');
}
