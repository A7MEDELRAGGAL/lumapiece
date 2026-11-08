import http from 'node:http';
import { createHash } from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { readFile, rename, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(root, 'dist');
const allowedPieceCounts = new Set([9, 16, 25, 36, 60, 100, 144]);
const maxStateBytes = 256 * 1024;
const maxImageBytes = 10 * 1024 * 1024;
const maxBodyBytes = 64 * 1024;

function isPrivateIp(address) {
  if (net.isIPv4(address)) {
    const [first, second] = address.split('.').map(Number);
    if (first === 0 || first === 10 || first === 127) return true;
    if (first === 100 && second >= 64 && second <= 127) return true;
    if (first === 169 && second === 254) return true;
    if (first === 172 && second >= 16 && second <= 31) return true;
    if (first === 192 && second === 168) return true;
    if (first >= 224) return true;
    return false;
  }
  const lower = address.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) return true;
  if (lower.startsWith('::ffff:')) {
    const mapped = lower.slice('::ffff:'.length);
    if (net.isIPv4(mapped)) return isPrivateIp(mapped);
  }
  return false;
}

export function validatePublicHttpUrl(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    return { ok: false, reason: 'Invalid URL.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: 'Only http and https URLs are allowed.' };
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const blockedNames = new Set(['localhost', 'metadata.google.internal', 'host.docker.internal']);
  if (blockedNames.has(host) || host.endsWith('.local') || host.endsWith('.internal')) return { ok: false, reason: 'That host is not allowed.' };
  if (net.isIP(host)) {
    if (isPrivateIp(host)) return { ok: false, reason: 'That host is not allowed.' };
    return { ok: true, url: url.href, host };
  }
  return { ok: true, url: url.href, host };
}
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const portIndex = process.argv.indexOf('--port');
const defaultPort = Number(process.env.PORT || (portIndex >= 0 ? process.argv[portIndex + 1] : 5191));

const asNickname = (value) => String(value || 'Guest').trim().slice(0, 24) || 'Guest';
const asPuzzleId = (value) => String(value || '').trim().slice(0, 160);
const validPieceCount = (value) => allowedPieceCounts.has(Number(value));
const allowedDifficulties = new Set(['easy', 'medium', 'hard', 'expert']);
const allowedReactions = new Set(['👍', '🎉', '❤️', '😂', '😮', '👏']);
const hashPassword = (value) => (value ? createHash('sha256').update(String(value)).digest('hex') : null);
const validDifficulty = (value) => allowedDifficulties.has(String(value));
const roomCode = (rooms) => {
  let code = '';
  do code = Math.random().toString(36).slice(2, 8).toUpperCase(); while (rooms.has(code));
  return code;
};
const shuffledOrder = (count) => {
  const order = [...Array(count).keys()];
  for (let index = order.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [order[index], order[target]] = [order[target], order[index]];
  }
  return order;
};
const send = (client, payload) => client.readyState === 1 && client.send(JSON.stringify(payload));
const broadcast = (room, payload) => room.players.forEach((player) => send(player.socket, payload));
const publicRoom = (room, idleWindowMs = 180_000) => ({
  code: room.code,
  puzzleId: room.puzzleId,
  host: [...room.players.values()][0]?.nickname || null,
  locked: Boolean(room.password),
  players: [...room.players.values()].map(({ nickname, lastSeen }) => ({ nickname, idle: typeof lastSeen === 'number' && Date.now() - lastSeen > idleWindowMs })),
  state: room.state,
});

function validEngineState(engineState, pieceCount) {
  if (!engineState || typeof engineState !== 'object') return false;
  const rows = Number(engineState.rows);
  const cols = Number(engineState.cols);
  if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(cols) || cols < 1 || rows * cols !== pieceCount) return false;
  if (!Number.isFinite(engineState.boardWidth) || engineState.boardWidth <= 0 || !Number.isFinite(engineState.boardHeight) || engineState.boardHeight <= 0) return false;
  if (!Number.isInteger(engineState.moves) || engineState.moves < 0) return false;
  if (!Array.isArray(engineState.pieces) || engineState.pieces.length !== pieceCount) return false;
  const ids = new Set();
  return engineState.pieces.every((piece) => {
    const id = Number(piece.id);
    const row = Number(piece.row);
    const col = Number(piece.col);
    const groupId = Number(piece.groupId);
    if (!Number.isInteger(id) || id < 0 || id >= pieceCount || ids.has(id)) return false;
    ids.add(id);
    return Number.isInteger(row) && row >= 0 && row < rows
      && Number.isInteger(col) && col >= 0 && col < cols
      && Number.isFinite(piece.x) && Math.abs(piece.x) <= 1e7
      && Number.isFinite(piece.y) && Math.abs(piece.y) <= 1e7
      && Number.isFinite(piece.normalizedX) && Math.abs(piece.normalizedX) <= 1e5
      && Number.isFinite(piece.normalizedY) && Math.abs(piece.normalizedY) <= 1e5
      && Number.isFinite(piece.rotation) && piece.rotation >= 0 && piece.rotation < 360
      && Number.isInteger(groupId) && groupId >= 0 && groupId < pieceCount;
  });
}

