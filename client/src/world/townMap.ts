import { MAP_H, MAP_W } from '../config';
import { PROPERTIES, outsideDoor } from './properties';

// Tile indexes. They match the order of tiles drawn in tileset.ts.
export const T = {
  GRASS: 0,
  PATH: 1,
  WATER: 2,
  TREE: 3,
  WALL: 4,
  DOOR: 5,
  FLOWER: 6,
  // Room interiors
  FLOOR_WOOD: 7,
  FLOOR_TILE: 8,
  FLOOR_CARPET: 9,
  ROOM_WALL: 10,
  DOORMAT: 11,
} as const;

export const TILE_COUNT = 12;

// Tiles the player cannot walk through.
export const BLOCKED_TILES: number[] = [T.WATER, T.TREE, T.WALL, T.ROOM_WALL];

// Tile coordinates where new players appear (centre of the town crossroads).
export const SPAWN = { x: 20, y: 15 };

// A seeded random generator so every player gets the exact same town.
// This matters once the map is shared in multiplayer.
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// builtLots: ids of lots that someone has built a house or shop on.
// Empty lots are drawn as a bare dirt plot (path tiles) with a sign on the door tile.
export function buildTownMap(builtLots: ReadonlySet<number> = new Set()): number[][] {
  const rand = seededRandom(1234);
  const d: number[][] = Array.from({ length: MAP_H }, () =>
    Array<number>(MAP_W).fill(T.GRASS),
  );

  // Scatter trees and flowers on the grass
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const r = rand();
      if (r < 0.07) d[y][x] = T.TREE;
      else if (r < 0.15) d[y][x] = T.FLOWER;
    }
  }

  // Closed border of trees
  for (let x = 0; x < MAP_W; x++) {
    d[0][x] = T.TREE;
    d[MAP_H - 1][x] = T.TREE;
  }
  for (let y = 0; y < MAP_H; y++) {
    d[y][0] = T.TREE;
    d[y][MAP_W - 1] = T.TREE;
  }

  // Main paths: one horizontal (2 tiles wide), one vertical (2 tiles wide)
  for (let x = 1; x < MAP_W - 1; x++) {
    d[14][x] = T.PATH;
    d[15][x] = T.PATH;
  }
  for (let y = 1; y < MAP_H - 1; y++) {
    d[y][19] = T.PATH;
    d[y][20] = T.PATH;
  }

  // Pond in the top right
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const dx = (x - 31) / 5;
      const dy = (y - 7) / 3;
      if (dx * dx + dy * dy <= 1) d[y][x] = T.WATER;
    }
  }

  // Houses: a block of wall tiles with one door and a path to the main road
  const pathToRoad = (doorX: number, doorY: number, doorOnTop: boolean) => {
    if (doorOnTop) {
      for (let yy = doorY - 1; yy >= 16; yy--) d[yy][doorX] = T.PATH;
    } else {
      for (let yy = doorY + 1; yy <= 13; yy++) d[yy][doorX] = T.PATH;
    }
  };
  // A footpath through the given corners, in straight lines (from the tile in front of the door)
  const walkway = (points: { x: number; y: number }[]) => {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const sx = Math.sign(b.x - a.x), sy = Math.sign(b.y - a.y);
      for (let x = a.x, y = a.y; ; x += sx, y += sy) {
        d[y][x] = T.PATH;
        if (x === b.x && y === b.y) break;
      }
    }
  };

  for (const p of PROPERTIES) {
    const built = p.kind === 'building' || builtLots.has(p.id);
    for (let yy = p.y; yy < p.y + p.h; yy++) {
      for (let xx = p.x; xx < p.x + p.w; xx++) d[yy][xx] = built ? T.WALL : T.PATH;
    }
    if (built) d[p.door.y][p.door.x] = T.DOOR;
    if (p.walkway) walkway([outsideDoor(p), ...p.walkway]);
    else pathToRoad(p.door.x, p.door.y, p.doorOnTop);
  }

  return d;
}
