import Phaser from 'phaser';
import { TownScene } from './scenes/TownScene';
import { UIScene } from './scenes/UIScene';
import { session } from './session';
import { initChat } from './ui/chat';
import { openWardrobe, wardrobe } from './ui/wardrobe';
import { initHud } from './ui/hud';
import { openShop } from './ui/shop';
import { loadSpriteLayers } from './avatar/sprites';
import { loadPets, pets } from './pets/pets';
import { openPets } from './ui/petsPanel';
import { openFriends, startFriendRequestChecks } from './ui/friendsPanel';
import { isSupabaseConfigured } from './supabase';
import {
  MIN_PASSWORD_LENGTH,
  USERNAME_PATTERN,
  getCurrentProfile,
  logIn,
  logOut,
  signUp,
} from './auth';
import type { Profile } from './auth';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const authPanel = $('auth');
const authForm = $<HTMLFormElement>('auth-form');
const tabLogin = $<HTMLButtonElement>('tab-login');
const tabSignup = $<HTMLButtonElement>('tab-signup');
const usernameInput = $<HTMLInputElement>('auth-username');
const passwordInput = $<HTMLInputElement>('auth-password');
const password2Input = $<HTMLInputElement>('auth-password2');
const errorText = $('auth-error');
const submitBtn = $<HTMLButtonElement>('auth-submit');
const chatBar = $('chat');
const topbar = $('topbar');
const logoutBtn = $<HTMLButtonElement>('logout');
const wardrobeBtn = $<HTMLButtonElement>('wardrobe-btn');
const shopBtn = $<HTMLButtonElement>('shop-btn');

let mode: 'login' | 'signup' = 'login';

function setMode(next: 'login' | 'signup'): void {
  mode = next;
  tabLogin.classList.toggle('active', mode === 'login');
  tabSignup.classList.toggle('active', mode === 'signup');
  password2Input.style.display = mode === 'signup' ? '' : 'none';
  passwordInput.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  submitBtn.textContent = mode === 'signup' ? 'Create account' : 'Log in';
  errorText.textContent = '';
}

// The game can't start on a 0x0 screen (e.g. a page loaded in a hidden tab):
// wait until the game area actually has a size.
function whenGameAreaHasSize(): Promise<void> {
  const el = document.getElementById('game')!;
  const ready = () => el.clientWidth > 0 && el.clientHeight > 0 && !document.hidden;
  if (ready()) return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if (!ready()) return;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      resolve();
    };
    const timer = window.setInterval(check, 250);
    document.addEventListener('visibilitychange', check);
  });
}

function startGame(): void {
  void whenGameAreaHasSize().then(createGame);
}

function createGame(): void {
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#1d2b1d',
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: 'arcade',
      arcade: { debug: false },
    },
    input: { activePointers: 3 },
    scene: [TownScene, UIScene],
  });
}

async function enterGame(profile: Profile): Promise<void> {
  // Character art must be loaded before the game or wardrobe draws anyone
  await loadSpriteLayers();
  session.name = profile.username;
  session.avatar = profile.avatar;
  authPanel.style.display = 'none';
  chatBar.style.display = 'flex';
  topbar.style.display = 'flex';
  initChat();
  startGame();
  void initHud();
  // First visit: design your character, then pick a starter pet
  if (profile.isNew) openWardrobe(session.avatar, true);
  startFriendRequestChecks();
  void loadPets()
    .then(() => {
      if (pets.list.length > 0) return;
      if (profile.isNew) wardrobe.onClosed = openPets;
      else openPets();
    })
    .catch((err) => console.error('Could not load pets', err));
}

tabLogin.addEventListener('click', () => setMode('login'));
tabSignup.addEventListener('click', () => setMode('signup'));

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!USERNAME_PATTERN.test(username)) {
    errorText.textContent = 'Username must be 3-16 letters, numbers, or underscores.';
    return;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    errorText.textContent = 'Password must be at least ' + MIN_PASSWORD_LENGTH + ' characters.';
    return;
  }
  if (mode === 'signup' && password !== password2Input.value) {
    errorText.textContent = 'Passwords do not match.';
    return;
  }

  errorText.textContent = '';
  submitBtn.disabled = true;
  try {
    const profile =
      mode === 'signup' ? await signUp(username, password) : await logIn(username, password);
    await enterGame(profile);
  } catch (err) {
    errorText.textContent = (err as Error).message;
  } finally {
    submitBtn.disabled = false;
  }
});

wardrobeBtn.addEventListener('click', () => openWardrobe(session.avatar));
shopBtn.addEventListener('click', () => openShop());
document.getElementById('pets-btn')!.addEventListener('click', () => openPets());
document.getElementById('friends-btn')!.addEventListener('click', () => openFriends());

logoutBtn.addEventListener('click', async () => {
  await logOut();
  window.location.reload();
});

async function init(): Promise<void> {
  // Tell the page's safety check that the app started
  (window as unknown as { __dcStarted?: () => void }).__dcStarted?.();
  authPanel.style.display = 'flex';

  if (!isSupabaseConfigured) {
    errorText.textContent =
      'Missing Supabase settings. Create client/.env (see .env.example) and restart npm run dev.';
    submitBtn.disabled = true;
    return;
  }

  // Already logged in from a previous visit? Go straight into the game.
  try {
    const existing = await getCurrentProfile();
    if (existing) await enterGame(existing);
  } catch (err) {
    console.error(err);
  }
}

void init();
