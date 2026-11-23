// The Decorate panel: pick a room template and what goes in each furniture slot.
// Works like the wardrobe: changes show in the room right away, Save stores them.

import { isItemUnlocked, itemById, onEconomyChange } from '../economy';
import { FURNITURE, ROOM_TEMPLATES, SLOT_LABELS, cleanLayout, templateById } from '../world/rooms';
import type { RoomLayout } from '../world/rooms';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const panel = $('decorate');
const body = $('decorate-body');
const errorText = $('decorate-error');
const saveBtn = $<HTMLButtonElement>('decorate-save');
const cancelBtn = $<HTMLButtonElement>('decorate-cancel');

// The game hooks into these
export const decorate = {
  onPreview: null as ((layout: RoomLayout) => void) | null,
  onSave: null as ((layout: RoomLayout) => Promise<void>) | null,
  // Returns a picture of a piece of furniture for the buttons
  iconFor: null as ((furnitureId: string) => CanvasImageSource | null) | null,
};

let saved: RoomLayout;
let current: RoomLayout;

function priceLabel(itemId: string): string {
  const item = itemById(itemId);
  return item && item.price > 0 && !isItemUnlocked(itemId) ? ' (' + item.price + ')' : '';
}

function optionButton(label: string, itemId: string | null, selected: boolean, onPick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'w-btn' + (itemId?.startsWith('furniture_') ? ' d-opt' : '');
  btn.classList.toggle('selected', selected);

  const locked = itemId !== null && !isItemUnlocked(itemId);
  btn.classList.toggle('locked', locked);
  if (locked) btn.title = 'Locked: ' + (itemById(itemId)?.price ?? '?') + ' coins in the Shop';

  const icon = itemId?.startsWith('furniture_') ? decorate.iconFor?.(itemId) : null;
  if (icon) {
    const c = document.createElement('canvas');
    c.width = 48;
    c.height = 32;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const src = icon as HTMLCanvasElement;
    const s = Math.min(c.width / src.width, c.height / src.height);
    ctx.drawImage(src, (c.width - src.width * s) / 2, (c.height - src.height * s) / 2, src.width * s, src.height * s);
    btn.appendChild(c);
  }
  const text = document.createElement('span');
  text.textContent = label + (itemId ? priceLabel(itemId) : '');
  btn.appendChild(text);

  btn.addEventListener('click', () => {
    if (locked) {
      errorText.textContent = 'Locked: buy it in the Shop first.';
      return;
    }
    errorText.textContent = '';
    onPick();
  });
  return btn;
}

function row(label: string, buttons: HTMLButtonElement[]): HTMLElement {
  const r = document.createElement('div');
  const l = document.createElement('div');
  l.className = 'w-label';
  l.textContent = label;
  const options = document.createElement('div');
  options.className = 'w-options';
  buttons.forEach((b) => options.appendChild(b));
  r.appendChild(l);
  r.appendChild(options);
  return r;
}

function change(next: RoomLayout): void {
  current = cleanLayout(next);
  render();
  decorate.onPreview?.(current);
}

function render(): void {
  const scroll = body.scrollTop;
  body.innerHTML = '';

  // Room template
  body.appendChild(
    row(
      'Room',
      ROOM_TEMPLATES.map((t) =>
        optionButton(t.name, 'roomTemplate_' + t.id, current.template === t.id, () =>
          // Keep furniture in slots the new room also has
          change({ template: t.id, slots: current.slots }),
        ),
      ),
    ),
  );

  // One row per slot in this room
  for (const slot of templateById(current.template).slots) {
    const choices = FURNITURE.filter((f) => f.type === slot.type);
    const buttons = [
      optionButton('Empty', null, !current.slots[slot.name], () =>
        change({ ...current, slots: { ...current.slots, [slot.name]: null } }),
      ),
      ...choices.map((f) =>
        optionButton(f.name, f.id, current.slots[slot.name] === f.id, () =>
          change({ ...current, slots: { ...current.slots, [slot.name]: f.id } }),
        ),
      ),
    ];
    // Rooms can have two of the same kind of slot (plant1, plant2): number them
    const sameType = templateById(current.template).slots.filter((s) => s.type === slot.type);
    const n = sameType.length > 1 ? ' ' + (sameType.indexOf(slot) + 1) : '';
    body.appendChild(row(SLOT_LABELS[slot.type] + n, buttons));
  }

  body.scrollTop = scroll;
}

function close(): void {
  panel.style.display = 'none';
}

export function isDecorateOpen(): boolean {
  return panel.style.display === 'flex';
}

export function openDecorate(initial: RoomLayout): void {
  saved = cleanLayout(initial);
  current = cleanLayout(initial);
  errorText.textContent = '';
  // Only one side panel at a time
  if ($('wardrobe').style.display === 'flex') $('wardrobe-cancel').click();
  $('shop').style.display = 'none';
  $('pets').style.display = 'none';
  $('friends').style.display = 'none';
  $('prop').style.display = 'none';
  panel.style.display = 'flex';
  render();
}

// Closes without saving and puts the room back (used when leaving the room)
export function cancelDecorate(): void {
  if (!isDecorateOpen()) return;
  decorate.onPreview?.(saved);
  close();
}

saveBtn.addEventListener('click', async () => {
  errorText.textContent = '';
  saveBtn.disabled = true;
  try {
    await decorate.onSave?.(current);
    close();
  } catch (err) {
    errorText.textContent = (err as Error).message;
  } finally {
    saveBtn.disabled = false;
  }
});

cancelBtn.addEventListener('click', cancelDecorate);

onEconomyChange(() => {
  if (isDecorateOpen()) render();
});
