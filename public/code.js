const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const MIN_ROOM_CODE_LENGTH = 16;
const MAX_ROOM_CODE_LENGTH = 20;
const ROOM_CODE_LENGTH = 16;
const ROOM_CODE_GROUP_SIZE = 4;

const AMBIGUOUS_CHAR_MAP = {
  O: '0',
  I: '1',
  L: '1'
};

function formatRoomCode(raw) {
  return raw.match(new RegExp(`.{1,${ROOM_CODE_GROUP_SIZE}}`, 'g'))?.join('-') || raw;
}

export function normalizeCode(value) {
  const compact = (value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');

  let normalized = '';
  for (const char of compact) {
    const mapped = AMBIGUOUS_CHAR_MAP[char] || char;
    if (CROCKFORD_ALPHABET.includes(mapped)) {
      normalized += mapped;
    }
  }

  return normalized.slice(0, MAX_ROOM_CODE_LENGTH);
}

export function normalizeDisplayCode(value) {
  return formatRoomCode(normalizeCode(value));
}

export function isValidCode(value) {
  const normalized = normalizeCode(value);
  return normalized.length >= MIN_ROOM_CODE_LENGTH && normalized.length <= MAX_ROOM_CODE_LENGTH;
}

export function generateCode(length = ROOM_CODE_LENGTH) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  let raw = '';
  for (const byte of bytes) {
    raw += CROCKFORD_ALPHABET[byte % CROCKFORD_ALPHABET.length];
  }

  return formatRoomCode(raw);
}
