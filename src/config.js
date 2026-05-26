import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readNumber(name, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  const value = raw == null || raw === '' ? fallback : Number(raw);

  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid numeric environment variable: ${name}`);
  }

  return value;
}

function readTrustProxy(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;

  const numeric = Number(raw);
  if (Number.isInteger(numeric) && numeric >= 0) {
    return numeric;
  }

  throw new Error(`Invalid trust proxy value: ${name}`);
}

export const config = Object.freeze({
  port: readNumber('PORT', 3000, { min: 1, max: 65535 }),
  roomTtlMs: readNumber('ROOM_TTL_MS', 60 * 60 * 1000, { min: 1_000 }),
  cleanupIntervalMs: readNumber('CLEANUP_INTERVAL_MS', 60 * 1000, { min: 1_000 }),
  trustProxy: readTrustProxy('TRUST_PROXY', 1),
  joinRateLimitWindowMs: readNumber('JOIN_RATE_LIMIT_WINDOW_MS', 60 * 1000, { min: 1_000 }),
  joinRateLimitMaxAttempts: readNumber('JOIN_RATE_LIMIT_MAX_ATTEMPTS', 20, { min: 1 }),
  maxWsFrameBytes: readNumber('MAX_WS_FRAME_BYTES', 16 * 1024, { min: 1_024 }),
  maxMessageBytes: readNumber('MAX_MESSAGE_BYTES', 4 * 1024, { min: 1, max: 64 * 1024 }),
  staticDir: path.join(__dirname, '..', 'public')
});
