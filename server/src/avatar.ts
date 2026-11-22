// IMPORTANT: these counts must match the option lists in client/src/avatar/avatar.ts.
export interface Avatar {
  preset: number; // 0 = custom (layers), 1+ = ready-made character
  skin: number;
  hairStyle: number;
  hairColor: number;
  outfitStyle: number;
  outfitColor: number;
  accessory: number;
}

const LIMITS: Record<keyof Avatar, number> = {
  preset: 2, // Custom, Sprout (Fern comes back later as 2)
  skin: 5,
  hairStyle: 4,
  hairColor: 8,
  outfitStyle: 3,
  outfitColor: 8,
  accessory: 4,
};

export const DEFAULT_AVATAR: Avatar = {
  preset: 0,
  skin: 1,
  hairStyle: 0,
  hairColor: 1,
  outfitStyle: 0,
  outfitColor: 0,
  accessory: 0,
};

// Never trust what a client sends: keep only whole numbers inside the allowed ranges.
export function sanitizeAvatar(raw: unknown): Avatar {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Avatar = { ...DEFAULT_AVATAR };
  (Object.keys(LIMITS) as (keyof Avatar)[]).forEach((k) => {
    const v = src[k];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < LIMITS[k]) {
      out[k] = v;
    }
  });
  return out;
}
