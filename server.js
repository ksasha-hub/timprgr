import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = Number(process.env.PORT || 3000);
const ROOM_TTL_MS = Number(process.env.ROOM_TTL_MS || 60 * 60 * 1000);
const CLEANUP_INTERVAL_MS = Number(process.env.CLEANUP_INTERVAL_MS || 60 * 1000);

app.use(express.json({ limit: '200kb' }));

// Static frontend
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-store');
  }
}));

app.get('/healthz', (req, res) => {
  res.json({ ok: true });
});

const server = http.createServer(app);

/**
 * Room model (in memory)
 * roomId -> { createdAt, lastActivity, destroyed, sockets:Set<WebSocket> }
 */
const rooms = new Map();

function now() {
  return Date.now();
}

function cleanupRooms() {
  const t = now();
  for (const [roomId, room] of rooms.entries()) {
    const age = t - room.createdAt;
    const idle = t - room.lastActivity;

    if (room.destroyed || room.sockets.size === 0) {
      rooms.delete(roomId);
      continue;
    }

    if (age > ROOM_TTL_MS || idle > ROOM_TTL_MS) {
      // notify participants that room expired
      for (const ws of room.sockets) {
        try {
          ws.send(JSON.stringify({ type: 'error', code: 'ROOM_EXPIRED', message: 'Room expired.' }));
          ws.close();
        } catch {
          // ignore
        }
      }
      room.destroyed = true;
      rooms.delete(roomId);
    }
  }
}

setInterval(cleanupRooms, CLEANUP_INTERVAL_MS).unref();

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function broadcast(room, data, exceptWs = null) {
  const payload = JSON.stringify(data);
  for (const ws of room.sockets) {
    if (ws === exceptWs) continue;
    if (ws.readyState === ws.OPEN) {
      ws.send(payload);
    }
  }
}

wss.on('connection', (ws) => {
  ws._roomId = null;

  ws.on('message', (buf) => {
    const msg = safeJsonParse(buf.toString('utf8'));
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'join') {
      const roomId = msg.roomId;
      if (typeof roomId !== 'string' || roomId.length < 16 || roomId.length > 128) {
        ws.send(JSON.stringify({ type: 'error', code: 'BAD_ROOM', message: 'Invalid room.' }));
        return;
      }

      // If already joined, ignore
      if (ws._roomId) return;

      let room = rooms.get(roomId);
      if (!room) {
        room = {
          createdAt: now(),
          lastActivity: now(),
          destroyed: false,
          sockets: new Set()
        };
        rooms.set(roomId, room);
      }

      if (room.destroyed) {
        ws.send(JSON.stringify({ type: 'error', code: 'ROOM_DESTROYED', message: 'Room destroyed.' }));
        return;
      }

      if (room.sockets.size >= 2) {
        ws.send(JSON.stringify({ type: 'error', code: 'ROOM_FULL', message: 'Room is full.' }));
        return;
      }

      ws._roomId = roomId;
      room.sockets.add(ws);
      room.lastActivity = now();

      ws.send(JSON.stringify({ type: 'joined', roomId }));

      // notify others
      broadcast(room, { type: 'peer-joined' }, ws);
      return;
    }

    const roomId = ws._roomId;
    if (!roomId) {
      ws.send(JSON.stringify({ type: 'error', code: 'NOT_JOINED', message: 'Join first.' }));
      return;
    }

    const room = rooms.get(roomId);
    if (!room || room.destroyed) {
      ws.send(JSON.stringify({ type: 'error', code: 'ROOM_GONE', message: 'Room is gone.' }));
      return;
    }

    room.lastActivity = now();

    // Relay only allowed message types
    if (msg.type === 'hello' || msg.type === 'msg' || msg.type === 'leave') {
      broadcast(room, msg, ws);

      if (msg.type === 'leave') {
        // Sender is leaving
        try { ws.close(); } catch {}
      }

      return;
    }

    ws.send(JSON.stringify({ type: 'error', code: 'BAD_TYPE', message: 'Unsupported message type.' }));
  });

  ws.on('close', () => {
    const roomId = ws._roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    room.sockets.delete(ws);
    room.lastActivity = now();

    // Notify remaining participant
    broadcast(room, { type: 'peer-left' }, ws);

    if (room.sockets.size === 0) {
      room.destroyed = true;
      rooms.delete(roomId);
    }
  });
});

server.listen(PORT, () => {
  // Intentionally minimal logging (no payloads)
  console.log(`Server listening on http://localhost:${PORT}`);
});
