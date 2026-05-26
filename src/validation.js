const ROOM_ID_RE = /^[a-f0-9]{64}$/;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isBase64(value) {
  return typeof value === 'string' && value.length > 0 && BASE64_RE.test(value);
}

export function maxCiphertextLengthFor(maxMessageBytes) {
  // AES-GCM appends a 16-byte authentication tag; the result is then base64-encoded.
  return Math.ceil((maxMessageBytes + 16) / 3) * 4;
}

export function validateClientMessage(message, { maxMessageBytes }) {
  if (!isPlainObject(message) || typeof message.type !== 'string') {
    return { ok: false, code: 'BAD_MESSAGE', message: 'Invalid message payload.' };
  }

  switch (message.type) {
    case 'join':
      if (!ROOM_ID_RE.test(message.roomId || '')) {
        return { ok: false, code: 'BAD_ROOM', message: 'Invalid room.' };
      }
      return { ok: true };

    case 'hello': {
      const { pub } = message;
      if (!isPlainObject(pub)) {
        return { ok: false, code: 'BAD_HELLO', message: 'Invalid key exchange payload.' };
      }

      if (pub.kty !== 'EC' || pub.crv !== 'P-256' || typeof pub.x !== 'string' || typeof pub.y !== 'string') {
        return { ok: false, code: 'BAD_HELLO', message: 'Invalid key exchange payload.' };
      }

      if (typeof pub.d === 'string') {
        return { ok: false, code: 'BAD_HELLO', message: 'Invalid key exchange payload.' };
      }

      const serializedLength = JSON.stringify(pub).length;
      if (serializedLength > 512) {
        return { ok: false, code: 'BAD_HELLO', message: 'Invalid key exchange payload.' };
      }

      return { ok: true };
    }

    case 'msg': {
      const maxCiphertextLength = maxCiphertextLengthFor(maxMessageBytes);

      if (!isBase64(message.nonce) || message.nonce.length > 64) {
        return { ok: false, code: 'BAD_MESSAGE', message: 'Invalid encrypted message payload.' };
      }

      if (!isBase64(message.ciphertext) || message.ciphertext.length > maxCiphertextLength) {
        return { ok: false, code: 'BAD_MESSAGE', message: 'Invalid encrypted message payload.' };
      }

      return { ok: true };
    }

    case 'leave':
      return { ok: true };

    default:
      return { ok: false, code: 'BAD_TYPE', message: 'Unsupported message type.' };
  }
}
