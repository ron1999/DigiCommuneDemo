// Personal rooms: pre-made templates with fixed furniture slots.
//
// IMPORTANT: keep these in sync with supabase/004_rooms.sql:
//   - FURNITURE order   = items 'furniture_N' (option_index N) and their slot_type
//   - ROOM_TEMPLATES    = room_templates rows (same id, same slot names and types)

import { T } from './townMap';

export type SlotType = 'bed' | 'table' | 'seat' | 'rug' | 'plant' | 'lamp' | 'wall';

// Size of each kind of furniture, in tiles
export const SLOT_SIZE: Record<SlotType, { w: number; h: number }> = {
  bed: { w: 2, h: 2 },
  table: { w: 2, h: 1 },
  seat: { w: 1, h: 1 },
  rug: { w: 3, h: 2 },
  plant: { w: 1, h: 1 },
  lamp: { w: 1, h: 1 },
  wall: { w: 2, h: 1 },
};

// Rugs lie on the floor and wall art hangs on the wall: you can't bump into them
export const WALKABLE_SLOTS: SlotType[] = ['rug', 'wall'];

export const SLOT_LABELS: Record<SlotType, string> = {
  bed: 'Bed',
  table: 'Table',
  seat: 'Seat',
  rug: 'Rug',
  plant: 'Plant',
  lamp: 'Lamp',
  wall: 'Wall art',
};

export interface Furniture {
  id: string; // matches items.id in the database
  name: string;
  type: SlotType;
}

export const FURNITURE: Furniture[] = [
  { id: 'furniture_0', name: 'Simple Bed', type: 'bed' },
  { id: 'furniture_1', name: 'Canopy Bed', type: 'bed' },
  { id: 'furniture_2', name: 'Wooden Table', type: 'table' },
  { id: 'furniture_3', name: 'Tea Table', type: 'table' },
  { id: 'furniture_4', name: 'Stool', type: 'seat' },
  { id: 'furniture_5', name: 'Armchair', type: 'seat' },
  { id: 'furniture_6', name: 'Round Rug', type: 'rug' },
  { id: 'furniture_7', name: 'Striped Rug', type: 'rug' },
  { id: 'furniture_8', name: 'Fern', type: 'plant' },
  { id: 'furniture_9', name: 'Cactus', type: 'plant' },
  { id: 'furniture_10', name: 'Floor Lamp', type: 'lamp' },
  { id: 'furniture_11', name: 'Lava Lamp', type: 'lamp' },
  { id: 'furniture_12', name: 'Poster', type: 'wall' },
  { id: 'furniture_13', name: 'Painting', type: 'wall' },
];

export function furnitureById(id: string | null | undefined): Furniture | undefined {
  return FURNITURE.find((f) => f.id === id);
}

export interface Slot {
  name: string; // matches the slot names in room_templates
  type: SlotType;
  x: number; // top-left tile
  y: number;
}

export interface RoomTemplate {
  id: number; // matches room_templates.id and items 'roomTemplate_N'
  name: string;
  w: number; // size in tiles, walls included
  h: number;
  floor: number; // floor tile index
  slots: Slot[];
}

