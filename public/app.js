import { generateCode, isValidCode, normalizeDisplayCode } from './code.js';

const $ = (id) => document.getElementById(id);

function showError(msg) {
  const el = $('err');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearError() {
  const el = $('err');
  el.textContent = '';
  el.classList.add('hidden');
}

function goToRoom(code) {
  if (!isValidCode(code)) {
    showError('Введите код комнаты в формате XXXX-XXXX-XXXX-XXXX.');
    return;
  }

  const c = normalizeDisplayCode(code);

  // keep code in hash (not sent to server by browser in request)
  location.href = `/room.html#code=${encodeURIComponent(c)}`;
}

$('createBtn').addEventListener('click', () => {
  clearError();
  const code = generateCode();
  $('codeOut').textContent = code;
  $('created').classList.remove('hidden');
});

$('copyBtn').addEventListener('click', async () => {
  const code = $('codeOut').textContent;
  await navigator.clipboard.writeText(code);
});

$('joinCreatedBtn').addEventListener('click', () => {
  goToRoom($('codeOut').textContent);
});

$('joinBtn').addEventListener('click', () => {
  clearError();
  goToRoom($('codeIn').value);
});

$('codeIn').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    clearError();
    goToRoom($('codeIn').value);
  }
});

$('codeIn').addEventListener('input', () => {
  $('codeIn').value = normalizeDisplayCode($('codeIn').value);
});
