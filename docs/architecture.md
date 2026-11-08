# LumaPiece architecture

## Current runtime

- Vite serves the browser bundle.
- `src/main.js` owns catalog, local persistence, custom-puzzle creation, theme/language controls, room UI, and the player shell.
- `src/puzzle-engine.js` is an isolated Canvas engine. It generates deterministic edges, renders pieces, handles pointer drag, group merging, snapping, rotation, preview/edge modes, and serializable state.
- `server.mjs` serves `dist/`, exposes `/healthz`, and exposes a WebSocket endpoint at `/ws` for room presence and state broadcasts.

## Production target

1. Put the browser experience behind Next.js App Router client/server boundaries.
2. Move persistence from localStorage to Prisma repositories backed by PostgreSQL.
3. Move room state from the in-memory `Map` to Redis with TTL and event streams.
4. Persist upload metadata and transformed thumbnails in object storage.
5. Put Auth.js session checks around dashboard/admin APIs.
6. Keep the engine package transport-agnostic: multiplayer sends serialized engine state or domain events, never DOM references.

## Domain boundaries

- Catalog: public puzzle metadata, search, filters, category tree, daily/mystery selection.
- Progress: anonymous or authenticated progress snapshots and completion records.
- Custom puzzles: upload validation, safe URL fetching, metadata, sharing policy.
- Multiplayer: room lifecycle, participant presence, server-authoritative state, reconnect tokens, rate-limited chat.
- Admin: moderation, publishing, scheduling, analytics, and site settings.

## Security boundaries

- Never fetch arbitrary image URLs from the server without an SSRF-safe allowlist/proxy.
- Validate MIME type and decoded image dimensions, not only file extensions.
- Hash anonymous/share tokens before storing them.
- Rate-limit room creation, joins, chat, uploads, and report submission.
- Keep private/unlisted puzzle rows out of public catalog queries.

## Local server guarantees

- Room state is bound to the room's puzzle id and piece count.
- Coordinates, rotations, group ids, move counts, and elapsed time are validated before a state broadcast.
- A WebSocket can only update or leave the room it currently belongs to.
- Empty rooms are removed from memory when the last player leaves.
- `GET /healthz` returns a no-store JSON response for local process checks and deployment probes.
