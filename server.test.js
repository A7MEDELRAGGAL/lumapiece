import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unlink } from 'node:fs/promises';
import { createRoomServer, validatePublicHttpUrl } from './server.mjs';

let runtime;

afterEach(async () => {
  await runtime?.close();
  runtime = null;
});

const openSocket = (url) => new Promise((resolve, reject) => {
  const socket = new WebSocket(url);
  socket.once('open', () => resolve(socket));
  socket.once('error', reject);
});

const nextMessage = (socket) => new Promise((resolve, reject) => {
  const onMessage = (data) => {
    socket.off('error', onError);
    resolve(JSON.parse(data.toString()));
  };
  const onError = (error) => {
    socket.off('message', onMessage);
    reject(error);
  };
  socket.once('message', onMessage);
  socket.once('error', onError);
});

const nextMessages = (socket, count) => new Promise((resolve, reject) => {
  const messages = [];
  const onMessage = (data) => {
    messages.push(JSON.parse(data.toString()));
    if (messages.length === count) {
      socket.off('error', onError);
      resolve(messages);
    }
  };
  const onError = (error) => {
    socket.off('message', onMessage);
    reject(error);
  };
  socket.on('message', onMessage);
  socket.once('error', onError);
});

const engineStateFor = (pieceCount, moves = 0) => {
  const size = Math.sqrt(pieceCount);
  return {
    rows: size,
    cols: size,
    moves,
    boardWidth: 800,
    boardHeight: 600,
    pieces: Array.from({ length: pieceCount }, (_, id) => ({
      id,
      row: Math.floor(id / size),
      col: id % size,
      x: (id % size) * 200,
      y: Math.floor(id / size) * 200,
      normalizedX: ((id % size) * 200) / 800,
      normalizedY: (Math.floor(id / size) * 200) / 600,
      rotation: 0,
      groupId: id,
    })),
  };
};

