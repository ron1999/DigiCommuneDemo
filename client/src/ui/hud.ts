import { canClaimToday, claimDaily, economy, loadEconomy, onEconomyChange } from '../economy';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const coinsEl = $('coins');
const claimBtn = $<HTMLButtonElement>('claim-btn');
const toastEl = $('toast');

let toastTimer: number | undefined;

export function toast(message: string): void {
  toastEl.textContent = message;
  toastEl.style.display = 'block';
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.style.display = 'none';
  }, 3500);
}

function render(): void {
  const s = economy.state;
  // The coin icon comes from CSS (#coins::before), so only the number goes here
  coinsEl.textContent = s ? s.balance.toLocaleString('en-US') : '...';
  coinsEl.title = 'Coins';
  claimBtn.style.display = canClaimToday() ? 'inline-block' : 'none';
}

claimBtn.addEventListener('click', async () => {
  claimBtn.disabled = true;
  try {
    const r = await claimDaily();
    if (r.claimed) {
      toast('+' + r.amount + ' coins! Day ' + r.streak + ' in a row.');
    } else {
      toast('Already claimed today. Come back tomorrow!');
    }
  } catch (err) {
    toast((err as Error).message);
  } finally {
    claimBtn.disabled = false;
  }
});

export async function initHud(): Promise<void> {
  onEconomyChange(render);
  render();
  window.setInterval(render, 60000); // so the button reappears when a new day starts

  try {
    await loadEconomy();
    if (canClaimToday()) toast('Your daily reward is ready!');
  } catch (err) {
    toast('Could not load your coins: ' + (err as Error).message);
  }
}
