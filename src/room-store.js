export class RoomStore {
  constructor({ ttlMs, now = Date.now }) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.rooms = new Map();
    this.destroyedRoomIds = new Map();
  }

  pruneDestroyed() {
    const current = this.now();
    for (const [roomId, expiresAt] of this.destroyedRoomIds.entries()) {
      if (expiresAt <= current) {
        this.destroyedRoomIds.delete(roomId);
      }
    }
  }

  isDestroyed(roomId) {
    this.pruneDestroyed();
    return this.destroyedRoomIds.has(roomId);
  }

  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  createRoom(roomId) {
    const current = this.now();
    const room = {
      createdAt: current,
      lastActivity: current,
      sockets: new Set()
    };

    this.rooms.set(roomId, room);
    return room;
  }

  touch(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.lastActivity = this.now();
    return room;
  }

  destroyRoom(roomId, reason = 'destroyed') {
    const room = this.rooms.get(roomId) || null;
    if (room) {
      this.rooms.delete(roomId);
    }

    this.destroyedRoomIds.set(roomId, this.now() + this.ttlMs);
    return room ? { roomId, room, reason } : null;
  }

  removeSocket(roomId, ws) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { room: null, destroyed: null };
    }

    room.sockets.delete(ws);
    room.lastActivity = this.now();

    if (room.sockets.size === 0) {
      return { room: null, destroyed: this.destroyRoom(roomId, 'empty') };
    }

    return { room, destroyed: null };
  }

  cleanupExpiredRooms() {
    this.pruneDestroyed();

    const current = this.now();
    const expired = [];

    for (const [roomId, room] of this.rooms.entries()) {
      const age = current - room.createdAt;
      const idle = current - room.lastActivity;
      if (age > this.ttlMs || idle > this.ttlMs) {
        const destroyed = this.destroyRoom(roomId, 'ttl');
        if (destroyed) {
          expired.push(destroyed);
        }
      }
    }

    return expired;
  }

  getStats() {
    this.pruneDestroyed();
    return {
      activeRooms: this.rooms.size,
      destroyedRoomIds: this.destroyedRoomIds.size
    };
  }
}
