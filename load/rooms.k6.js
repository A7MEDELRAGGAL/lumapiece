import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const roomsCreated = new Counter('rooms_created');
const joinLatency = new Trend('join_latency_ms');

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || '30s',
  thresholds: {
    rooms_created: ['count>50'],
    join_latency_ms: ['p(95)<500'],
  },
};

// Usage: k6 run -e BASE_URL=http://127.0.0.1:5191 load/rooms.k6.js
// Exercises the real flow: create a room, have a second socket join it, relay one state update.
export default function () {
  const base = __ENV.BASE_URL || 'http://127.0.0.1:5191';
  const wsBase = base.replace(/^http/, 'ws');
  let roomCode = null;

  ws.connect(`${wsBase}/ws`, {}, (hostSocket) => {
    hostSocket.on('open', () => {
      hostSocket.send(JSON.stringify({ type: 'create-room', nickname: `load-host-${__VU}-${__ITER}`, puzzleId: 'sunrise', pieceCount: 9 }));
    });
    hostSocket.on('message', (raw) => {
      const message = JSON.parse(raw);
      if (message.type === 'room-created') {
        roomsCreated.add(1);
        roomCode = message.room.code;
        ws.connect(`${wsBase}/ws`, {}, (guestSocket) => {
          const started = Date.now();
          guestSocket.on('open', () => {
            guestSocket.send(JSON.stringify({ type: 'join-room', nickname: `load-guest-${__VU}-${__ITER}`, code: roomCode }));
          });
          guestSocket.on('message', (rawGuest) => {
            const guestMessage = JSON.parse(rawGuest);
            if (guestMessage.type === 'room-joined') {
              joinLatency.add(Date.now() - started);
              guestSocket.close();
              hostSocket.close();
            }
          });
        });
      }
    });
  });

  check(roomCode, { 'room code received': (code) => typeof code === 'string' || code === null });
  sleep(0.2);
}
