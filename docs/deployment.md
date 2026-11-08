# Deployment checklist

## Local

```bash
docker compose up -d
cp .env.example .env
npm install
npm run build
npm run start -- --port 5191
```

## Before public deployment

- Replace the in-memory room map with Redis and persistent room snapshots.
- Add TLS termination for WebSockets.
- Add PostgreSQL migrations and run the Prisma seed.
- Configure object storage and image transformation workers.
- Add Auth.js credentials/OAuth providers and admin role checks.
- Add a safe image proxy for URL imports to prevent SSRF.
- Configure CSP, upload limits, rate limits, structured logs, backups, and monitoring.
- Install the Playwright browser binary in CI with `npx playwright install --with-deps chromium`.

## Current limitation

The checked-in browser app is a production-oriented working slice, not a claim that the full PostgreSQL/Auth.js/Redis deployment has already been wired. The schema, environment contract, Docker services, seed data shape, and transport contract are included so the next adapter work is explicit rather than hidden behind fake buttons.
