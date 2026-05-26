# timprgr

Production-ready in-memory **end-to-end encrypted** 2-person chat rooms for one-time use.

## Features
- Human-friendly room codes in Crockford-style Base32, grouped like `ABCD-EFGH-IJKL-MNOP`
- Browser-only E2E crypto: **ECDH (P-256) + HKDF (SHA-256) + AES-256-GCM**
- The browser sends only `roomId = SHA-256("room:" + code)` to the server
- Unlimited rooms, each limited to **2 participants**
- In-memory relay only: no reconnect buffer and no message history
- Destroyed room IDs stay blocked for the same TTL window, so the same code cannot recreate a room immediately
- Rate-limited joins, WebSocket payload limits, structured logs, and server-side security headers

## Local development
```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Run the unit tests:
```bash
npm test
```

## Docker Compose
```bash
cp .env.example .env
docker compose up -d --build
```

Open `http://localhost`.

## VPS deployment (Ubuntu, IP-only)
1. Install Docker Engine and the Docker Compose plugin.
2. Copy the project to the VPS:
   ```bash
   git clone https://github.com/ksasha-hub/timprgr.git
   cd timprgr
   cp .env.example .env
   ```
3. Start the stack:
   ```bash
   docker compose up -d --build
   ```
4. Open `http://YOUR_SERVER_IP`.

Detailed VPS notes live in [`deploy/deploy.md`](./deploy/deploy.md).

## Nginx notes
- Nginx listens on host port `80` and proxies HTTP traffic to the Node app container.
- WebSockets are proxied on `/ws` with the required `Upgrade` and `Connection` headers.
- Real client IPs are forwarded with `X-Forwarded-For`; the app uses `TRUST_PROXY=1` by default.
- No Let's Encrypt/TLS is configured because the target deployment is by IP only. If you later add a domain, terminate HTTPS in Nginx and forward traffic to the same app service.

## Environment variables
See `.env.example` for the supported settings:
- `PORT`
- `ROOM_TTL_MS`
- `CLEANUP_INTERVAL_MS`
- `TRUST_PROXY`
- `JOIN_RATE_LIMIT_WINDOW_MS`
- `JOIN_RATE_LIMIT_MAX_ATTEMPTS`
- `MAX_WS_FRAME_BYTES`
- `MAX_MESSAGE_BYTES`
