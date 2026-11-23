// The Place panel, for houses and shops in town. Three modes:
//  - claim:  you walked up to an empty building or lot (make it your house or shop)
//  - manage: the owner's settings (name, who can come in, guest list, ban list, give it up)
//  - store:  inside a shop (buy things, visit the shop's links; the owner stocks it here)

import { economy, onEconomyChange } from '../economy';
import type { ShopItem } from '../economy';
import type { RoomVisibility } from '../friends';
import {
  MAX_PER_USE,
  addShopLink,
  buyFromShop,
  claimCost,
  claimProperty,
  countOwned,
  getShop,
  loadTown,
  propertyInfo,
  propertyPeople,
  releaseProperty,
  removeShopLink,
  renameProperty,
  reportShopLink,
  safeLinkUrl,
  setPropertyAccess,
  setPropertyVisibility,
  setShopPrice,
  stockShopItem,
  unstockShopItem,
  wholesalePrice,
} from '../properties';
import type { Person, PropertyInfo, PropertyUse, ShopInfo } from '../properties';
import { cancelDecorate } from './decorate';
import { toast } from './hud';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const panel = $('prop');
const title = $('prop-title');
const body = $('prop-body');
const errorText = $('prop-error');
const closeBtn = $<HTMLButtonElement>('prop-close');

// The game hooks into these
export const placePanel = {
  myId: null as string | null,
  // You claimed a place: the town redraws its signs and lots
  onClaimed: null as ((id: number) => void) | null,
  // You gave up the place you're standing in
  onReleased: null as ((id: number) => void) | null,
  // Your own room (from the claim panel, so doors still lead home)
  onGoHome: null as (() => void) | null,
  // People inside right now (owner only), and asking one to leave
  guests: null as (() => { id: string; name: string }[]) | null,
  onRemoveGuest: null as ((sessionId: string) => void) | null,
};

type Mode = { kind: 'claim'; id: number } | { kind: 'manage'; id: number } | { kind: 'store'; id: number };
let mode: Mode | null = null;
let busy = false;
let people: Person[] = [];
let shop: ShopInfo | null = null;

// ---------- small building blocks ----------

function button(text: string, onClick: () => Promise<void> | void, primary = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'w-btn' + (primary ? ' selected' : '');
  b.textContent = text;
  b.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    errorText.textContent = '';
    try {
      await onClick();
    } catch (err) {
      errorText.textContent = (err as Error).message;
    } finally {
      busy = false;
    }
  });
  return b;
}

function label(text: string): HTMLElement {
  const l = document.createElement('div');
  l.className = 'w-label';
  l.textContent = text;
  return l;
}

function note(text: string): HTMLElement {
  const p = document.createElement('div');
  p.className = 'prop-note';
  p.textContent = text;
  return p;
}

function row(name: string, detail: string, buttons: HTMLElement[], dim = false): HTMLElement {
  const r = document.createElement('div');
  r.className = 'friend-row' + (dim ? ' dim' : '');
  const info = document.createElement('div');
  info.className = 'pet-info';
  const n = document.createElement('strong');
  n.textContent = name;
  const d = document.createElement('span');
  d.textContent = detail;
  info.append(n, d);
  r.appendChild(info);
  buttons.forEach((b) => r.appendChild(b));
  return r;
}

// Text box that doesn't move your character while you type
function input(placeholder: string, maxLength: number, type = 'text'): HTMLInputElement {
  const i = document.createElement('input');
  i.type = type;
  i.placeholder = placeholder;
  i.maxLength = maxLength;
  i.autocomplete = 'off';
  i.className = 'prop-input';
  i.addEventListener('keydown', (e) => e.stopPropagation());
  return i;
}

function inline(...els: HTMLElement[]): HTMLElement {
  const d = document.createElement('div');
  d.className = 'prop-inline';
  d.append(...els);
  return d;
}

function useWord(use: PropertyUse): string {
  return use === 'home' ? 'house' : 'shop';
}

function placeName(p: PropertyInfo): string {
  return p.name ?? p.label;
}

// ---------- claim ----------

