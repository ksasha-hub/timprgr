# VPS deployment

## Requirements
- Ubuntu VPS with root or sudo
- Docker Engine with Compose plugin installed
- Port `80/tcp` open on the VPS firewall/security group

## Copy project to the VPS
```bash
git clone https://github.com/YOUR_USERNAME/timprgr.git
cd timprgr
cp .env.example .env
```

## Start the stack
```bash
docker compose up -d --build
```

Open `http://YOUR_SERVER_IP`.

## Updating
```bash
git pull
docker compose up -d --build
```

## Notes
- The app listens behind Nginx on `/` and WebSockets on `/ws`.
- Nginx forwards the real client IP with `X-Forwarded-For`; the app trusts one proxy hop by default.
- No TLS is configured here because the target deployment is by IP only. If you later add a domain, terminate HTTPS in Nginx and forward to the same app container.
