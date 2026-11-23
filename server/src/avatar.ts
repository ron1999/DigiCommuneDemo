// IMPORTANT: these counts must match the option lists in client/src/avatar/avatar.ts
// and the items in supabase/009_body_types.sql.
export interface Avatar {
  preset: number; // 0 = custom (layers), 1+ = ready-made character
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
}

const LIMITS: Record<keyof Avatar, number> = {
  preset: 2, // Custom, Sprout
  gender: 2,
  build: 5,
  muscle: 2,
  height: 5,
  skin: 10,
  hairStyle: 11, // 10 styles + Bald
  hairColor: 8,
  top: 5,
  topColor: 12,
  bottom: 5,
  bottomColor: 12,
  onepiece: 2,
  onepieceColor: 12,
  shoes: 4,
  shoesColor: 12,
};

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
