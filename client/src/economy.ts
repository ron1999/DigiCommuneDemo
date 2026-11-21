import { supabase } from './supabase';
import type { Avatar } from './avatar/avatar';

export interface ShopItem {
  id: string;
  category: keyof Avatar;
  option_index: number;
  name: string;
  price: number; // 0 = free for everyone
}

export interface EconomyState {
  balance: number;
  streak: number;
  lastClaimDate: string | null; // YYYY-MM-DD
  owned: Set<string>; // item ids bought so far
  items: ShopItem[];
}

// The daily reward day changes at midnight in this time zone.
// It must match claim_daily_reward() in supabase/003_economy.sql.
const DAY_TIMEZONE = 'America/New_York';

// The latest numbers from the database. The database is the boss; this is just a copy for display.
export const economy: { state: EconomyState | null } = { state: null };

const listeners = new Set<() => void>();
export function onEconomyChange(fn: () => void): void {
  listeners.add(fn);
}
function emit(): void {
  listeners.forEach((fn) => fn());
}

export function todayKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: DAY_TIMEZONE });
}

export function canClaimToday(): boolean {
  const s = economy.state;
  if (!s) return false;
  return s.lastClaimDate !== todayKey();
}

export function itemFor(category: keyof Avatar, index: number): ShopItem | undefined {
  return economy.state?.items.find((i) => i.category === category && i.option_index === index);
}

// Free items, or items this player has bought. Before the data loads we say yes;
// the database re-checks everything when you save.
export function isUnlocked(category: keyof Avatar, index: number): boolean {
  const s = economy.state;
  if (!s) return true;
  const item = itemFor(category, index);
  if (!item) return true;
  return item.price === 0 || s.owned.has(item.id);
}

export async function loadEconomy(): Promise<void> {
  const { data: auth } = await supabase.auth.getSession();
  const uid = auth.session?.user.id;
  if (!uid) throw new Error('Not logged in');

  const [wallet, claim, inventory, items] = await Promise.all([
    supabase.from('wallets').select('balance').eq('user_id', uid).maybeSingle(),
    supabase.from('daily_claims').select('last_claim_date, streak').eq('user_id', uid).maybeSingle(),
    supabase.from('inventory').select('item_id').eq('user_id', uid),
    supabase
      .from('items')
      .select('id, category, option_index, name, price')
      .order('category')
      .order('option_index'),
  ]);

  const failed = [wallet, claim, inventory, items].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  economy.state = {
    balance: (wallet.data?.balance as number | undefined) ?? 0,
    streak: (claim.data?.streak as number | undefined) ?? 0,
    lastClaimDate: (claim.data?.last_claim_date as string | undefined) ?? null,
    owned: new Set((inventory.data ?? []).map((r) => r.item_id as string)),
    items: (items.data ?? []) as ShopItem[],
  };
  emit();
}

export interface ClaimResult {
  claimed: boolean;
  amount: number;
  streak: number;
  balance: number;
}

export async function claimDaily(): Promise<ClaimResult> {
  const { data, error } = await supabase.rpc('claim_daily_reward');
  if (error) throw new Error(error.message);
  await loadEconomy();
  return data as ClaimResult;
}

export async function buyItem(itemId: string): Promise<void> {
  const { error } = await supabase.rpc('buy_item', { p_item_id: itemId });
  if (error) throw new Error(error.message);
  await loadEconomy();
}
