import { CATEGORIES } from '../avatar/avatar';
import { buyItem, economy, onEconomyChange } from '../economy';
import { toast } from './hud';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const panel = $('shop');
const list = $('shop-list');
const balanceEl = $('shop-balance');
const errorEl = $('shop-error');
const closeBtn = $<HTMLButtonElement>('shop-close');

function render(): void {
  const s = economy.state;
  const scroll = list.scrollTop;
  list.innerHTML = '';

  if (!s) {
    list.textContent = 'Loading...';
    return;
  }
  balanceEl.textContent = 'Coins: ' + s.balance;

  for (const cat of CATEGORIES) {
    const items = s.items.filter((i) => i.category === cat.key && i.price > 0);
    if (items.length === 0) continue;

    const heading = document.createElement('div');
    heading.className = 'shop-cat';
    heading.textContent = cat.label;
    list.appendChild(heading);

    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'shop-row';

      if (cat.colors) {
        const swatch = document.createElement('span');
        swatch.className = 'shop-swatch';
        swatch.style.background = '#' + cat.colors[item.option_index].toString(16).padStart(6, '0');
        row.appendChild(swatch);
      }

      const name = document.createElement('span');
      name.className = 'shop-name';
      name.textContent = item.name;
      row.appendChild(name);

      const price = document.createElement('span');
      price.className = 'shop-price';
      price.textContent = item.price + ' coins';
      row.appendChild(price);

      const owned = s.owned.has(item.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'shop-buy';
      btn.textContent = owned ? 'Owned' : 'Buy';
      btn.disabled = owned || s.balance < item.price;
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        errorEl.textContent = '';
        try {
          await buyItem(item.id);
          toast('Bought ' + item.name + '! Find it in your Wardrobe.');
        } catch (err) {
          errorEl.textContent = (err as Error).message;
          btn.disabled = false;
        }
      });
      row.appendChild(btn);

      list.appendChild(row);
    }
  }

  list.scrollTop = scroll;
}

export function openShop(): void {
  // Close the wardrobe first (this also puts the character's look back)
  if ($('wardrobe').style.display === 'flex') $('wardrobe-cancel').click();
  errorEl.textContent = '';
  render();
  panel.style.display = 'flex';
}

closeBtn.addEventListener('click', () => {
  panel.style.display = 'none';
});

onEconomyChange(() => {
  if (panel.style.display === 'flex') render();
});