function renderClaim(id: number): void {
  const p = propertyInfo(id);
  if (!p) {
    body.append(note('Loading...'));
    return;
  }
  title.textContent = p.label;
  if (p.owner_id) {
    body.append(note(placeName(p) + ' belongs to ' + (p.owner_name ?? 'someone') + '.'));
    return;
  }

  const me = placePanel.myId ?? '';
  body.append(
    note(
      p.kind === 'lot'
        ? 'An empty lot. Buy it and a new building goes up right away.'
        : 'Nobody lives here. Claim it and walking through this door takes people inside.',
    ),
  );

  for (const use of ['home', 'shop'] as PropertyUse[]) {
    const owned = countOwned(me, use);
    const cost = claimCost(p, me, use);
    const what = use === 'home' ? 'Make it my house' : 'Open a shop here';
    const detail =
      owned >= MAX_PER_USE
        ? 'You already own ' + MAX_PER_USE + ' ' + useWord(use) + 's'
        : cost === 0
          ? 'Free: your first ' + useWord(use)
          : cost + ' coins';
    const b = button(
      what,
      async () => {
        const paid = await claimProperty(id, use);
        toast(
          (use === 'home' ? 'Your new house! ' : 'Your shop is open! ') +
            (paid ? '(-' + paid + ' coins) ' : '') +
            'Walk in through the door.',
        );
        placePanel.onClaimed?.(id);
        close();
      },
      true,
    );
    const balance = economy.state?.balance ?? 0;
    b.disabled = owned >= MAX_PER_USE || balance < cost;
    body.append(row(what, detail, [b], b.disabled));
  }

  body.append(label('Houses: decorate them and choose who can come in. Shops: sell items and link to your stuff online.'));
  if (p.kind === 'building') {
    body.append(inline(button('Go to my room instead', () => {
      close();
      placePanel.onGoHome?.();
    })));
  }
}

// ---------- manage (owner) ----------

const VIS_CHOICES: [RoomVisibility, string][] = [
  ['private', 'Guests only'],
  ['friends', 'Friends + guests'],
  ['public', 'Everyone'],
];

function renderManage(id: number): void {
  const p = propertyInfo(id);
  if (!p || p.owner_id !== placePanel.myId) {
    body.append(note('This place is not yours.'));
    return;
  }
  title.textContent = placeName(p);

  // Name
  body.append(label('Name'));
  const nameInput = input('Name', 32);
  nameInput.value = p.name ?? '';
  body.append(
    inline(
      nameInput,
      button('Rename', async () => {
        const n = await renameProperty(id, nameInput.value);
        toast('Renamed to ' + n);
        render();
      }),
    ),
  );

  // Who can come in
  body.append(label('Who can come in'));
  const vis = document.createElement('div');
  vis.className = 'w-options';
  for (const [v, text] of VIS_CHOICES) {
    vis.appendChild(
      button(text, async () => {
        await setPropertyVisibility(id, v);
        render();
      }, p.visibility === v),
    );
  }
  body.append(vis);
  body.append(note('Banned and blocked players can never come in. Guests can always come in.'));

  // Add to guest list / ban list
  const who = input('Username', 16);
  const add = (kind: 'allow' | 'ban') => async () => {
    const name = who.value.trim();
    if (!name) return;
    const n = await setPropertyAccess(id, name, kind);
    toast(kind === 'allow' ? n + ' is on your guest list' : n + ' is banned from here');
    who.value = '';
    await reloadPeople(id);
  };
  body.append(label('Guest list and ban list'), inline(who, button('Add guest', add('allow'), true), button('Ban', add('ban'))));

  const guestsList = people.filter((x) => x.kind === 'allow');
  const banned = people.filter((x) => x.kind === 'ban');
  for (const g of guestsList) {
    body.append(row(g.username, 'guest', [button('Remove', async () => {
      await setPropertyAccess(id, g.username, 'none');
      await reloadPeople(id);
    })]));
  }
  for (const b of banned) {
    body.append(row(b.username, 'banned', [button('Unban', async () => {
      await setPropertyAccess(id, b.username, 'none');
      await reloadPeople(id);
    })], true));
  }

  // People inside now
  const inside = placePanel.guests?.() ?? [];
  if (inside.length) {
    body.append(label('Here now'));
    for (const g of inside) {
      body.append(row(g.name, 'visiting', [button('Ask to leave', () => {
        placePanel.onRemoveGuest?.(g.id);
        toast(g.name + ' was sent back to town');
      })]));
    }
  }

  // Give it up
  body.append(label('Give it up'));
  body.append(
    inline(
      button('Give back to the town', async () => {
        const extra = p.use === 'shop' ? ' Unsold stock is refunded at the price you paid.' : '';
        const lot = p.kind === 'lot' ? ' The building on this lot will be taken down.' : '';
        if (!window.confirm('Give up ' + placeName(p) + '? You won\'t get the claim price back.' + extra + lot)) return;
        const refund = await releaseProperty(id);
        toast('You gave up ' + placeName(p) + (refund ? ' (+' + refund + ' coins for unsold stock)' : ''));
        close();
        placePanel.onReleased?.(id);
      }),
    ),
  );
}

