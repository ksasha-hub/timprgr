import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';

import { config } from './config.js';
import { getClientIp } from './ip.js';
import { logger } from './logger.js';
import { createFixedWindowRateLimiter } from './rate-limiter.js';
import { RoomStore } from './room-store.js';
import { validateClientMessage } from './validation.js';

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function roomRef(roomId) {
  return typeof roomId === 'string' ? roomId.slice(0, 12) : undefined;
}

function sendJson(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function broadcast(room, payload, exceptWs = null) {
  const serialized = JSON.stringify(payload);
  for (const peer of room.sockets) {
    if (peer === exceptWs || peer.readyState !== WebSocket.OPEN) continue;
    peer.send(serialized);
  }
}

function applySecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'");
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}

export function createServerApp() {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    applySecurityHeaders(res);
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  app.use(express.static(config.staticDir, {
    setHeaders(res) {
      applySecurityHeaders(res);
    }
  }));

  const roomStore = new RoomStore({ ttlMs: config.roomTtlMs });
  const joinRateLimiter = createFixedWindowRateLimiter({
    windowMs: config.joinRateLimitWindowMs,
    maxAttempts: config.joinRateLimitMaxAttempts
  });

  app.get('/healthz', (req, res) => {
    res.json({ ok: true });
  });

  app.get('/readyz', (req, res) => {
    res.json({ ok: true, ...roomStore.getStats() });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: config.maxWsFrameBytes
  });

  function rejectMessage(ws, { code, message }, meta = {}) {
    sendJson(ws, { type: 'error', code, message });
    logger.warn('ws_rejected', { code, ...meta });
  }

  function expireRoom(destroyedRoom) {
    if (!destroyedRoom) return;

    logger.info('room_destroyed', {
      roomId: roomRef(destroyedRoom.roomId),
      reason: destroyedRoom.reason
    });

    for (const peer of destroyedRoom.room.sockets) {
      sendJson(peer, {
        type: 'error',
        code: 'ROOM_EXPIRED',
        message: 'Room expired.'
      });
      try {
        peer.close(1000, 'Room expired');
      } catch {
        // ignore socket close errors
      }
    }
  }

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws, req) => {
    ws._roomId = null;
    ws._clientIp = getClientIp(req, config.trustProxy);

    logger.info('ws_connected', { ip: ws._clientIp });

    ws.on('message', (buf, isBinary) => {
      if (isBinary) {
        rejectMessage(ws, { code: 'BAD_MESSAGE', message: 'Binary frames are not supported.' }, { ip: ws._clientIp });
        return;
      }

      const raw = buf.toString('utf8');
      const message = safeJsonParse(raw);
      const validation = validateClientMessage(message, { maxMessageBytes: config.maxMessageBytes });
      if (!validation.ok) {
        rejectMessage(ws, validation, {
          ip: ws._clientIp,
          roomId: roomRef(ws._roomId)
        });
        return;
      }

      if (message.type === 'join') {
        const rateLimit = joinRateLimiter.hit(ws._clientIp);
        if (!rateLimit.allowed) {
          rejectMessage(ws, {
            code: 'RATE_LIMITED',
            message: 'Too many join attempts. Please try again later.'
          }, {
            ip: ws._clientIp,
            retryAfterMs: rateLimit.retryAfterMs
          });
          return;
        }

        if (ws._roomId) {
          return;
        }

        const roomId = message.roomId;
        if (roomStore.isDestroyed(roomId)) {
          rejectMessage(ws, {
            code: 'ROOM_DESTROYED',
            message: 'Room destroyed.'
          }, {
            ip: ws._clientIp,
            roomId: roomRef(roomId)
          });
          return;
        }

        let room = roomStore.getRoom(roomId);
        if (!room) {
          room = roomStore.createRoom(roomId);
          logger.info('room_created', { roomId: roomRef(roomId), ip: ws._clientIp });
        }

        if (room.sockets.size >= 2) {
          rejectMessage(ws, {
            code: 'ROOM_FULL',
            message: 'Room is full.'
          }, {
            ip: ws._clientIp,
            roomId: roomRef(roomId)
          });
          return;
        }

        ws._roomId = roomId;
        room.sockets.add(ws);
        room.lastActivity = Date.now();

        sendJson(ws, { type: 'joined', roomId });
        broadcast(room, { type: 'peer-joined' }, ws);

        logger.info('room_joined', {
          ip: ws._clientIp,
          roomId: roomRef(roomId),
          participants: room.sockets.size
        });

        return;
      }

      if (!ws._roomId) {
        rejectMessage(ws, {
          code: 'NOT_JOINED',
          message: 'Join first.'
        }, {
          ip: ws._clientIp
        });
        return;
      }

      const room = roomStore.getRoom(ws._roomId);
      if (!room) {
        rejectMessage(ws, {
          code: 'ROOM_GONE',
          message: 'Room is gone.'
        }, {
          ip: ws._clientIp,
          roomId: roomRef(ws._roomId)
        });
        return;
      }

      room.lastActivity = Date.now();

      if (message.type === 'hello' || message.type === 'msg') {
        broadcast(room, message, ws);
        logger.info('ws_relayed', {
          type: message.type,
          ip: ws._clientIp,
          roomId: roomRef(ws._roomId)
        });
        return;
      }

      if (message.type === 'leave') {
        logger.info('room_leave_requested', {
          ip: ws._clientIp,
          roomId: roomRef(ws._roomId)
        });
        try {
          ws.close(1000, 'Client left');
        } catch {
          // ignore socket close errors
        }
      }
    });

    ws.on('close', () => {
      if (!ws._roomId) return;

      const currentRoomId = ws._roomId;
      const { room, destroyed } = roomStore.removeSocket(currentRoomId, ws);

      if (room) {
        broadcast(room, { type: 'peer-left' }, ws);
      }

      logger.info('ws_closed', {
        ip: ws._clientIp,
        roomId: roomRef(currentRoomId),
        participants: room ? room.sockets.size : 0
      });

      if (destroyed) {
        logger.info('room_destroyed', {
          roomId: roomRef(destroyed.roomId),
          reason: destroyed.reason
        });
      }

      ws._roomId = null;
    });

    ws.on('error', (error) => {
      logger.warn('ws_error', {
        ip: ws._clientIp,
        roomId: roomRef(ws._roomId),
        error: error.message
      });
    });
  });

  const cleanupTimer = setInterval(() => {
    const expiredRooms = roomStore.cleanupExpiredRooms();
    for (const expiredRoom of expiredRooms) {
      expireRoom(expiredRoom);
    }
  }, config.cleanupIntervalMs);
  cleanupTimer.unref();

  return { app, server, roomStore };
}

export function startServer() {
  const { server } = createServerApp();
  server.listen(config.port, () => {
    logger.info('server_started', {
      port: config.port,
      trustProxy: config.trustProxy,
      maxWsFrameBytes: config.maxWsFrameBytes
    });
  });
}
