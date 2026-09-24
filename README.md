# Gridlock

An online multiplayer wall-and-race strategy game for **2 to 6 players**, based on the classic
Quoridor rules (the game WallRush is built on). Each turn you either **move your pawn** or **place
a wall**. The first pawn to reach its goal wins. Nobody may ever be completely walled in.

- **Mobile first:** iOS and Android through Expo / React Native. A web build comes from the same code later.
- **Online:** quick match, public tables, private rooms with a join code, and practice against bots at four difficulty levels.
- **Server-authoritative:** every rule is checked on the server by the same engine the app uses to preview moves.
- **Scalable:** one process in development; any number of processes behind Redis in production.

---

## Contents

1. [How the game works](#how-the-game-works)
2. [Tech stack](#tech-stack)
3. [Architecture](#architecture)
4. [Repository layout](#repository-layout)
5. [Getting started (development with hot reload)](#getting-started-development-with-hot-reload)
6. [Scripts](#scripts)
7. [Configuration](#configuration)
8. [Testing](#testing)
9. [Server design](#server-design)
10. [Client ↔ server protocol](#client--server-protocol)
11. [Scaling](#scaling)
12. [Deployment](#deployment)
13. [CI/CD](#cicd)
14. [Building the mobile app](#building-the-mobile-app)
15. [Troubleshooting](#troubleshooting)
16. [Roadmap](#roadmap)

---

## How the game works

### Choosing the player count

The player picks **2–6 players** when starting a quick match, creating a room or starting a practice
game. The board size, wall supply, start positions and goal all follow from that choice. The logic
lives in `packages/engine/src/setup.ts`.

| Players | Mode  | Board | Walls each | Goal |
|--------:|-------|:-----:|:----------:|------|
| 2 | Duel  | 9×9   | 10 (or 15) | Reach any cell of the far row |
| 3 | Table | 11×11 | 8 | Reach the golden ★ centre cell |
| 4 | Table | 11×11 | 7 | Reach the golden ★ centre cell |
| 5 | Table | 13×13 | 7 | Reach the golden ★ centre cell |
| 6 | Table | 13×13 | 6 | Reach the golden ★ centre cell |

- **Duel** is classic Quoridor, the same as WallRush's duel.
- **Tables** extend WallRush's 4-player "table" mode to any size. Pawns are spread evenly around a
  diamond centred on the golden cell, so **every pawn starts exactly the same number of steps from
  the goal**. With 4 players that puts one pawn in the middle of each side. With 3, 5 or 6 players
  the pawns form a triangle, pentagon or hexagon. A unit test checks this fairness for every count.
- Every player sees the board rotated so that their own pawn starts at the bottom.

### Rules

- **One action per turn:** move one square (up, down, left or right) *or* place one wall.
- **Walls** are two squares long and sit in the grooves between squares. Pawns can't jump walls.
- **Jumping:** you can jump straight over an adjacent pawn. If a wall, the board edge or another
  pawn is behind it, you jump diagonally instead.
- **No full block:** a wall may never leave any active player without a route to their goal.
- **Turn order:** clockwise by seat. Seats are shuffled randomly every round, so nobody always moves first.
- **Time:**
  - Each move has a 30-second limit.
  - Each player also has a game clock. Duels choose ∞, 3 or 5 minutes; tables always play 5.
  - If you run out of time you are **out**, but your walls stay on the board and the others keep playing.
- **Disconnects:** a dropped player has **30 seconds** to reconnect before they are out.
- **Winning:** the first player to reach their goal wins. The last player left at the table also wins.
- **Stuck players:** if a player can neither move nor place any legal wall, which is possible on crowded tables, their turn is skipped automatically.

**Differences from WallRush:**

- WallRush's 4-player rule "jump two pawns in a line only when nothing else is left" is not
  implemented. The stuck-player skip covers the same situations.
- Ratings, ranks, accounts, streaks and ads are not part of v1 (see the [Roadmap](#roadmap)).
- The UI, colours and branding are new.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** everywhere | One language, so the rules are written once and run identically on server, phone and web. |
| Shared rules | `@gridlock/engine`, pure TS with no dependencies | Move and wall validation, pathfinding, board setup, bots and the wire protocol. Fully unit-tested. |
| Game server | **Colyseus 0.18** on Node 22 | Built for room-based multiplayer: matchmaking, rooms, seat reservation, reconnection and delta state sync. |
| Scaling | **Redis** presence and driver (optional) | Lets many server processes or machines share matchmaking and room discovery. |
| Mobile app | **Expo SDK 57 / React Native 0.86**, Expo Router | One codebase for iOS, Android and web. Expo Go and hot reload in development; EAS builds for the stores. |
| Animation | **Reanimated 4** | Spring-animated pawns and walls, turn pulse, all on the UI thread. |
| Tests | **Vitest** (engine and server integration tests with real WebSocket clients) | Fast, and uses the same TypeScript setup as the code. |
| CI/CD | **GitHub Actions**, GHCR, Dependabot, Telegram | Every push builds all targets. Tags produce signed Android files, a web zip, a server image and a draft release. |

---

## Architecture

```
 ┌──────────────────────────┐        WebSocket (Colyseus)        ┌──────────────────────────────┐
 │  Mobile app (Expo / RN)  │  ── join / move / wall / emote ──▶ │  Game server (Colyseus)      │
 │                          │ ◀── state patches + events ─────── │                              │
 │  screens (Expo Router)   │                                    │  GameRoom (one per table)    │
 │  lib/session.ts ─────────┼── HTTP GET /api/rooms, /health ──▶ │   • owns the real GameState  │
 │  Board / PlayerChip / …  │                                    │   • timers, bots, reconnects │
 │           │              │                                    │           │                  │
 │           ▼              │                                    │           ▼                  │
 │   @gridlock/engine  ◀────┼──────── same code, same rules ─────┼──▶ @gridlock/engine          │
 └──────────────────────────┘                                    └──────────────┬───────────────┘
                                                                                │ optional
                                                                         ┌──────▼──────┐
                                                                         │    Redis    │  presence +
                                                                         │             │  matchmaking
                                                                         └─────────────┘
```

- The **server is the only source of truth.** Clients send *requests* (`move`, `wall`, …). The room
  validates them with the engine, applies them and syncs the new state. A modified client cannot cheat.
- The **client runs the same engine** only to highlight legal moves, preview walls in red or green,
  and explain why an action is illegal, without waiting for a round-trip.

---

## Repository layout

```
.
├── package.json              # npm workspaces root + convenience scripts
├── docker-compose.yml        # Redis + server, production-like
├── .github/
│   ├── workflows/ci.yml      # gate: format, lint, typecheck, test, server/web/Android/iOS builds
│   ├── workflows/release.yml # v*.*.* tag → signed Android, web zip, GHCR image, draft release
│   └── dependabot.yml
├── docs/                     # ci-cd.md, telegram-notifications.md
├── tool/                     # version.mjs, check-android-permissions.sh
├── packages/
│   └── engine/               # @gridlock/engine: shared, dependency-free
│       ├── src/types.ts      #   board coordinates, state and action types
│       ├── src/setup.ts      #   player count → board size, walls, start cells, goals
│       ├── src/rules.ts      #   legal moves, jumps, wall checks, BFS pathfinding, turns
│       ├── src/bot.ts        #   AI: easy / medium / hard / expert
│       ├── src/protocol.ts   #   message and state contract, constants, option normalizing
│       ├── src/sync.ts       #   synced room state → engine GameState (client side)
│       └── test/             #   26 unit tests
├── apps/
│   ├── server/               # @gridlock/server: Colyseus game server
│   │   ├── src/index.ts      #   entry: listens on PORT (2567)
│   │   ├── src/app.config.ts #   room registration, matchmaking filters, HTTP API, Redis
│   │   ├── src/rooms/GameRoom.ts  # the table: lobby → countdown → playing → finished
│   │   ├── src/rooms/schema.ts    # synchronized state schema
│   │   ├── test/room.test.ts #   integration tests with real clients
│   │   └── Dockerfile
│   └── mobile/               # @gridlock/mobile: Expo app
│       ├── index.ts          #   entry: polyfills, then expo-router
│       ├── app.config.ts     #   per-build config: build numbers, permissions, R8
│       ├── plugins/          #   config plugin: release signing + ABI splits
│       ├── metro.config.js   #   stubs Node's "ws" for native bundles
│       └── src/
│           ├── app/          #   screens: index (home), setup, rooms, join, game, rules
│           ├── components/   #   Board, PlayerChip, Lobby, ResultCard, TablePreview, ui kit
│           └── lib/          #   session (networking), config, theme, view rotation, profile
```

---

## Getting started (development with hot reload)

### Prerequisites

- **Node.js 22+** and npm 10+ (`node -v`)
- To run on a device, one of:
  - **Expo Go** on your phone (Play Store / App Store), with the phone on the **same Wi-Fi** as your computer, or
  - an **Android emulator** (Android Studio) or iOS Simulator (macOS), or
  - just a browser, using the web build.
- Optional: **Redis** (only for multi-process testing) and **Docker** (for deployment).

### 1. Install

```bash
npm install          # installs every workspace (engine, server, mobile)
```

### 2. Start the game server (terminal 1)

```bash
npm run dev:server
```

- It listens on `http://localhost:2567` and reloads itself when you change server or engine code (`tsx watch`).
- Check it with `curl localhost:2567/health`.
- In development a room inspector runs at <http://localhost:2567/monitor>.

### 3. Start the app (terminal 2)

```bash
npm run dev:mobile   # = expo start (Metro bundler, hot reload)
```

Then open it one of these ways:

| Target | How |
|---|---|
| **Phone** | Scan the QR code in the terminal with Expo Go (Android) or the Camera app (iOS). |
| **Android emulator** | Start the emulator, then press `a` in the Expo terminal. |
| **iOS simulator** (macOS) | Press `i`. |
| **Browser** | Press `w`, or open the printed `http://localhost:<port>` URL. |

**Hot reload:** save any file in `apps/mobile/src` and the running app updates immediately, keeping
its state (Fast Refresh). Changes to `packages/engine` hot-reload in the app too, and restart the
server automatically. Press `r` in the Expo terminal for a full reload. Shake the device, or press
`m`, for the dev menu.

The app finds the server by itself: it uses the host the JS bundle came from, on port 2567. Expo Go
on your Wi-Fi, the emulator and the browser all work with no configuration. To point it somewhere
else, set `EXPO_PUBLIC_SERVER_URL` (see [Configuration](#configuration)).

> **Port 8081 already in use?** Expo asks whether to use another port. In a non-interactive shell,
> run `npx expo start --port 8082` inside `apps/mobile`.

### 4. Play

- **Practice:** Home → *Practice* → pick 2–6 players and a difficulty → *Start practice*. Bots fill the other seats.
- **Two real players on one machine:** open the app on the emulator *and* in a browser (or on two
  phones). Pick the same *Quick match* settings on both and the matchmaker seats them together.
- **Friends:** *Play friends* creates a private room and shows a 6-character code and an invite
  button. Friends enter the code under *Join by code*, or tap the `gridlock://join?code=XXXXXX`
  link. The host can fill empty seats with bots.

---

## Scripts

Run from the repository root:

| Command | What it does |
|---|---|
| `npm run dev:server` | Game server with auto-restart on file changes |
| `npm run dev:mobile` | Expo dev server (QR code, hot reload) |
| `npm run dev:web` | Expo, opening the web build in the browser |
| `npm run dev:android` | Expo, opening the Android emulator or device |
| `npm run dev` | Server and Expo together in one terminal (Expo keyboard shortcuts are unavailable in this mode) |
| `npm test` | Engine unit tests, then server integration tests |
| `npm run test:coverage` | The same tests with coverage (`coverage/lcov.info` per workspace) |
| `npm run typecheck` | `tsc --noEmit` in every workspace |
| `npm run lint` | ESLint (Expo config) |
| `npm run format` / `format:check` | Prettier: write, or check without writing (CI runs the check) |
| `npm run build:server` | Bundle the server to `apps/server/dist` (tsup) |
| `npm run start:server` | Run the built server (`NODE_ENV=production`) |
| `npm run build:web` | Static web export to `apps/mobile/dist-web` |
| `npm run version:set X.Y.Z` | Set the version in every `package.json` and `app.json` |
| `npm run version:check` | Fail if those versions disagree |
| `npm run prebuild -w @gridlock/mobile` | Generate the native `android/` and `ios/` projects (never committed) |
| `npm run doctor -w @gridlock/mobile` | `expo-doctor` dependency health check |

Always add mobile dependencies with `npx expo install <pkg>` inside `apps/mobile`. It picks versions
that match the Expo SDK.

---

## Configuration

### Server (`apps/server/.env`, see `.env.example`)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `2567` | HTTP and WebSocket port |
| `REDIS_URL` | *(unset)* | Enables multi-process mode (shared presence and matchmaking) |
| `PUBLIC_ADDRESS` | *(unset)* | With Redis: the address clients use to reach **this** process directly |
| `CORS_ORIGIN` | `*` | Comma-separated origins allowed to call `/api/*` |
| `NODE_ENV` | — | `production` disables the `/monitor` page |
| `DEBUG_ACTIONS` | *(unset)* | Log every human action and its result (debugging) |

### Mobile (`apps/mobile/.env`, see `.env.example`)

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_SERVER_URL` | Game server URL, e.g. `https://game.example.com`. Leave it unset in development. |

### Game constants

Game constants live in `packages/engine/src/protocol.ts` and `setup.ts`: move time, reconnect
window, countdown, emotes, player colours, board presets.

---

## Testing

```bash
npm test                              # everything
npm test -w @gridlock/engine          # rules, setup fairness, bots
npm test -w @gridlock/server          # real rooms + real WebSocket clients
```

**Engine tests (26)** cover:

- board presets for every player count
- equal start distance to the centre for 3–6 players
- steps, straight and diagonal jumps, walls blocking moves
- wall overlaps and crossings, the no-full-block rule, an empty wall supply
- turn order, eliminations, the last player standing, and reaching the goal row or cell
- bots completing legal 2–6 player games, and the hard bot beating the easy bot

**Server tests (6)** cover:

- a duel starting when full, with out-of-turn moves rejected
- illegal walls rejected with a reason code
- practice rooms filling with bots, getting a code and playing on their own
- a player leaving mid-game, which hands the win to the other player
- matchmaking only pairing players who asked for the same table
- private rooms joinable by code but invisible to quick match

---

## Server design

`apps/server/src/rooms/GameRoom.ts`. One room is one table.

```
lobby ──(all seats taken)──▶ countdown (3 s) ──▶ playing ──(goal / last standing)──▶ finished
  ▲             │ someone leaves                                                          │
  └─────────────┘                                  everyone taps "Play again" ◀───────────┘
```

- **Authoritative state:** the room keeps an engine `GameState`. Each accepted action produces a
  new immutable state, which is projected onto the Colyseus schema (`schema.ts`). Colyseus sends
  only the changed fields to clients.
- **Validation:** every message is type-checked (integers, orientation), then passed to
  `applyAction`. A rejected action gets an `error` message with a code (`wall_blocks_path`,
  `not_your_turn`, …), which the app shows as a friendly toast.
- **Timers:** there is one timer per turn, set to the smaller of the 30 s move limit and the
  player's remaining game clock. When it fires the player is out, as in WallRush. Clocks are only
  charged on the server, so a client can't tamper with them.
- **Reconnection:** when a connection drops, the room holds the seat for 30 s
  (`allowReconnection`). The app reconnects automatically and saves a reconnection token, so it can
  rejoin even after being killed and reopened.
- **Bots:** bots are seats with no connection. They "think" for 0.5–1.7 s, then act through the
  same `applyAction` path as humans.
  - Easy: mostly greedy moves plus random mistakes.
  - Medium: a one-move evaluation with noise.
  - Hard: a one-move evaluation over walls along every opponent's shortest path.
  - Expert: looks ahead to the next player's reply.
- **Rooms and matchmaking:**
  - Public rooms are matched on `players`, `time` and `walls` (normalized identically on client and server), and fuller rooms are preferred.
  - Private and practice rooms get a unique 6-character code (no 0/O/1/I/L) as their room ID. They never appear in matchmaking and are joined with `joinById`.
- **Abuse limits:** emotes are rate-limited (1.5 s), actions are only accepted from the player whose turn it is, and names are sanitized and length-capped.

### HTTP API

| Route | Description |
|---|---|
| `GET /health` | `{ ok, uptime }` for load balancers and Docker health checks |
| `GET /api/rooms[?players=N]` | Open public tables that are still filling |
| `GET /monitor` | Colyseus room inspector (development only) |

---

## Client ↔ server protocol

Defined once in `packages/engine/src/protocol.ts` and imported by both sides.

**Join options:** `create` / `joinOrCreate("game", { name, players, time, walls, private?, bots? })`,
or `joinById(code, { name })`.

| Client → server | Payload | Notes |
|---|---|---|
| `move` | `{ x, y }` | model coordinates |
| `wall` | `{ x, y, o: 'h' \| 'v' }` | groove intersection + orientation |
| `resign` | — | |
| `emote` | `{ e }` | one of `😂 🫡 🤝 😡 🔥 🏆` |
| `rematch` | — | the next round starts once everyone has voted |
| `fillBots` | `{ level }` | host only, in the lobby |
| `kick` | `{ seat }` | host only, removes a bot seat |

| Server → client | Payload |
|---|---|
| `hello` | `{ serverNow }`, used to sync clocks |
| `error` | `{ code }` |
| `emote` | `{ seat, e }` |
| *state* | `SyncedState`: phase, players (seat, position, walls, clock, status), walls, turn, timers |

**Coordinates:**

- Cells are `(x, y)` with `(0, 0)` at the top-left of the *model* board.
- A wall is anchored at the groove intersection `(x, y)`, where x and y run from `0` to `size-2`:
  - `h` lies between rows `y` and `y+1` and covers columns `x` and `x+1`;
  - `v` lies between columns `x` and `x+1` and covers rows `y` and `y+1`.
- The app rotates the board per player for display only (`apps/mobile/src/lib/view.ts`).

---

## Scaling

A single Node process comfortably runs thousands of concurrent turn-based tables. The game is
turn-based and each patch is a few bytes. When one process is not enough:

1. Run **Redis**, and start every server process with `REDIS_URL`. Matchmaking, room listing and
   seat reservations are then shared between processes. This was verified locally: a room created
   on node 1 was listed and joined through node 2.
2. Give every process its own **`PUBLIC_ADDRESS`** (for example `node-1.game.example.com`). After
   matchmaking, clients connect straight to the process that hosts their room.
3. Put a load balancer in front for `/matchmake` and the HTTP API, with TLS termination and WebSocket upgrade enabled.
4. **Multi-core on one machine:** run one process per core (PM2 or several containers), each on its own port and `PUBLIC_ADDRESS`.

Rooms are in-memory by design, which suits real-time turn-based play. Durable data (accounts,
ratings, match history) belongs in a database; see the [Roadmap](#roadmap).

---

## Deployment

### Docker

```bash
docker build -f apps/server/Dockerfile -t gridlock-server .
docker run -p 2567:2567 gridlock-server
```

### docker-compose (server + Redis)

```bash
docker compose up --build
```

### Production checklist

- Serve over **HTTPS/WSS** behind a reverse proxy (nginx, Caddy, Traefik or a cloud load balancer), with WebSocket upgrade and idle timeouts of at least 60 s.
- Set `NODE_ENV=production` (the image already does), `CORS_ORIGIN` to your web origin, and `REDIS_URL` when running more than one process.
- Point the app and web build at the server by setting the `PRODUCTION_SERVER_URL` repository variable (see [docs/ci-cd.md](docs/ci-cd.md)).
- Monitor `/health`. The container has a built-in `HEALTHCHECK`.
- Managed options: **Colyseus Cloud**, Fly.io, Railway, Render, or any VM or Kubernetes cluster. Long-lived WebSockets rule out serverless platforms such as Vercel functions for the game server.

---

## CI/CD

Two GitHub Actions workflows build everything the repository ships. The full guide, covering
secrets, signing, local runs and iOS store builds, is in **[docs/ci-cd.md](docs/ci-cd.md)**.

### `ci.yml`: every push to `main` and every pull request

| Job | What it enforces |
|---|---|
| **Format, lint, typecheck & test** | Lockfile drift, consistent versions, Prettier, ESLint, `tsc`, and 32 tests with coverage |
| **Server bundle & Docker image** | The tsup bundle and the production image still build |
| **Web build** | `expo export --platform web` still works |
| **Android release build** | Real release config (Hermes, R8, resource shrinking), debug-signed and thrown away. `tool/check-android-permissions.sh` fails the build if the APK asks for anything beyond `INTERNET`, `ACCESS_NETWORK_STATE` and `VIBRATE`. |
| **iOS release build** | `xcodebuild` Release for devices with `CODE_SIGNING_ALLOWED=NO`: compiles and links like a store build, with no Apple credentials |

### `release.yml`: on a `v*.*.*` tag

```bash
npm run version:set 1.2.0        # root, workspaces and app.json in one go
git commit -am "Release 1.2.0"
git tag v1.2.0 && git push origin main v1.2.0
```

The workflow checks the tag against the repository version and re-runs the full gate. It then
produces a **draft GitHub Release** containing:

- a signed `.aab` for Google Play
- a universal APK and one APK per ABI, for sideloading
- the Hermes source map and the R8 mapping, needed to read crash reports
- the web build as a zip
- `SHA256SUMS.txt`

It also pushes `ghcr.io/<owner>/gridlock-server:<version>` and `:latest`, and, if
`SERVER_DEPLOY_HOOK_URL` is set, deploys it. The **version name** comes from the tag. The
**version code** is the run number, which only ever increases, as Play requires.

### Build notifications

Both workflows post results to Telegram. Setup is in
[docs/telegram-notifications.md](docs/telegram-notifications.md). Without `TELEGRAM_BOT_TOKEN` and
`TELEGRAM_CHAT_ID` the step warns and skips.

### Release signing secrets

Set these in **Settings → Secrets and variables → Actions**. Without them the workflow still runs,
but it labels the Android files `-UNSIGNED` and warns that they can't be uploaded to Play.

| Name | Kind | Purpose |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | secret | `base64 -w0 upload-keystore.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | secret | Keystore password |
| `ANDROID_KEY_ALIAS` | secret | Key alias (e.g. `upload`) |
| `ANDROID_KEY_PASSWORD` | secret | Key password |
| `PRODUCTION_SERVER_URL` | variable | Server the release app and web build connect to (`https://…`) |
| `SERVER_DEPLOY_HOOK_URL` | secret | Optional: auto-deploy the new server image |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | secrets | Optional: build notifications |

Dependabot ([`.github/dependabot.yml`](.github/dependabot.yml)) opens grouped weekly npm PRs and
monthly GitHub Actions and Docker PRs. Expo SDK packages are excluded, because they move together
with SDK upgrades.

---

## Building the mobile app

In development the app runs in **Expo Go**. Release builds come from `release.yml` (above). To
build one locally, see [docs/ci-cd.md → Running the builds locally](docs/ci-cd.md#running-the-builds-locally).
Signed iOS store builds need an Apple Developer account and go through EAS
([docs/ci-cd.md → iOS store builds](docs/ci-cd.md#ios-store-builds)).

`android/` and `ios/` are **generated** by `expo prebuild` and never committed. Native changes go
in `app.json`, `app.config.ts` or a config plugin in `apps/mobile/plugins/`.

**Identifiers** (in `app.json`):

- name `Gridlock`
- deep-link scheme `gridlock://`
- Android package and iOS bundle ID `online.gridlock.app`, which you should change to your own domain

**Web version (later):** `npx expo export --platform web` produces a static site from the same code.
The layout is already capped at 560 px wide for desktop.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Home screen shows "Game server unreachable" | Start `npm run dev:server`. On a phone, make sure it's on the same Wi-Fi and your firewall allows port **2567** (and the Metro port). |
| `Port 8081 is being used by another process` | Run `npx expo start --port 8082` in `apps/mobile`. |
| Expo Go says the project needs a different SDK | Update Expo Go. This project uses **SDK 57**. |
| Android bundle fails with `attempted to import the Node standard library module "stream"` | `metro.config.js` must stub `ws`. After editing Metro config, restart with `npx expo start --clear`. |
| `Property 'FinalizationRegistry' doesn't exist` | The app must start from `index.ts`, which loads `src/polyfills.ts` first. Check `"main": "index.ts"` in `apps/mobile/package.json`. |
| Physical Android phone over USB can't reach the server | `adb reverse tcp:2567 tcp:2567`, then set `EXPO_PUBLIC_SERVER_URL=http://localhost:2567`. |
| Changed `.env` or `metro.config.js` and nothing happened | Restart Expo; these files are only read at startup. |

---

## Roadmap

WallRush features not yet built, roughly in priority order:

1. **Accounts and ratings:** sign-in (Colyseus auth or Supabase), rating points (+25/+40 win,
   −10/−20 loss), ranks (Rookie → GOAT), no points for games under 6 moves, and diminishing points
   for repeated rematches. Persist to Postgres.
2. Leaderboards, player profiles, match history and **replays** (the engine is deterministic, so a replay is just the action list).
3. Friends list, online presence and direct invites; push notifications ("your turn", "friend invited you").
4. Daily task and streaks.
5. Localisation (WallRush ships 6 languages).
6. Sounds and music, haptics settings, colour-blind friendly pawn shapes.
7. Offline bot games that run the engine locally, with no server connection.
8. Web release and store listings.

---

**Name and assets:** "Gridlock" is a working title. The mechanics are Quoridor's (game mechanics
can't be copyrighted), but "Quoridor" is a Gigamic trademark and WallRush's name, art and code
are theirs. None of them are used here.