async function reloadPeople(id: number): Promise<void> {
  people = await propertyPeople(id);
  render();
}

// ---------- store ----------

function renderStore(id: number): void {
  const p = propertyInfo(id);
  title.textContent = p ? placeName(p) : 'Shop';
  if (!shop) {
    body.append(note('Loading...'));
    return;
  }
  const s = shop;
  const bal = economy.state?.balance ?? 0;
  const owned = economy.state?.owned ?? new Set<string>();

  body.append(label('For sale' + (s.mine ? ' (you are the owner)' : '') + ' · you have ' + bal + ' coins'));
  if (s.stock.length === 0) body.append(note(s.mine ? 'Nothing for sale yet. Stock some items below.' : 'Nothing for sale right now.'));

  for (const line of s.stock) {
    const catalog = line.catalog_price;
    const detail =
      line.price + ' coins' +
      (line.price < catalog ? ' (shop price ' + catalog + ')' : '') +
      ' · ' + (line.quantity > 0 ? line.quantity + ' left' : 'sold out');
    if (s.mine) {
      const priceIn = input('Price', 5, 'number');
      priceIn.value = String(line.price);
      priceIn.min = '1';
      priceIn.max = String(catalog * 2);
      priceIn.className = 'prop-input prop-num';
      body.append(
        row(line.name, detail, [
          priceIn,
          button('Set price', async () => {
            await setShopPrice(id, line.item_id, Math.floor(Number(priceIn.value)));
            await reloadShop(id);
          }),
          button('Remove', async () => {
            const refund = await unstockShopItem(id, line.item_id);
            toast('Taken off sale' + (refund ? ' (+' + refund + ' coins back)' : ''));
            await reloadShop(id);
          }),
        ], line.quantity === 0),
      );
    } else {
      const have = owned.has(line.item_id);
      const b = button(have ? 'Owned' : 'Buy', async () => {
        await buyFromShop(id, line.item_id, line.price);
        const where = line.category === 'furniture' || line.category === 'roomTemplate' ? 'Decorate with it at home.' : 'Find it in your Wardrobe.';
        toast('Bought ' + line.name + '! ' + where);
        await reloadShop(id);
      }, true);
      b.disabled = have || bal < line.price;
      body.append(row(line.name, detail, [b], have));
    }
  }

  // Links
  if (s.links.length || s.mine) body.append(label('Links'));
  for (const l of s.links) {
    const host = safeLinkUrl(l.url)?.hostname ?? 'unknown site';
    const buttons: HTMLElement[] = [button('Visit', () => openLinkWarning(l.url))];
    if (s.mine) {
      buttons.push(button('Remove', async () => {
        await removeShopLink(l.id);
        await reloadShop(id);
      }));
    } else {
      buttons.push(button('Report', async () => {
        const reason = window.prompt('Report this link? Say what is wrong with it (optional):', '');
        if (reason === null) return;
        await reportShopLink(l.id, reason);
        toast('Thanks, the link was reported');
      }));
    }
    body.append(row(l.label, host + (l.hidden ? ' · hidden after reports' : ''), buttons, l.hidden));
  }

  if (s.mine) renderStockTools(id, s);
}

