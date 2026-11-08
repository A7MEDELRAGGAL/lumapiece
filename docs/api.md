# API contract draft

The current local runtime uses the WebSocket contract below. The HTTP endpoints are the next adapter boundary for the Prisma/Next.js implementation.

## Health check

`GET /healthz` returns:

```json
{"ok":true,"service":"lumapiece","rooms":0}
```

## WebSocket `/ws`

### Create room

```json
{"type":"create-room","nickname":"Amina","puzzleId":"elba","pieceCount":16,"difficulty":"hard"}
```

### Join room

```json
{"type":"join-room","nickname":"Omar","code":"ABC123"}
```

### Synchronize state

```json
{"type":"state","code":"ABC123","state":{"puzzleId":"elba","pieceCount":16,"difficulty":"hard","moves":4,"elapsed":52,"engineState":{"pieces":[...]}}}
```

### Server events

- `room-created`
- `room-joined`
- `room-update`
- `room-error`

The server rejects state updates when the puzzle id or piece count differs from the room, when the engine rows/columns do not match the piece count, when piece ids/coordinates/rotations/groups are invalid, when the engine move count differs from the room move count, when the engine piece list is incomplete, or when numeric timing values are invalid.

## Planned HTTP routes

- `GET /api/puzzles`
- `GET /api/puzzles/:slug`
- `POST /api/progress`
- `POST /api/completions`
- `POST /api/favorites`
- `POST /api/custom-puzzles`
- `POST /api/rooms`
- `POST /api/rooms/:code/join`
- `GET /api/dashboard`
- `POST /api/admin/puzzles`
- `POST /api/admin/daily-puzzles`
