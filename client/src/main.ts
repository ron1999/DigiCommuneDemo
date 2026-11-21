import Phaser from 'phaser';
import { TownScene } from './scenes/TownScene';
import { UIScene } from './scenes/UIScene';
import { session } from './session';
import { initChat } from './ui/chat';
import { isSupabaseConfigured } from './supabase';
import {
  MIN_PASSWORD_LENGTH,
  USERNAME_PATTERN,
  getCurrentUsername,
  logIn,
  logOut,
  signUp,
} from './auth';

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
const logoutBtn = $<HTMLButtonElement>('logout');

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

function startGame(): void {
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

function enterGame(username: string): void {
  session.name = username;
  authPanel.style.display = 'none';
  chatBar.style.display = 'flex';
  logoutBtn.style.display = 'block';
  initChat();
  startGame();
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
    const name = mode === 'signup' ? await signUp(username, password) : await logIn(username, password);
    enterGame(name);
  } catch (err) {
    errorText.textContent = (err as Error).message;
  } finally {
    submitBtn.disabled = false;
  }
});

logoutBtn.addEventListener('click', async () => {
  await logOut();
  window.location.reload();
});

async function init(): Promise<void> {
  authPanel.style.display = 'flex';

  if (!isSupabaseConfigured) {
    errorText.textContent =
      'Missing Supabase settings. Create client/.env (see .env.example) and restart npm run dev.';
    submitBtn.disabled = true;
    return;
  }

  // Already logged in from a previous visit? Go straight into the game.
  try {
    const existing = await getCurrentUsername();
    if (existing) enterGame(existing);
  } catch (err) {
    console.error(err);
  }
}

void init();
