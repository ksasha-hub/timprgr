const $ = (id) => document.getElementById(id);

function normalizeCode(s) {
  return (s || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9-]/g, '');
}

function randomDigits(n) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < n; i++) out += String(bytes[i] % 10);
  return out;
}

function generateCode() {
  // 9 digits grouped: xxx-xxx-xxx
  return `${randomDigits(3)}-${randomDigits(3)}-${randomDigits(3)}`;
}

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
  const c = normalizeCode(code);
  if (!c) {
    showError('Введите код комнаты.');
    return;
  }
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