function validState(state, room) {
  if (!state || typeof state !== 'object') return false;
  if (state.puzzleId !== room.puzzleId || Number(state.pieceCount) !== room.state.pieceCount || state.difficulty !== room.state.difficulty) return false;
  if (!validPieceCount(state.pieceCount) || !state.engineState) return false;
  if (!Number.isInteger(state.moves) || state.moves < 0 || !Number.isFinite(state.elapsed) || state.elapsed < 0) return false;
  if (JSON.stringify(state).length > maxStateBytes) return false;
  if (!validEngineState(state.engineState, Number(state.pieceCount))) return false;
  return state.engineState.moves === state.moves;
}

export function createRoomServer({
  port = defaultPort,
  host = process.env.HOST || '127.0.0.1',
  maxRooms = 200,
  rateLimit = { limit: 60, windowMs: 10_000 },
  adminToken = process.env.ADMIN_TOKEN || '',
  idleWindowMs = 180_000,
  persistPath = process.env.ROOMS_FILE || '',
  persistDelayMs = 400,
  roomTtlMs = 12 * 60 * 60 * 1000,
} = {}) {
  const rooms = new Map();
  const resolveSamples = new Map();
  let persistTimer = null;
  let closedServer = false;

  const persistNow = async () => {
    if (!persistPath || closedServer) return;
    const payload = {
      savedAt: Date.now(),
      rooms: [...rooms.values()].map((room) => ({ code: room.code, puzzleId: room.puzzleId, password: room.password, state: room.state, savedAt: Date.now() })),
    };
    try {
      await writeFile(`${persistPath}.tmp`, JSON.stringify(payload));
      await rename(`${persistPath}.tmp`, persistPath);
    } catch {
      // best-effort persistence; the in-memory map stays authoritative
    }
  };
  const schedulePersist = () => {
    if (!persistPath || closedServer || persistTimer) return;
    persistTimer = setTimeout(() => { persistTimer = null; persistNow(); }, persistDelayMs);
  };
  const restorePersisted = async () => {
    if (!persistPath) return;
    try {
      const payload = JSON.parse(await readFile(persistPath, 'utf8'));
      if (!Array.isArray(payload?.rooms)) return;
      for (const entry of payload.rooms) {
        if (!entry?.code || !entry?.state?.pieceCount) continue;
        if (Date.now() - (entry.savedAt || 0) > roomTtlMs) continue;
        rooms.set(entry.code, { code: entry.code, puzzleId: entry.puzzleId, password: entry.password || null, players: new Map(), state: entry.state });
      }
    } catch {
      // no snapshot yet or unreadable file; start with an empty room map
    }
  };
  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

    if (requestUrl.pathname === '/healthz') {
      const payload = JSON.stringify({ ok: true, service: 'lumapiece', rooms: rooms.size });
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(payload);
      return;
    }

    if (requestUrl.pathname === '/api/daily') {
      const key = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date()).replaceAll('-', ''));
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(JSON.stringify({ ok: true, key }));
      return;
    }

    if (requestUrl.pathname === '/admin/rooms') {
      const reply = (status, payload) => {
        response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        response.end(JSON.stringify(payload));
      };
      if (!adminToken) {
        reply(404, { ok: false, message: 'Admin API is disabled.' });
        return;
      }
      if (String(request.headers.authorization || '') !== `Bearer ${adminToken}`) {
        reply(401, { ok: false, message: 'Unauthorized.' });
        return;
      }
      if (request.method === 'GET') {
        reply(200, {
          ok: true,
          rooms: [...rooms.values()].map((room) => ({
            code: room.code,
            puzzleId: room.puzzleId,
            players: room.players.size,
            host: [...room.players.values()][0]?.nickname || null,
            locked: Boolean(room.password),
            pieceCount: room.state.pieceCount,
            moves: room.state.moves,
            elapsed: room.state.elapsed,
          })),
        });
        return;
      }
      if (request.method === 'DELETE') {
        const code = String(requestUrl.searchParams.get('code') || '').toUpperCase();
        const room = rooms.get(code);
        if (!room) {
          reply(404, { ok: false, message: 'Room not found.' });
          return;
        }
        broadcast(room, { type: 'room-closed' });
        room.players.forEach((player) => { player.socket.roomCode = null; });
        rooms.delete(room.code);
        schedulePersist();
        reply(200, { ok: true, closed: room.code });
        return;
      }
      reply(405, { ok: false, message: 'Method not allowed.' });
      return;
    }

    if (requestUrl.pathname === '/api/resolve-image' && request.method === 'POST') {
      const reply = (status, payload) => {
        response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        response.end(JSON.stringify(payload));
      };
      const clientKey = request.socket.remoteAddress || 'unknown';
      const now = Date.now();
      const samples = (resolveSamples.get(clientKey) || []).filter((timestamp) => now - timestamp < 60_000);
      samples.push(now);
      resolveSamples.set(clientKey, samples);
      if (resolveSamples.size > 5000) resolveSamples.clear();
      if (samples.length > 20) {
        reply(429, { ok: false, message: 'Too many image requests. Slow down.' });
        return;
      }
      let raw = '';
      let overflow = false;
      request.on('data', (chunk) => { raw += chunk.toString(); if (raw.length > maxBodyBytes) { overflow = true; request.destroy(); } });
      request.on('error', () => {});
      await new Promise((resolve) => request.on('end', resolve));
      if (overflow) { reply(413, { ok: false, message: 'Request body too large.' }); return; }
      let requested = '';
      try {
        requested = String(JSON.parse(raw).url || '');
      } catch {
        reply(400, { ok: false, message: 'Invalid request body.' });
        return;
      }
      const validated = validatePublicHttpUrl(requested);
      if (!validated.ok) {
        reply(400, { ok: false, message: validated.reason });
        return;
      }
      try {
        if (!net.isIP(validated.host)) {
          const addresses = await dns.lookup(validated.host, { all: true, verbatim: true });
          if (addresses.some((address) => isPrivateIp(address.address))) {
            reply(403, { ok: false, message: 'That host is not allowed.' });
            return;
          }
        }
        const imageResponse = await fetch(validated.url, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
        const contentType = String(imageResponse.headers.get('content-type') || '');
        if (!imageResponse.ok || !contentType.startsWith('image/')) {
          reply(400, { ok: false, message: 'That URL is not an image.' });
          return;
        }
        const declared = Number(imageResponse.headers.get('content-length') || 0);
        if (declared > maxImageBytes) {
          reply(413, { ok: false, message: 'That image is larger than 10 MB.' });
          return;
        }
        const buffer = Buffer.from(await imageResponse.arrayBuffer());
        if (buffer.length > maxImageBytes) {
          reply(413, { ok: false, message: 'That image is larger than 10 MB.' });
          return;
        }
        reply(200, { ok: true, dataUrl: `data:${contentType.split(';')[0]};base64,${buffer.toString('base64')}` });
      } catch {
        reply(400, { ok: false, message: 'The image could not be fetched.' });
      }
      return;
    }

    let requestPath;
    try {
      requestPath = decodeURIComponent(requestUrl.pathname);
    } catch {
      response.writeHead(400);
      response.end('Bad request');
      return;
    }

    if (requestPath === '/') requestPath = '/index.html';
    const filePath = path.normalize(path.join(publicRoot, requestPath));
    const relativePath = path.relative(publicRoot, filePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    try {
      await stat(filePath);
      const body = await readFile(filePath);
      response.writeHead(200, {
        'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream',
        'Cache-Control': requestPath.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(body);
    } catch {
      try {
        const body = await readFile(path.join(publicRoot, 'index.html'));
        response.writeHead(200, { 'Content-Type': mime['.html'], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
        response.end(body);
      } catch {
        response.writeHead(503);
        response.end('Build output is not available. Run npm run build first.');
      }
    }
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 512 * 1024 });

  const detach = (socket) => {
    const code = socket.roomCode;
    if (!code) return;
    const room = rooms.get(code);
    socket.roomCode = null;
    if (!room) return;
    room.players.delete(socket);
    if (room.players.size === 0) rooms.delete(room.code);
    else broadcast(room, { type: 'room-update', room: publicRoom(room, idleWindowMs) });
    schedulePersist();
  };

  server.on('upgrade', (request, socket, head) => {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (requestUrl.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (client) => wss.emit('connection', client, request));
  });

  wss.on('connection', (socket) => {
    socket.rateSamples = [];
    socket.on('message', (raw) => {
      const now = Date.now();
      socket.rateSamples = socket.rateSamples.filter((timestamp) => now - timestamp < rateLimit.windowMs);
      socket.rateSamples.push(now);
      if (socket.rateSamples.length > rateLimit.limit) {
        send(socket, { type: 'room-error', message: 'Too many messages. Reconnect and slow down.' });
        socket.close();
        return;
      }
      const member = rooms.get(socket.roomCode)?.players.get(socket);
      if (member) member.lastSeen = Date.now();
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        send(socket, { type: 'room-error', message: 'Invalid room message.' });
        return;
      }

      if (message.type === 'create-room') {
        detach(socket);
        const puzzleId = asPuzzleId(message.puzzleId);
        const pieceCount = Number(message.pieceCount) || 16;
        if (!puzzleId) {
          send(socket, { type: 'room-error', message: 'Choose a puzzle before creating a room.' });
          return;
        }
        if (!validPieceCount(pieceCount)) {
          send(socket, { type: 'room-error', message: 'Unsupported piece count.' });
          return;
        }
        if (rooms.size >= maxRooms) {
          send(socket, { type: 'room-error', message: 'The server is full. Try again in a moment.' });
          return;
        }
        const difficulty = validDifficulty(message.difficulty) ? message.difficulty : 'medium';
        const room = {
          code: roomCode(rooms),
          puzzleId,
          password: typeof message.password === 'string' && message.password.trim() ? hashPassword(message.password.trim()) : null,
          players: new Map(),
          state: { puzzleId, pieceCount, difficulty, order: shuffledOrder(pieceCount), moves: 0, elapsed: 0 },
        };
        room.players.set(socket, { socket, nickname: asNickname(message.nickname), lastSeen: Date.now() });
        socket.roomCode = room.code;
        rooms.set(room.code, room);
        schedulePersist();
        send(socket, { type: 'room-created', room: publicRoom(room, idleWindowMs) });
        return;
      }

      if (message.type === 'join-room') {
        detach(socket);
        const code = String(message.code || '').trim().toUpperCase();
        const room = rooms.get(code);
        if (!room) {
          send(socket, { type: 'room-error', message: 'That room does not exist anymore.' });
          return;
        }
        if (room.players.size >= 20) {
          send(socket, { type: 'room-error', message: 'That room is full.' });
          return;
        }
        if (room.password && hashPassword(typeof message.password === 'string' ? message.password.trim() : '') !== room.password) {
          send(socket, { type: 'room-error', message: 'Wrong room password.' });
          return;
        }
        room.players.set(socket, { socket, nickname: asNickname(message.nickname), lastSeen: Date.now() });
        socket.roomCode = room.code;
        send(socket, { type: 'room-joined', room: publicRoom(room, idleWindowMs) });
        broadcast(room, { type: 'room-update', room: publicRoom(room, idleWindowMs) });
        return;
      }

      if (message.type === 'state') {
        const room = rooms.get(socket.roomCode);
        if (!room || message.code !== socket.roomCode || !validState(message.state, room)) {
          send(socket, { type: 'room-error', message: 'Invalid room state.' });
          return;
        }
        room.state = message.state;
        schedulePersist();
        broadcast(room, { type: 'room-update', room: publicRoom(room, idleWindowMs), state: room.state });
        return;
      }

      if (message.type === 'leave-room') {
        if (message.code === socket.roomCode) detach(socket);
        return;
      }

      if (message.type === 'react') {
        const room = rooms.get(socket.roomCode);
        if (!room || message.code !== socket.roomCode) return;
        if (!allowedReactions.has(message.emoji)) return;
        broadcast(room, { type: 'reaction', from: room.players.get(socket)?.nickname || 'Guest', emoji: message.emoji });
        return;
      }

      send(socket, { type: 'room-error', message: 'Unknown room message.' });
    });
    socket.on('close', () => detach(socket));
  });

  const start = async () => {
    await restorePersisted();
    return new Promise((resolve, reject) => {
      const onError = (error) => { server.off('listening', onListening); reject(error); };
      const onListening = () => {
        server.off('error', onError);
        const address = server.address();
        resolve({ host, port: typeof address === 'object' && address ? address.port : port });
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, host);
    });
  };

  const close = () => new Promise((resolve) => {
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
    if (persistPath) persistNow();
    closedServer = true;
    rooms.clear();
    wss.clients.forEach((client) => client.terminate());
    wss.close(() => {
      if (!server.listening) resolve();
      else server.close(() => resolve());
    });
  });

  return { server, wss, rooms, start, close };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const runtime = createRoomServer();
  const shutdown = () => { runtime.close().then(() => process.exit(0)); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  runtime.start()
    .then(({ host, port }) => console.log(`LumaPiece server running at http://${host}:${port}`))
    .catch((error) => { console.error(error); process.exitCode = 1; });
}
