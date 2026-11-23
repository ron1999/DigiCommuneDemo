// The Pets panel.
//  - No pets yet: choose and name your free starter.
//  - Otherwise: your pets (pick who follows you, rename) and the collection of all species.

import { SPECIES } from '../pets/species';
import { drawPetIcon } from '../pets/petArt';
import { activePet, adoptStarter, onPetsChange, pets, renamePet, setActivePet } from '../pets/pets';
import { toast } from './hud';
import { cancelDecorate } from './decorate';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const panel = $('pets');
const title = $('pets-title');
const body = $('pets-body');
const errorText = $('pets-error');
const closeBtn = $<HTMLButtonElement>('pets-close');

// The game hooks into this to update the follower and tell other players
export const petsPanel = {
  onChanged: null as (() => void) | null,
};

let pickedStarter = 0;
let busy = false;

function icon(species: number, size: number, silhouette = false): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  c.className = 'pet-icon';
  drawPetIcon(species, c.getContext('2d')!, silhouette);
  return c;
}

function button(label: string, onClick: () => Promise<void> | void, primary = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'w-btn' + (primary ? ' selected' : '');
  b.textContent = label;
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

function renderStarterPicker(): void {
  title.textContent = 'Choose your starter pet';
  const starters = SPECIES.map((s, i) => ({ s, i })).filter((x) => x.s.starter);

  const cards = document.createElement('div');
  cards.className = 'pet-cards';
  const nameInput = document.createElement('input');

  for (const { s, i } of starters) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'pet-card' + (pickedStarter === i ? ' selected' : '');
    card.appendChild(icon(i, 64));
    const name = document.createElement('strong');
    name.textContent = s.name;
    const blurb = document.createElement('span');
    blurb.textContent = s.blurb;
    card.append(name, blurb);
    card.addEventListener('click', () => {
      // Keep a custom name; replace the default species name
      const wasDefault = !nameInput.value || nameInput.value === SPECIES[pickedStarter].name;
      pickedStarter = i;
      render();
      if (!wasDefault) ($('pet-name-input') as HTMLInputElement).value = nameInput.value;
    });
    cards.appendChild(card);
  }
  body.append(label('Pick one. It will follow you everywhere.'), cards);

  nameInput.id = 'pet-name-input';
  nameInput.type = 'text';
  nameInput.maxLength = 16;
  nameInput.value = SPECIES[pickedStarter].name;
  nameInput.autocomplete = 'off';
  body.append(label('Name'), nameInput);

  body.appendChild(
    button(
      'Adopt ' + SPECIES[pickedStarter].name,
      async () => {
        await adoptStarter(pickedStarter, nameInput.value.trim());
        petsPanel.onChanged?.();
        toast('Say hi to ' + (activePet()?.name ?? 'your pet') + '!');
        close();
      },
      true,
    ),
  );
}

function renderCollection(): void {
  title.textContent = 'Pets';

  body.appendChild(label('Your pets'));
  for (const p of pets.list) {
    const row = document.createElement('div');
    row.className = 'pet-row';
    row.appendChild(icon(p.species, 48));
    const info = document.createElement('div');
    info.className = 'pet-info';
    const name = document.createElement('strong');
    name.textContent = p.name;
    const kind = document.createElement('span');
    kind.textContent = SPECIES[p.species].name + (p.active ? ' · following you' : '');
    info.append(name, kind);
    row.appendChild(info);

    row.appendChild(
      p.active
        ? button('Stay home', async () => {
            await setActivePet(null);
            petsPanel.onChanged?.();
          })
        : button('Follow me', async () => {
            await setActivePet(p.id);
            petsPanel.onChanged?.();
          }),
    );
    row.appendChild(
      button('Rename', async () => {
        const next = window.prompt('New name for ' + p.name + ' (1-16 letters/numbers):', p.name);
        if (next === null || next.trim() === p.name) return;
        await renamePet(p.id, next.trim());
        petsPanel.onChanged?.();
      }),
    );
    body.appendChild(row);
  }

  const found = new Set(pets.list.map((p) => p.species));
  body.appendChild(label('Collection: ' + found.size + ' / ' + SPECIES.length + ' found'));
  const grid = document.createElement('div');
  grid.className = 'pet-grid';
  SPECIES.forEach((s, i) => {
    const cell = document.createElement('div');
    cell.className = 'pet-cell';
    const have = found.has(i);
    cell.appendChild(icon(i, 48, !have));
    const n = document.createElement('span');
    n.textContent = have ? s.name : '???';
    cell.appendChild(n);
    cell.title = have ? s.blurb : 'Not found yet';
    grid.appendChild(cell);
  });
  body.appendChild(grid);
}

function render(): void {
  body.innerHTML = '';
  if (!pets.loaded) {
    body.textContent = 'Loading...';
    return;
  }
  if (pets.list.length === 0) renderStarterPicker();
  else renderCollection();
}

function close(): void {
  panel.style.display = 'none';
}

export function openPets(): void {
  errorText.textContent = '';
  // Only one side panel at a time
  if ($('wardrobe').style.display === 'flex') $('wardrobe-cancel').click();
  cancelDecorate();
  $('shop').style.display = 'none';
  $('friends').style.display = 'none';
  $('prop').style.display = 'none';
  panel.style.display = 'flex';
  render();
}

closeBtn.addEventListener('click', close);

onPetsChange(() => {
  if (panel.style.display === 'flex') render();
});
