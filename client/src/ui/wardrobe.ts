import { CATEGORIES } from '../avatar/avatar';
import { drawAvatarPreview, onSheetUpdated } from '../avatar/sprites';
import { avatarKey } from '../avatar/avatar';
import type { Category } from '../avatar/avatar';
import type { Avatar } from '../avatar/avatar';
import { isUnlocked, itemFor, onEconomyChange } from '../economy';
import { cancelDecorate } from './decorate';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const panel = $('wardrobe');
const title = $('wardrobe-title');
const canvas = $<HTMLCanvasElement>('wardrobe-preview');
const body = $('wardrobe-body');
const errorText = $('wardrobe-error');
const saveBtn = $<HTMLButtonElement>('wardrobe-save');
const cancelBtn = $<HTMLButtonElement>('wardrobe-cancel');

// The game hooks into these
export const wardrobe = {
  onPreview: null as ((avatar: Avatar) => void) | null,
  onSave: null as ((avatar: Avatar) => Promise<void>) | null,
  onClosed: null as (() => void) | null, // after Save or Cancel
};

let saved: Avatar;
let current: Avatar;
const buttons = new Map<keyof Avatar, HTMLButtonElement[]>();
const rows = new Map<keyof Avatar, HTMLElement>();
const tabButtons = new Map<Category['group'], HTMLButtonElement>();
let tab: Category['group'] = 'Body';
let built = false;

// Show only the open tab's rows, and only rows that make sense for this look
function refreshRows(): void {
  const custom = current.preset === 0;
  tabButtons.forEach((b, g) => {
    b.classList.toggle('selected', g === tab);
    b.style.display = custom ? '' : 'none';
  });
  for (const cat of CATEGORIES) {
    const show = cat.group === 'Character' || (cat.group === tab && (!cat.when || cat.when(current)));
    rows.get(cat.key)!.style.display = show ? '' : 'none';
  }
}

function renderPreview(): void {
  drawAvatarPreview(canvas.getContext('2d')!, current);
}

function refreshSelection(): void {
  buttons.forEach((list, key) => {
    const multi = CATEGORIES.find((c) => c.key === key)?.multi;
    list.forEach((btn, i) =>
      btn.classList.toggle('selected', multi ? (current[key] & (1 << i)) !== 0 : current[key] === i),
    );
  });
}

// Dim options the player hasn't unlocked yet and show their price
function refreshLocks(): void {
  CATEGORIES.forEach((cat) => {
    buttons.get(cat.key)?.forEach((btn, i) => {
      const unlocked = isUnlocked(cat.key, i);
      const item = itemFor(cat.key, i);
      btn.classList.toggle('locked', !unlocked);
      btn.title = unlocked ? '' : 'Locked' + (item ? ': ' + item.price + ' coins in the Shop' : '');
      if (btn.dataset.name) {
        btn.textContent = unlocked ? btn.dataset.name : btn.dataset.name + ' (' + (item?.price ?? '?') + ')';
      }
    });
  });
}

function build(): void {
  if (built) return;
  built = true;

  const tabs = document.createElement('div');
  tabs.className = 'w-tabs';
  for (const g of ['Body', 'Hair', 'Clothes', 'Extras'] as const) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'w-btn';
    b.textContent = g;
    b.addEventListener('click', () => {
      tab = g;
      refreshRows();
    });
    tabButtons.set(g, b);
    tabs.appendChild(b);
  }

  for (const cat of CATEGORIES) {
    const row = document.createElement('div');
    const label = document.createElement('div');
    label.className = 'w-label';
    label.textContent = cat.label;
    const options = document.createElement('div');
    options.className = 'w-options';

    const list: HTMLButtonElement[] = [];
    const count = cat.colors ? cat.colors.length : (cat.names?.length ?? 0);

    for (let i = 0; i < count; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      if (cat.colors) {
        btn.className = 'w-swatch';
        btn.style.background = '#' + cat.colors[i].toString(16).padStart(6, '0');
        btn.setAttribute('aria-label', cat.label + ' ' + (i + 1));
      } else {
        btn.className = 'w-btn';
        btn.textContent = cat.names![i];
        btn.dataset.name = cat.names![i];
      }
      btn.addEventListener('click', () => {
        if (!isUnlocked(cat.key, i)) {
          errorText.textContent = 'Locked: buy it in the Shop first.';
          return;
        }
        errorText.textContent = '';
        // Multi-pick rows toggle their option on/off; others pick one
        const value = cat.multi ? current[cat.key] ^ (1 << i) : i;
        current = { ...current, [cat.key]: value };
        refreshSelection();
        refreshRows();
        renderPreview();
        wardrobe.onPreview?.(current);
      });
      list.push(btn);
      options.appendChild(btn);
    }

    buttons.set(cat.key, list);
    rows.set(cat.key, row);
    row.appendChild(label);
    row.appendChild(options);
    body.appendChild(row);
    // The tabs go right under the Character choice
    if (cat.group === 'Character') body.appendChild(tabs);
  }
}

function close(): void {
  panel.style.display = 'none';
  const after = wardrobe.onClosed;
  wardrobe.onClosed = null;
  after?.();
}

export function openWardrobe(initial: Avatar, firstTime = false): void {
  build();
  saved = { ...initial };
  current = { ...initial };
  title.textContent = firstTime ? 'Create your character' : 'Wardrobe';
  errorText.textContent = '';
  $('shop').style.display = 'none';
  $('pets').style.display = 'none';
  $('friends').style.display = 'none';
  $('prop').style.display = 'none';
  cancelDecorate();
  panel.style.display = 'flex';
  refreshSelection();
  refreshRows();
  refreshLocks();
  renderPreview();
}

saveBtn.addEventListener('click', async () => {
  errorText.textContent = '';
  saveBtn.disabled = true;
  try {
    await wardrobe.onSave?.(current);
    close();
  } catch (err) {
    errorText.textContent = (err as Error).message;
  } finally {
    saveBtn.disabled = false;
  }
});

cancelBtn.addEventListener('click', () => {
  wardrobe.onPreview?.(saved); // put the character back to how it was
  close();
});

onEconomyChange(refreshLocks);

// The preview's art may still be loading: redraw when it arrives
onSheetUpdated((key) => {
  if (panel.style.display === 'flex' && key === avatarKey(current)) renderPreview();
});
