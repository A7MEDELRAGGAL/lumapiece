# LumaPiece

LumaPiece is an original online jigsaw platform with a real Canvas puzzle engine, an original locally generated visual identity, curated scenes, local progress saving, custom puzzles, and WebSocket-based shared rooms.

## Current working slice

- 40 playable catalog puzzles using locally bundled high-resolution scenes (`public/scenes`) with generated SVG artwork in `public/puzzles` as an offline fallback.
- Canvas-rendered irregular tabs and slots with deterministic edge generation, piece counts from 9 up to 144 (including a rectangular 6×10 grid), magnetic snapping to neighbors or the exact spot, and ghost hints.
- Pointer drag, piece grouping, snapping, optional rotation, edge-only view, rearrange, preview, timer, save/resume, completion detection, fullscreen, and keyboard shortcuts (Space/P pause, R rearrange, B preview, F fullscreen, arrows rotate).
- Search and category filters (including favorites, challenging, and mystery modes), dark theme, and an Arabic RTL toggle.
- Custom puzzle creation from a local image or public URL, with local persistence and configurable piece count/rotation.
- Synthesized sound effects (Web Audio, no asset files) with volume control, ghost-piece hints, confetti celebrations, per-puzzle best times with solved badges, and a settings modal covering gameplay and developer options (debug overlay, reduced motion, adjustable piece size).
- Installable PWA: web manifest, app icon, and a service worker that caches assets and scenes so the game keeps working offline after the first visit.
- Server-side image proxy `/api/resolve-image` with strict SSRF validation (public hosts only, DNS-checked, redirects blocked, 10 MB cap, image types only) and per-IP rate limiting, so custom URL puzzles load reliably and safely.
- Operations: `/api/daily` serves the Cairo-calendar daily puzzle key from the server clock, idle players are marked with a 💤 in room presence, and an admin API (`GET`/`DELETE /admin/rooms`) — enabled by setting `ADMIN_TOKEN` — lists and closes rooms. A production `Dockerfile` (multi-stage, non-root) plus a k6 load script in `load/rooms.k6.js` round out deployment.
- Multiplayer room creation, room codes, optional password-protected rooms, a host badge with automatic host migration, difficulty/piece-count settings, up to 20 players, synchronized and validated state broadcasts, quick emoji reactions, automatic client reconnection with backoff, join/leave presence toasts, and clean room exit through `server.mjs`. Set `ROOMS_FILE` to a JSON path and active rooms (state, password hash, settings) survive full server restarts with a TTL-based snapshot.
- A fully bilingual interface: every player, room, settings, and onboarding string switches between English and Arabic with RTL support.
- Local `/healthz` probe for process and deployment checks.
- Proprietary project notice and ownership terms in `LICENSE`.
- Vitest and Playwright smoke coverage.
- Prisma schema covering users, anonymous sessions, puzzles, progress, favorites, daily/mystery puzzles, custom puzzles, escape-room clues, multiplayer rooms/events, moderation, and settings.
- Docker services for PostgreSQL, Redis, and MinIO.

## Current feature matrix

| Area | Local status | Notes |
| --- | --- | --- |
| Curated catalog | Working | Locally bundled high-resolution scenes with generated SVG fallback, search, filters, favorites, daily rotation, challenging and mystery labels. |
| Canvas puzzle engine | Working | Deterministic tabs, pointer drag, groups, snapping, rotation, edge-only, rearrange, preview, resize handling, normalized saves. |
| Local progress | Working | Browser-local save/resume with per-puzzle completion cleanup, normalized saves, and custom puzzle options. |
| Custom puzzles | Working locally | Upload/URL preview, 10 MB client limit, JPG/PNG/WEBP/GIF validation, piece count and rotation settings. |
| Puzzle Together | Working locally | WebSocket rooms, join/leave, up to 20 players, shared difficulty/piece count, synchronized board state, strict state validation, safe room cleanup. Redis persistence is still the production adapter. |
| Theme/RTL | Working foundation | Theme persistence and Arabic RTL direction toggle. A full translated Arabic catalog is still a backend/content task. |
| PostgreSQL/Auth/Redis/object storage | Scaffolded | Prisma schema, environment contract, Docker services, seed shape, and API contract are present; application adapters still need wiring. |
| Admin/dashboard/leaderboards | Schema/docs scaffold | Domain models and planned routes exist; authenticated server UI is not yet wired. |

## Run locally

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

For the built local server:

```bash
npm run build
npm run start -- --port 5191
```

Open `http://127.0.0.1:5191`. The health check is available at `http://127.0.0.1:5191/healthz`.

For development with Vite, use the URL printed by `npm run dev`.

For the database/object-storage development services:

```bash
docker compose up -d
```

The database schema is in `prisma/schema.prisma`; copy `.env.example` to `.env` before connecting Prisma.

## Checks

```bash
npm test
npm run build
npm run e2e
```

The test script runs Vitest in a single worker to avoid Windows memory pressure. If Playwright reports that Chromium is missing, install it once with `npx playwright install chromium`. The browser tests use the built production server and cover catalog visibility, puzzle-player controls, room creation, favorites, custom-puzzle entry, modal escape behavior, catalog modes, dark mode, and RTL switching. Continuous integration runs the same checks (unit tests, build, browser tests) on GitHub Actions for every push and pull request.

## Architecture notes

The current runtime is intentionally dependency-light so the core experience can run locally without external services. `src/puzzle-engine.js` is isolated from the catalog and room transport so it can be moved behind a Next.js client boundary or a dedicated package when the PostgreSQL/Auth.js/Redis adapters are connected. The full development plan lives in `docs/roadmap.md`. A complete handoff log for contributors and agents — everything built, everything pending, and working conventions — lives in `docs/handoff/` (start with its README). The room server already applies per-connection rate limits, an active-room cap, a WebSocket payload cap, `nosniff` response headers, hashed-asset caching, and graceful shutdown. The canvas engine batches renders and resizes through request animation frames and retries a failed remote image before falling back to the local artwork.

Production hardening still required before public deployment: connect the Prisma repositories and Auth.js, replace the in-memory room map with Redis/PostgreSQL persistence, add object-storage upload processing and SSRF validation, add admin authorization, and deploy the WebSocket endpoint behind TLS.
