import { isValidCode, normalizeDisplayCode } from './code.js';

const MAX_MESSAGE_BYTES = 4 * 1024;
const $ = (id) => document.getElementById(id);

function getCodeFromHash() {
  const h = new URLSearchParams((location.hash || '').replace(/^#/, ''));
  return h.get('code') || '';
}

function utf8ToBytes(s) {
  return new TextEncoder().encode(s);
}

function bytesToUtf8(b) {
  return new TextDecoder().decode(b);
}

function b64encode(bytes) {
  let s = '';
  for (const ch of bytes) s += String.fromCharCode(ch);
  return btoa(s);
}

function b64decode(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256Hex(s) {
  const digest = await crypto.subtle.digest('SHA-256', utf8ToBytes(s));
  const b = new Uint8Array(digest);
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function hkdfKey(sharedSecretRaw, saltBytes) {
  const ikm = await crypto.subtle.importKey('raw', sharedSecretRaw, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: saltBytes,
      info: utf8ToBytes('one-time-room-v1')
    },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function generateEcdh() {
  // P-256 is broadly supported by WebCrypto.
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
}

async function exportPubJwk(keyPair) {
  return crypto.subtle.exportKey('jwk', keyPair.publicKey);
}

async function importPeerPubJwk(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

async function deriveSharedBits(myKeyPair, peerPubKey) {
  return crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerPubKey },
    myKeyPair.privateKey,
    256
  );
}

function setStatus(text) {
  $('status').textContent = text;
}

function addMessage({ who, text, kind = 'msg' }) {
  const wrap = document.createElement('div');
  wrap.className = `bubble ${who}`;
  if (kind !== 'msg') wrap.classList.add('system');
  wrap.textContent = text;
  $('messages').appendChild(wrap);
  $('messages').scrollTop = $('messages').scrollHeight;
}

async function encryptText(aesKey, plaintext) {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    utf8ToBytes(plaintext)
  );
  return {
    nonce: b64encode(iv),
    ciphertext: b64encode(new Uint8Array(ct))
  };
}

async function decryptText(aesKey, nonceB64, ciphertextB64) {
  const iv = b64decode(nonceB64);
  const ct = b64decode(ciphertextB64);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    ct
  );
  return bytesToUtf8(new Uint8Array(pt));
}

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

(async function main() {
  const code = normalizeDisplayCode(getCodeFromHash());
  if (!isValidCode(code)) {
    location.href = '/';
    return;
  }

  $('roomLabel').textContent = code;

  const roomId = await sha256Hex(`room:${code}`);
  const salt = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8ToBytes(`salt:${code}`)));

  const myKeys = await generateEcdh();
  const myPub = await exportPubJwk(myKeys);

  let aesKey = null;
  let peerPub = null;
  let joined = false;
  let peerJoined = false;

  const ws = new WebSocket(wsUrl());

  function send(obj) {
    if (ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(obj));
    return true;
  }

  ws.addEventListener('open', () => {
    send({ type: 'join', roomId });
  });

  ws.addEventListener('message', async (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }

    if (msg.type === 'error') {
      setStatus(`Ошибка: ${msg.message || msg.code}`);
      addMessage({ who: 'sys', text: `Ошибка: ${msg.message || msg.code}`, kind: 'sys' });
      return;
    }

    if (msg.type === 'joined') {
      joined = true;
      setStatus('Ожидание второго участника…');
      addMessage({ who: 'sys', text: 'Вы вошли в комнату. Ожидание второго участника…', kind: 'sys' });
      // announce ourselves
      send({ type: 'hello', pub: myPub });
      return;
    }

    if (msg.type === 'peer-joined') {
      peerJoined = true;
      setStatus('Участник подключился. Идёт обмен ключами…');
      addMessage({ who: 'sys', text: 'Участник подключился.', kind: 'sys' });
      // re-send hello to ensure peer gets it
      send({ type: 'hello', pub: myPub });
      return;
    }

    if (msg.type === 'hello') {
      if (!msg.pub) return;
      peerPub = await importPeerPubJwk(msg.pub);
      const shared = await deriveSharedBits(myKeys, peerPub);
      aesKey = await hkdfKey(shared, salt);
      setStatus('Защищённое соединение установлено.');
      addMessage({ who: 'sys', text: 'Шифрование установлено. Можно писать.', kind: 'sys' });
      return;
    }

    if (msg.type === 'msg') {
      if (!aesKey) {
        addMessage({ who: 'sys', text: 'Получено сообщение до установки ключа (игнор).', kind: 'sys' });
        return;
      }
      try {
        const text = await decryptText(aesKey, msg.nonce, msg.ciphertext);
        addMessage({ who: 'peer', text });
      } catch {
        addMessage({ who: 'sys', text: 'Не удалось расшифровать сообщение.', kind: 'sys' });
      }
      return;
    }

    if (msg.type === 'peer-left') {
      setStatus('Участник вышел. Комната будет уничтожена когда вы выйдете.');
      addMessage({ who: 'sys', text: 'Участник вышел.', kind: 'sys' });
      return;
    }
  });

  ws.addEventListener('close', () => {
    setStatus('Соединение закрыто.');
  });

  $('msgIn').maxLength = MAX_MESSAGE_BYTES;

  async function sendMessage() {
    const text = ($('msgIn').value || '').trim();
    if (!text) return;
    if (!joined) return;

    if (utf8ToBytes(text).length > MAX_MESSAGE_BYTES) {
      addMessage({ who: 'sys', text: 'Сообщение слишком длинное.', kind: 'sys' });
      return;
    }

    if (!aesKey) {
      addMessage({ who: 'sys', text: 'Ожидаем установку шифрования…', kind: 'sys' });
      return;
    }

    const enc = await encryptText(aesKey, text);
    send({ type: 'msg', ...enc });
    addMessage({ who: 'me', text });
    $('msgIn').value = '';
  }

  $('sendBtn').addEventListener('click', sendMessage);
  $('msgIn').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  function leave() {
    try {
      send({ type: 'leave' });
    } catch {}
    try { ws.close(); } catch {}
    // wipe hash so code isn't left around
    history.replaceState(null, '', '/');
    location.href = '/';
  }

  $('leaveBtn').addEventListener('click', leave);

  // If user closes tab
  window.addEventListener('beforeunload', () => {
    try { send({ type: 'leave' }); } catch {}
  });
})();
