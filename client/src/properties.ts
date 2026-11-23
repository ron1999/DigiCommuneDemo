// Houses and shops in town: who owns what, claiming, entry rules, shop stock and links.
// Every change goes through a database function in supabase/008_shops_homes.sql,
// which does all the checking. This file is just the client's copy for display.

import { supabase } from './supabase';
import { cleanLayout } from './world/rooms';
import type { RoomLayout } from './world/rooms';
import type { RoomVisibility } from './friends';
import { loadEconomy } from './economy';
import type { ItemCategory } from './economy';

export type PropertyUse = 'home' | 'shop';
export type AccessKind = 'allow' | 'ban';

// Must match claim_property() in 008_shops_homes.sql
export const MAX_PER_USE = 2;

// What a shop owner pays per unit of stock. Must match wholesale_price() in 008_shops_homes.sql
export function wholesalePrice(catalogPrice: number): number {
  return Math.max(1, Math.ceil(catalogPrice * 0.6));
}

export interface PropertyInfo {
  id: number;
  kind: 'building' | 'lot';
  label: string; // the sign while nobody owns it
  price: number; // coins (your first house and first shop are free)
  owner_id: string | null;
  owner_name: string | null;
  use: PropertyUse | null;
  name: string | null;
  visibility: RoomVisibility;
}

export interface PropertyInside {
  id: number;
  ownerId: string;
  ownerName: string;
  use: PropertyUse;
  name: string;
  layout: RoomLayout;
  visibility: RoomVisibility;
}

export interface StockLine {
  item_id: string;
  name: string;
  category: ItemCategory;
  price: number;
  quantity: number;
  catalog_price: number;
}

export interface ShopLink {
  id: number;
  label: string;
  url: string;
  hidden: boolean;
}

export interface ShopInfo {
  mine: boolean;
  stock: StockLine[];
  links: ShopLink[];
}

export interface Person {
  user_id: string;
  username: string;
  kind: AccessKind;
}

// The town's places, as last loaded
export const town: { list: PropertyInfo[]; loaded: boolean } = { list: [], loaded: false };

const listeners = new Set<() => void>();
export function onTownChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function rpc(name: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

export async function loadTown(): Promise<void> {
  town.list = ((await rpc('town_properties')) ?? []) as PropertyInfo[];
  town.loaded = true;
  listeners.forEach((fn) => fn());
}

export function propertyInfo(id: number): PropertyInfo | undefined {
  return town.list.find((p) => p.id === id);
}

// Lots that have a house or shop on them
export function builtLots(): Set<number> {
  return new Set(town.list.filter((p) => p.kind === 'lot' && p.owner_id).map((p) => p.id));
}

// How many houses (or shops) this account owns
export function countOwned(userId: string, use: PropertyUse): number {
  return town.list.filter((p) => p.owner_id === userId && p.use === use).length;
}

// What claiming this place as a house/shop would cost you (0 = your first one is free)
export function claimCost(p: PropertyInfo, userId: string, use: PropertyUse): number {
  return countOwned(userId, use) === 0 ? 0 : p.price;
}

export async function claimProperty(id: number, use: PropertyUse): Promise<number> {
  const r = (await rpc('claim_property', { p_property: id, p_use: use })) as { cost: number };
  await Promise.all([loadTown(), loadEconomy()]);
  return r.cost;
}

export async function releaseProperty(id: number): Promise<number> {
  const r = (await rpc('release_property', { p_property: id })) as { refund: number };
  await Promise.all([loadTown(), loadEconomy()]);
  return r.refund;
}

export async function renameProperty(id: number, name: string): Promise<string> {
  const clean = (await rpc('rename_property', { p_property: id, p_name: name })) as string;
  await loadTown();
  return clean;
}

// What it looks like inside (the database checks you may go in)
export async function getProperty(id: number): Promise<PropertyInside> {
  const r = (await rpc('get_property', { p_property: id })) as {
    id: number;
    owner_id: string;
    owner: string;
    use: PropertyUse;
    name: string | null;
    template: number;
    slots: Record<string, string | null> | null;
    visibility: RoomVisibility;
  };
  return {
    id: r.id,
    ownerId: r.owner_id,
    ownerName: r.owner,
    use: r.use,
    name: r.name ?? r.owner + "'s " + (r.use === 'shop' ? 'Shop' : 'House'),
    layout: cleanLayout({ template: r.template, slots: r.slots ?? {} }),
    visibility: r.visibility,
  };
}

export async function savePropertyRoom(id: number, layout: RoomLayout): Promise<RoomLayout> {
  const clean = cleanLayout(layout);
  const saved = (await rpc('save_property_room', {
    p_property: id,
    p_template: clean.template,
    p_slots: clean.slots,
  })) as { template: number; slots: Record<string, string> };
  return cleanLayout({ template: saved.template, slots: saved.slots });
}

export async function setPropertyVisibility(id: number, v: RoomVisibility): Promise<void> {
  await rpc('set_property_visibility', { p_property: id, p_visibility: v });
  await loadTown();
}

export async function propertyPeople(id: number): Promise<Person[]> {
  return ((await rpc('property_people', { p_property: id })) ?? []) as Person[];
}

// kind 'none' takes them off the guest list / ban list. Returns their username.
export async function setPropertyAccess(id: number, username: string, kind: AccessKind | 'none'): Promise<string> {
  return (await rpc('set_property_access', { p_property: id, p_username: username, p_kind: kind })) as string;
}

// ---------- shops ----------

export async function getShop(id: number): Promise<ShopInfo> {
  return (await rpc('get_shop', { p_property: id })) as ShopInfo;
}

export async function stockShopItem(id: number, itemId: string, quantity: number, price: number): Promise<void> {
  await rpc('stock_shop_item', { p_property: id, p_item: itemId, p_quantity: quantity, p_price: price });
  await loadEconomy();
}

export async function setShopPrice(id: number, itemId: string, price: number): Promise<void> {
  await rpc('set_shop_price', { p_property: id, p_item: itemId, p_price: price });
}

export async function unstockShopItem(id: number, itemId: string): Promise<number> {
  const r = (await rpc('unstock_shop_item', { p_property: id, p_item: itemId })) as { refund: number };
  await loadEconomy();
  return r.refund;
}

export async function buyFromShop(id: number, itemId: string, price: number): Promise<void> {
  await rpc('buy_from_shop', { p_property: id, p_item: itemId, p_price: price });
  await loadEconomy();
}

export async function addShopLink(id: number, label: string, url: string): Promise<void> {
  await rpc('add_shop_link', { p_property: id, p_label: label, p_url: url });
}

export async function removeShopLink(linkId: number): Promise<void> {
  await rpc('remove_shop_link', { p_link: linkId });
}

export async function reportShopLink(linkId: number, reason: string): Promise<void> {
  await rpc('report_shop_link', { p_link: linkId, p_reason: reason });
}

// Only full https:// addresses with a real-looking host name. The database checks again.
export function safeLinkUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}
