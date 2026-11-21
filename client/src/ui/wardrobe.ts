import { CATEGORIES } from '../avatar/avatar';
import { drawAvatarPreview } from '../avatar/sprites';
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
};

let saved: Avatar;
let current: Avatar;
const buttons = new Map<keyof Avatar, HTMLButtonElement[]>();
let built = false;

function renderPreview(): void {
  drawAvatarPreview(canvas.getContext('2d')!, current);
}

function refreshSelection(): void {
  buttons.forEach((list, key) => {
    list.forEach((btn, i) => btn.classList.toggle('selected', current[key] === i));
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
        current = { ...current, [cat.key]: i };
        refreshSelection();
        renderPreview();
        wardrobe.onPreview?.(current);
      });
      list.push(btn);
      options.appendChild(btn);
    }

    buttons.set(cat.key, list);
    row.appendChild(label);
    row.appendChild(options);
    body.appendChild(row);
  }
}

function close(): void {
  panel.style.display = 'none';
}

export function openWardrobe(initial: Avatar, firstTime = false): void {
  build();
  saved = { ...initial };
  current = { ...initial };
  title.textContent = firstTime ? 'Create your character' : 'Wardrobe';
  errorText.textContent = '';
  $('shop').style.display = 'none';
  cancelDecorate();
  panel.style.display = 'flex';
  refreshSelection();
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