// Each room: walls around the edge, a doormat (exit) in the middle of the bottom wall.
export const ROOM_TEMPLATES: RoomTemplate[] = [
  {
    id: 0,
    name: 'Studio',
    w: 9,
    h: 8,
    floor: T.FLOOR_WOOD,
    slots: [
      { name: 'wall1', type: 'wall', x: 4, y: 0 },
      { name: 'bed', type: 'bed', x: 1, y: 1 },
      { name: 'lamp', type: 'lamp', x: 3, y: 1 },
      { name: 'plant1', type: 'plant', x: 7, y: 1 },
      { name: 'table', type: 'table', x: 5, y: 3 },
      { name: 'seat1', type: 'seat', x: 6, y: 4 },
      { name: 'rug', type: 'rug', x: 1, y: 4 },
    ],
  },
  {
    id: 1,
    name: 'Loft',
    w: 12,
    h: 9,
    floor: T.FLOOR_TILE,
    slots: [
      { name: 'wall1', type: 'wall', x: 2, y: 0 },
      { name: 'wall2', type: 'wall', x: 8, y: 0 },
      { name: 'bed', type: 'bed', x: 1, y: 1 },
      { name: 'lamp', type: 'lamp', x: 3, y: 1 },
      { name: 'plant1', type: 'plant', x: 10, y: 1 },
      { name: 'plant2', type: 'plant', x: 1, y: 6 },
      { name: 'table', type: 'table', x: 7, y: 3 },
      { name: 'seat1', type: 'seat', x: 7, y: 4 },
      { name: 'seat2', type: 'seat', x: 8, y: 4 },
      { name: 'rug', type: 'rug', x: 3, y: 4 },
    ],
  },
  {
    id: 2,
    name: 'Cottage',
    w: 10,
    h: 8,
    floor: T.FLOOR_CARPET,
    slots: [
      { name: 'wall1', type: 'wall', x: 1, y: 0 },
      { name: 'wall2', type: 'wall', x: 6, y: 0 },
      { name: 'bed', type: 'bed', x: 6, y: 1 },
      { name: 'lamp', type: 'lamp', x: 5, y: 1 },
      { name: 'plant1', type: 'plant', x: 1, y: 1 },
      { name: 'plant2', type: 'plant', x: 8, y: 5 },
      { name: 'table', type: 'table', x: 2, y: 3 },
      { name: 'seat1', type: 'seat', x: 2, y: 4 },
      { name: 'rug', type: 'rug', x: 5, y: 4 },
    ],
  },
];

// The biggest room, so the server can keep positions inside any room
export const MAX_ROOM_W = Math.max(...ROOM_TEMPLATES.map((t) => t.w));
export const MAX_ROOM_H = Math.max(...ROOM_TEMPLATES.map((t) => t.h));

export interface RoomLayout {
  template: number;
  slots: Record<string, string | null>; // slot name -> furniture id (or empty)
}

// What a player has before they ever decorate
export const DEFAULT_ROOM: RoomLayout = {
  template: 0,
  slots: { bed: 'furniture_0', table: 'furniture_2', seat1: 'furniture_4', plant1: 'furniture_8' },
};

export function templateById(id: number): RoomTemplate {
  return ROOM_TEMPLATES.find((t) => t.id === id) ?? ROOM_TEMPLATES[0];
}

// Where the doormat is (you leave the room by stepping on it)
export function exitTile(t: RoomTemplate): { x: number; y: number } {
  return { x: Math.floor(t.w / 2), y: t.h - 1 };
}

// Where you appear when you come in: just above the doormat
export function roomSpawn(t: RoomTemplate): { x: number; y: number } {
  const e = exitTile(t);
  return { x: e.x, y: e.y - 1 };
}

export function buildRoomMap(t: RoomTemplate): number[][] {
  const d: number[][] = Array.from({ length: t.h }, () => Array<number>(t.w).fill(t.floor));
  for (let x = 0; x < t.w; x++) {
    d[0][x] = T.ROOM_WALL;
    d[t.h - 1][x] = T.ROOM_WALL;
  }
  for (let y = 0; y < t.h; y++) {
    d[y][0] = T.ROOM_WALL;
    d[y][t.w - 1] = T.ROOM_WALL;
  }
  const e = exitTile(t);
  d[e.y][e.x] = T.DOORMAT;
  return d;
}

// Keeps only slots this template has, with furniture that fits them
export function cleanLayout(layout: RoomLayout): RoomLayout {
  const t = templateById(layout.template);
  const slots: Record<string, string | null> = {};
  for (const s of t.slots) {
    const f = furnitureById(layout.slots[s.name]);
    slots[s.name] = f && f.type === s.type ? f.id : null;
  }
  return { template: t.id, slots };
}
