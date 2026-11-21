// Connects the HTML chat bar to the game. Using a real HTML input means
// phone keyboards and copy/paste work properly.
const input = document.getElementById('chat-input') as HTMLInputElement;
const sendBtn = document.getElementById('chat-send') as HTMLButtonElement;

export const chat = {
  onSend: null as ((text: string) => void) | null,
  onFocusChange: null as ((focused: boolean) => void) | null,
};

function submit(): void {
  const text = input.value.trim();
  if (text) chat.onSend?.(text);
  input.value = '';
  input.blur();
}

export function initChat(): void {
  input.addEventListener('focus', () => chat.onFocusChange?.(true));
  input.addEventListener('blur', () => chat.onFocusChange?.(false));

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      input.blur();
    }
    // Keep typing keys (like W, A, S, D) away from the game
    e.stopPropagation();
  });

  sendBtn.addEventListener('click', submit);

  // Pressing Enter anywhere starts chatting
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
    }
  });
}