function renderStockTools(id: number, s: ShopInfo): void {
  // Add a link
  if (s.links.length < 5) {
    const lbl = input('Link name (e.g. My Bandcamp)', 40);
    const url = input('https://...', 300, 'url');
    body.append(
      inline(lbl),
      inline(
        url,
        button('Add link', async () => {
          if (!safeLinkUrl(url.value)) throw new Error('Links must be a full https:// web address');
          await addShopLink(id, lbl.value, url.value.trim());
          await reloadShop(id);
        }, true),
      ),
    );
  }

  // Stock an item
  body.append(label('Stock an item (you pay the wholesale price now, buyers pay you)'));
  const items: ShopItem[] = (economy.state?.items ?? []).filter((i) => i.price > 0);
  const select = document.createElement('select');
  select.className = 'prop-input';
  select.addEventListener('keydown', (e) => e.stopPropagation());
  for (const i of items) {
    const o = document.createElement('option');
    o.value = i.id;
    o.textContent = i.name + ' (' + i.category + ') · wholesale ' + wholesalePrice(i.price);
    select.appendChild(o);
  }
  const qty = input('How many', 2, 'number');
  qty.value = '1';
  qty.min = '1';
  qty.max = '20';
  qty.className = 'prop-input prop-num';
  const price = input('Price', 5, 'number');
  price.className = 'prop-input prop-num';
  price.min = '1';
  const cost = note('');
  const update = (itemChanged: boolean) => {
    const it = items.find((i) => i.id === select.value);
    if (!it) return;
    if (itemChanged) price.value = String(it.price);
    price.max = String(it.price * 2);
    const n = Math.max(1, Math.floor(Number(qty.value) || 1));
    cost.textContent =
      'Costs you ' + wholesalePrice(it.price) * n + ' coins now. Sell price 1 to ' + it.price * 2 +
      ' (the main Shop charges ' + it.price + ').';
  };
  select.addEventListener('change', () => update(true));
  qty.addEventListener('input', () => update(false));
  update(true);
  body.append(
    inline(select),
    inline(qty, price, button('Stock', async () => {
      const it = items.find((i) => i.id === select.value);
      if (!it) return;
      await stockShopItem(id, it.id, Math.floor(Number(qty.value)), Math.floor(Number(price.value)));
      toast('Stocked ' + it.name);
      await reloadShop(id);
    }, true)),
    cost,
  );
}

async function reloadShop(id: number): Promise<void> {
  shop = await getShop(id);
  render();
}

// ---------- "You are leaving DigiCommune" ----------

const warn = $('link-warn');
const warnHost = $('link-warn-host');
const warnUrl = $('link-warn-url');
const warnGo = $<HTMLButtonElement>('link-warn-go');
let pendingUrl: string | null = null;

function openLinkWarning(raw: string): void {
  const u = safeLinkUrl(raw);
  if (!u) {
    errorText.textContent = 'That link does not look safe, so it was not opened.';
    return;
  }
  pendingUrl = u.href;
  warnHost.textContent = u.hostname;
  warnUrl.textContent = u.href;
  warn.style.display = 'flex';
}

warnGo.addEventListener('click', () => {
  if (pendingUrl) window.open(pendingUrl, '_blank', 'noopener,noreferrer');
  pendingUrl = null;
  warn.style.display = 'none';
});
$('link-warn-cancel').addEventListener('click', () => {
  pendingUrl = null;
  warn.style.display = 'none';
});

// ---------- open / close ----------

function render(): void {
  const scroll = body.scrollTop;
  body.innerHTML = '';
  if (!mode) return;
  if (mode.kind === 'claim') renderClaim(mode.id);
  else if (mode.kind === 'manage') renderManage(mode.id);
  else renderStore(mode.id);
  body.scrollTop = scroll;
}

function isOpen(): boolean {
  return panel.style.display === 'flex';
}

function close(): void {
  panel.style.display = 'none';
  mode = null;
}

function show(next: Mode): void {
  errorText.textContent = '';
  // Only one side panel at a time
  if ($('wardrobe').style.display === 'flex') $('wardrobe-cancel').click();
  cancelDecorate();
  $('shop').style.display = 'none';
  $('pets').style.display = 'none';
  $('friends').style.display = 'none';
  mode = next;
  panel.style.display = 'flex';
  render();
}

export function closePlacePanel(): void {
  if (isOpen()) close();
}

export function openClaim(id: number): void {
  show({ kind: 'claim', id });
  void loadTown().then(() => isOpen() && render()).catch(() => undefined);
}

export function openManage(id: number): void {
  people = [];
  show({ kind: 'manage', id });
  void reloadPeople(id).catch((err) => (errorText.textContent = (err as Error).message));
}

export function openStore(id: number): void {
  shop = null;
  show({ kind: 'store', id });
  void reloadShop(id).catch((err) => (errorText.textContent = (err as Error).message));
}

closeBtn.addEventListener('click', close);

onEconomyChange(() => {
  if (isOpen() && mode?.kind !== 'manage') render();
});