describe('LumaPiece local room server', () => {
  it('exposes a health check and creates a validated room', async () => {
    runtime = createRoomServer({ port: 0 });
    const address = await runtime.start();
    const health = await fetch(`http://${address.host}:${address.port}/healthz`);
    expect(health.status).toBe(200);
    expect(health.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await health.json()).toMatchObject({ ok: true, service: 'lumapiece', rooms: 0 });

    const socket = await openSocket(`ws://${address.host}:${address.port}/ws`);
    socket.send(JSON.stringify({ type: 'create-room', nickname: 'Amina', puzzleId: 'sunrise', pieceCount: 16, difficulty: 'hard' }));
    const created = await nextMessage(socket);

    expect(created.type).toBe('room-created');
    expect(created.room.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(created.room.puzzleId).toBe('sunrise');
    expect(created.room.state.pieceCount).toBe(16);
    expect(created.room.state.difficulty).toBe('hard');
    socket.close();
  });

  it('rejects a state for another puzzle or a different piece count', async () => {
    runtime = createRoomServer({ port: 0 });
    const address = await runtime.start();
    const socket = await openSocket(`ws://${address.host}:${address.port}/ws`);
    socket.send(JSON.stringify({ type: 'create-room', nickname: 'Omar', puzzleId: 'coast', pieceCount: 9 }));
    const created = await nextMessage(socket);
    const invalidState = {
      puzzleId: 'forest',
      pieceCount: 16,
      moves: 1,
      elapsed: 3,
      engineState: { pieces: [] },
    };

    socket.send(JSON.stringify({ type: 'state', code: created.room.code, state: invalidState }));
    await expect(nextMessage(socket)).resolves.toMatchObject({ type: 'room-error', message: 'Invalid room state.' });
    socket.close();
  });

  it('broadcasts a valid state to every player in a room', async () => {
    runtime = createRoomServer({ port: 0 });
    const address = await runtime.start();
    const host = await openSocket(`ws://${address.host}:${address.port}/ws`);
    host.send(JSON.stringify({ type: 'create-room', nickname: 'Amina', puzzleId: 'sunrise', pieceCount: 9, difficulty: 'expert' }));
    const created = await nextMessage(host);
    const guest = await openSocket(`ws://${address.host}:${address.port}/ws`);

    const guestPresence = nextMessages(guest, 2);
    const hostPresence = nextMessage(host);
    guest.send(JSON.stringify({ type: 'join-room', nickname: 'Omar', code: created.room.code }));
    await expect(guestPresence).resolves.toEqual([
      expect.objectContaining({ type: 'room-joined' }),
      expect.objectContaining({ type: 'room-update' }),
    ]);
    await expect(hostPresence).resolves.toMatchObject({ type: 'room-update' });

    const state = { puzzleId: 'sunrise', pieceCount: 9, difficulty: 'expert', moves: 2, elapsed: 11, engineState: engineStateFor(9, 2) };
    const hostState = nextMessage(host);
    const guestState = nextMessage(guest);
    host.send(JSON.stringify({ type: 'state', code: created.room.code, state }));
    await expect(hostState).resolves.toMatchObject({ type: 'room-update', state });
    await expect(guestState).resolves.toMatchObject({ type: 'room-update', state });
    host.close();
    guest.close();
  });

  it('caps the number of active rooms', async () => {
    runtime = createRoomServer({ port: 0, maxRooms: 1 });
    const address = await runtime.start();
    const host = await openSocket(`ws://${address.host}:${address.port}/ws`);
    host.send(JSON.stringify({ type: 'create-room', nickname: 'Amina', puzzleId: 'sunrise', pieceCount: 9 }));
    await expect(nextMessage(host)).resolves.toMatchObject({ type: 'room-created' });

    const guest = await openSocket(`ws://${address.host}:${address.port}/ws`);
    guest.send(JSON.stringify({ type: 'create-room', nickname: 'Omar', puzzleId: 'coast', pieceCount: 9 }));
    await expect(nextMessage(guest)).resolves.toMatchObject({ type: 'room-error', message: 'The server is full. Try again in a moment.' });
    host.close();
    guest.close();
  });

  it('closes sockets that flood the room server', async () => {
    runtime = createRoomServer({ port: 0, rateLimit: { limit: 3, windowMs: 1000 } });
    const address = await runtime.start();
    const socket = await openSocket(`ws://${address.host}:${address.port}/ws`);
    const closed = new Promise((resolve) => socket.once('close', resolve));
    for (let index = 0; index < 6; index += 1) socket.send(JSON.stringify({ type: 'state', code: 'XXXXXX', state: {} }));
    await expect(closed).resolves.toBeDefined();
  });

  it('rejects resolve-image requests aimed at internal hosts', async () => {
    runtime = createRoomServer({ port: 0 });
    const address = await runtime.start();
    const response = await fetch(`http://${address.host}:${address.port}/api/resolve-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://localhost:5191/healthz' }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false });
  });

  it('accepts the expanded piece counts', async () => {
    runtime = createRoomServer({ port: 0 });
    const address = await runtime.start();
    for (const pieceCount of [60, 144]) {
      const socket = await openSocket(`ws://${address.host}:${address.port}/ws`);
      socket.send(JSON.stringify({ type: 'create-room', nickname: 'Amina', puzzleId: 'city', pieceCount }));
      await expect(nextMessage(socket)).resolves.toMatchObject({ type: 'room-created', room: { state: { pieceCount } } });
      socket.close();
    }
  });

  it('protects rooms with a password, names a host, and relays reactions', async () => {
    runtime = createRoomServer({ port: 0 });
    const address = await runtime.start();
    const host = await openSocket(`ws://${address.host}:${address.port}/ws`);
    host.send(JSON.stringify({ type: 'create-room', nickname: 'Amina', puzzleId: 'city', pieceCount: 9, password: 'shhh' }));
    const created = await nextMessage(host);
    expect(created.room.locked).toBe(true);
    expect(created.room.host).toBe('Amina');

    const stranger = await openSocket(`ws://${address.host}:${address.port}/ws`);
    stranger.send(JSON.stringify({ type: 'join-room', nickname: 'Omar', code: created.room.code }));
    await expect(nextMessage(stranger)).resolves.toMatchObject({ type: 'room-error', message: 'Wrong room password.' });
    stranger.close();

    const guest = await openSocket(`ws://${address.host}:${address.port}/ws`);
    const hostUpdate = nextMessage(host);
    const guestPresence = nextMessages(guest, 2);
    guest.send(JSON.stringify({ type: 'join-room', nickname: 'Omar', code: created.room.code, password: 'shhh' }));
    await expect(guestPresence).resolves.toEqual([
      expect.objectContaining({ type: 'room-joined' }),
      expect.objectContaining({ type: 'room-update' }),
    ]);
    await expect(hostUpdate).resolves.toMatchObject({ type: 'room-update', room: { host: 'Amina' } });

    const reaction = nextMessage(host);
    guest.send(JSON.stringify({ type: 'react', code: created.room.code, emoji: '🎉' }));
    await expect(reaction).resolves.toMatchObject({ type: 'reaction', from: 'Omar', emoji: '🎉' });

    const silence = Promise.race([
      nextMessage(host),
      new Promise((resolve) => setTimeout(() => resolve('silent'), 150)),
    ]);
    guest.send(JSON.stringify({ type: 'react', code: created.room.code, emoji: '<script>' }));
    await expect(silence).resolves.toBe('silent');
    host.close();
    guest.close();
  });

  it('serves a daily key and protects the admin API', async () => {
    runtime = createRoomServer({ port: 0, adminToken: 'secret' });
    const address = await runtime.start();
    const daily = await fetch(`http://${address.host}:${address.port}/api/daily`);
    const dailyPayload = await daily.json();
    expect(dailyPayload).toMatchObject({ ok: true });
    expect(Number.isInteger(dailyPayload.key)).toBe(true);

    const unauthorized = await fetch(`http://${address.host}:${address.port}/admin/rooms`);
    expect(unauthorized.status).toBe(401);
    const authorized = await fetch(`http://${address.host}:${address.port}/admin/rooms`, { headers: { Authorization: 'Bearer secret' } });
    expect(authorized.status).toBe(200);
    expect(await authorized.json()).toMatchObject({ ok: true, rooms: [] });
  });

  it('marks silent players as idle and closes rooms administratively', async () => {
    runtime = createRoomServer({ port: 0, idleWindowMs: 1, adminToken: 'secret' });
    const address = await runtime.start();
    const host = await openSocket(`ws://${address.host}:${address.port}/ws`);
    host.send(JSON.stringify({ type: 'create-room', nickname: 'Amina', puzzleId: 'sunrise', pieceCount: 9 }));
    const created = await nextMessage(host);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const guest = await openSocket(`ws://${address.host}:${address.port}/ws`);
    const joined = nextMessage(guest);
    guest.send(JSON.stringify({ type: 'join-room', nickname: 'Omar', code: created.room.code }));
    await expect(joined).resolves.toMatchObject({ type: 'room-joined', room: { players: [{ idle: true }, { idle: false }] } });
    await expect(nextMessage(host)).resolves.toMatchObject({ type: 'room-update' });

    const closed = nextMessage(host);
    const adminDelete = await fetch(`http://${address.host}:${address.port}/admin/rooms?code=${created.room.code}`, { method: 'DELETE', headers: { Authorization: 'Bearer secret' } });
    expect(adminDelete.status).toBe(200);
    await expect(closed).resolves.toMatchObject({ type: 'room-closed' });
    host.close();
    guest.close();
  });

  it('restores rooms from disk after a server restart', async () => {
    const roomsFile = path.join(tmpdir(), `lumapiece-rooms-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    runtime = createRoomServer({ port: 0, persistPath: roomsFile, persistDelayMs: 20 });
    const address = await runtime.start();
    const host = await openSocket(`ws://${address.host}:${address.port}/ws`);
    host.send(JSON.stringify({ type: 'create-room', nickname: 'Amina', puzzleId: 'sunrise', pieceCount: 9 }));
    const created = await nextMessage(host);
    await new Promise((resolve) => setTimeout(resolve, 120));
    await runtime.close();

    runtime = createRoomServer({ port: 0, persistPath: roomsFile, persistDelayMs: 20 });
    const restarted = await runtime.start();
    const guest = await openSocket(`ws://${restarted.host}:${restarted.port}/ws`);
    guest.send(JSON.stringify({ type: 'join-room', nickname: 'Omar', code: created.room.code }));
    await expect(nextMessage(guest)).resolves.toMatchObject({ type: 'room-joined', room: { state: { pieceCount: 9 } } });
    guest.close();
    await unlink(roomsFile).catch(() => {});
  });
});

describe('public URL validation for the image proxy', () => {
  it('accepts public http(s) URLs', () => {
    expect(validatePublicHttpUrl('https://example.com/cat.jpg')).toMatchObject({ ok: true });
    expect(validatePublicHttpUrl('http://example.com/cat.jpg?width=800')).toMatchObject({ ok: true });
  });

  it('rejects non-http protocols, internal hosts, and private addresses', () => {
    expect(validatePublicHttpUrl('ftp://example.com/cat.jpg').ok).toBe(false);
    expect(validatePublicHttpUrl('file:///etc/passwd').ok).toBe(false);
    expect(validatePublicHttpUrl('not a url').ok).toBe(false);
    expect(validatePublicHttpUrl('http://localhost/cat.jpg').ok).toBe(false);
    expect(validatePublicHttpUrl('http://box.internal/cat.jpg').ok).toBe(false);
    expect(validatePublicHttpUrl('http://host.docker.internal/cat.jpg').ok).toBe(false);
    expect(validatePublicHttpUrl('http://127.0.0.1/cat.jpg').ok).toBe(false);
    expect(validatePublicHttpUrl('http://10.0.0.5/cat.jpg').ok).toBe(false);
    expect(validatePublicHttpUrl('http://192.168.1.10/cat.jpg').ok).toBe(false);
    expect(validatePublicHttpUrl('http://169.254.169.254/latest/meta-data').ok).toBe(false);
    expect(validatePublicHttpUrl('http://172.16.0.9/cat.jpg').ok).toBe(false);
    expect(validatePublicHttpUrl('http://[::1]/cat.jpg').ok).toBe(false);
  });
});
