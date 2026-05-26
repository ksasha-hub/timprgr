import test from 'node:test';
import assert from 'node:assert/strict';

import { RoomStore } from '../src/room-store.js';

test('destroyed rooms cannot be recreated until the TTL expires', () => {
  let currentTime = 1_000;
  const roomStore = new RoomStore({
    ttlMs: 5_000,
    now: () => currentTime
  });

  const roomId = 'a'.repeat(64);

  roomStore.createRoom(roomId);
  roomStore.destroyRoom(roomId, 'empty');

  assert.equal(roomStore.isDestroyed(roomId), true);
  assert.equal(roomStore.getRoom(roomId), null);

  currentTime += 4_999;
  assert.equal(roomStore.isDestroyed(roomId), true);

  currentTime += 2;
  assert.equal(roomStore.isDestroyed(roomId), false);
});

test('cleanup removes expired rooms and tracks them as destroyed for the TTL window', () => {
  let currentTime = 10_000;
  const roomStore = new RoomStore({
    ttlMs: 1_000,
    now: () => currentTime
  });

  const roomId = 'b'.repeat(64);
  const room = roomStore.createRoom(roomId);
  room.sockets.add({ id: 1 });

  currentTime += 1_500;

  const expiredRooms = roomStore.cleanupExpiredRooms();

  assert.equal(expiredRooms.length, 1);
  assert.equal(expiredRooms[0].roomId, roomId);
  assert.equal(expiredRooms[0].reason, 'ttl');
  assert.equal(roomStore.getRoom(roomId), null);
  assert.equal(roomStore.isDestroyed(roomId), true);
});

test('removing the final socket destroys the room immediately', () => {
  const roomStore = new RoomStore({ ttlMs: 1_000 });
  const roomId = 'c'.repeat(64);
  const socket = { id: 1 };
  const room = roomStore.createRoom(roomId);
  room.sockets.add(socket);

  const result = roomStore.removeSocket(roomId, socket);

  assert.equal(result.room, null);
  assert.equal(result.destroyed?.roomId, roomId);
  assert.equal(result.destroyed?.reason, 'empty');
  assert.equal(roomStore.getRoom(roomId), null);
  assert.equal(roomStore.isDestroyed(roomId), true);
});
