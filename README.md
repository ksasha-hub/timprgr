# timprgr

Minimal one-time **end-to-end encrypted** (E2E) 2-person chat rooms via a one-time room code.

## What it does
- Create a room code, share it with another person.
- Both enter the same code to join the room.
- The browser derives a `roomId` from the code (SHA-256) and joins over WebSocket.
- Clients perform an **ephemeral ECDH** key exchange and derive a shared session key.
- Messages are encrypted with **AES-256-GCM** in the browser.
- The server never sees plaintext.
- Room state is **in-memory only** and is destroyed when empty or when TTL expires.

## Run locally
```bash
npm install
npm run dev
```

Open:
- http://localhost:3000

## Environment variables
Copy `.env.example` to `.env` if desired.

- `PORT` (default: 3000)
- `ROOM_TTL_MS` (default: 3600000 = 1 hour)
- `CLEANUP_INTERVAL_MS` (default: 60000 = 1 minute)

## Notes / security
- This is a minimal prototype.
- No message history is persisted to disk.
- Room codes must be shared out-of-band.
- To reduce brute force risk, keep room codes reasonably long.
