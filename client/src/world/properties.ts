// The claimable places in town: the four buildings and the empty lots.
//
// IMPORTANT: keep in sync with supabase/008_shops_homes.sql (properties rows: same ids and kinds)
// and MAX_PROPERTY_ID in server/src/TownRoom.ts.
//
// Positions are in tiles. The door is where you walk in (for a lot: where its sign stands).
// doorOnTop: the door is in the top wall (a path leads up to the main road); otherwise the bottom wall.
// walkway (optional): extra corners of the footpath from the tile in front of the door to the road,
// joined by straight lines. Without it the path runs straight from the door to the main road.
// Places south of the road have their door in the FRONT (bottom) wall, so it faces the camera, and a
// walkway that runs along the front and up the side of the building to the road.

export type PropertyKind = 'building' | 'lot';

export interface PropertySpot {
  id: number;
  kind: PropertyKind;
  x: number;
  y: number;
  w: number;
  h: number;
  door: { x: number; y: number };
  doorOnTop: boolean;
  walkway?: { x: number; y: number }[];
}

export const PROPERTIES: PropertySpot[] = [
  { id: 0, kind: 'building', x: 4, y: 3, w: 6, h: 5, door: { x: 7, y: 7 }, doorOnTop: false },
  { id: 1, kind: 'building', x: 13, y: 3, w: 5, h: 5, door: { x: 15, y: 7 }, doorOnTop: false },
  { id: 2, kind: 'building', x: 5, y: 19, w: 6, h: 5, door: { x: 8, y: 23 }, doorOnTop: false, walkway: [{ x: 4, y: 24 }, { x: 4, y: 16 }] },
  { id: 3, kind: 'building', x: 26, y: 19, w: 7, h: 5, door: { x: 29, y: 23 }, doorOnTop: false, walkway: [{ x: 25, y: 24 }, { x: 25, y: 16 }] },
  { id: 4, kind: 'lot', x: 13, y: 19, w: 5, h: 5, door: { x: 15, y: 23 }, doorOnTop: false, walkway: [{ x: 18, y: 24 }] },
  { id: 5, kind: 'lot', x: 22, y: 3, w: 4, h: 5, door: { x: 24, y: 7 }, doorOnTop: false },
  { id: 6, kind: 'lot', x: 34, y: 19, w: 4, h: 5, door: { x: 35, y: 23 }, doorOnTop: false, walkway: [{ x: 38, y: 24 }, { x: 38, y: 16 }] },
  { id: 7, kind: 'lot', x: 1, y: 9, w: 4, h: 4, door: { x: 2, y: 12 }, doorOnTop: false },
];

export function propertyAtDoor(x: number, y: number): PropertySpot | undefined {
  return PROPERTIES.find((p) => p.door.x === x && p.door.y === y);
}

export function propertySpot(id: number): PropertySpot | undefined {
  return PROPERTIES.find((p) => p.id === id);
}

// The tile you step out onto when leaving (the walkable side of the door)
export function outsideDoor(p: PropertySpot): { x: number; y: number } {
  return { x: p.door.x, y: p.doorOnTop ? p.door.y - 1 : p.door.y + 1 };
}
