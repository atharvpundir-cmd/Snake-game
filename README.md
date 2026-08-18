# hidingsnake.io

Classic snake with customizable settings, level-unlocked skins, offline play against bots, and
online multiplayer with a global leaderboard — bots fill any empty seats when other players
aren't around.

## Project layout

npm workspaces monorepo:

- **`shared/`** — the core game engine (grid, movement, collisions, scoring), heuristic bot AI,
  skin registry, and XP/level curve. Pure TypeScript, no DOM/Node dependencies. Used by both the
  client (offline mode) and the server (authoritative online simulation) so the rules only exist
  once.
- **`server/`** — Node + Express + Socket.io. Matchmaking, bot fill-in, the authoritative game
  loop for online matches, SQLite-backed player profiles and the global leaderboard.
- **`client/`** — Vite + TypeScript + Canvas, installable as a PWA so offline play works with no
  network connection.

**Fairness rule:** only server-verified online matches write to the global leaderboard. Offline
high scores live in `localStorage` only, since a client-only score can trivially be forged.

## Local development

Requires Node 20+ (this repo was set up with nvm — `nvm use --lts`).

```bash
npm install                 # installs all three workspaces
npm run test:shared         # unit tests for the game engine + bot AI

npm run dev:server          # starts the API + Socket.io server on :3001
npm run dev:client          # starts the Vite dev server on :5173 (in another terminal)
```

Open http://localhost:5173. The client talks to the server via `VITE_SERVER_URL` in
`client/.env` (defaults to `http://localhost:3001`).

### Useful checks

```bash
curl http://localhost:3001/api/health
curl "http://localhost:3001/api/leaderboard?limit=10"
npm run build -w client     # type-checks and builds the static client bundle
```

## Deploying to hidingsnake.io

This repo is deployment-ready but nothing is deployed automatically — you'll need to own the
domain and a hosting account first. Rough shape of a deploy:

1. **Server** (`server/`, realtime + API + SQLite): build and run the included root `Dockerfile`
   on any container host (Render, Fly.io, Railway, etc.). It listens on `PORT` (default 3001) and
   persists SQLite to the `/app/server/data` volume — mount a persistent volume there or the
   leaderboard/profiles reset on redeploy.

   ```bash
   docker build -t hidingsnake-server .
   docker run -p 3001:3001 -v hidingsnake-data:/app/server/data \
     -e CORS_ORIGIN=https://hidingsnake.io hidingsnake-server
   ```

   Point a subdomain (e.g. `api.hidingsnake.io`) at this service.

2. **Client** (`client/`, static): set `VITE_SERVER_URL` to your deployed API subdomain (see
   `client/.env.example`), then `npm run build -w client` and deploy `client/dist` to any static
   host (Vercel, Netlify, Cloudflare Pages, or the same box behind nginx). Point `hidingsnake.io`
   at this.

3. **DNS**: `hidingsnake.io` → static client host, `api.hidingsnake.io` → server container, and
   set `CORS_ORIGIN` on the server to `https://hidingsnake.io` so the browser is allowed to talk
   to it.

None of the above is run by this project automatically — registering the domain, creating the
hosting accounts, and wiring DNS are manual steps for whoever owns them.

## Gameplay notes

- **Offline**: practice against 2–3 heuristic bots on a board sized by Settings. XP earned is
  applied locally immediately and best-effort synced to the server if reachable.
- **Online**: click Play Online to join matchmaking. The server waits ~6s for other human players
  before filling the remaining seats (room size 6) with bots, then runs the match
  server-authoritatively at a fixed tick rate. Disconnecting mid-match hands your snake to the bot
  AI so the match continues for everyone else.
- **Skins**: cosmetic only, unlocked by level (`shared/src/skins.ts`). XP from online matches
  counts double vs. offline.
