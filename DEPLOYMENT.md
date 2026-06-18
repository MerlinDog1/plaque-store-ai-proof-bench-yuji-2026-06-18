# Deployment Preview

## Managed Preview Services

The current local/public preview is managed by user systemd services:

- `plaque-store-ai.service` runs `node server.mjs` on `http://127.0.0.1:4179/`, serving the production build in `dist/` and proxying Gemini requests through `/api/gemini/*`.
- `plaque-store-ai-tunnel.service` exposes that local server through Cloudflare Tunnel.

Useful commands:

```bash
systemctl --user status plaque-store-ai.service plaque-store-ai-tunnel.service
journalctl --user -u plaque-store-ai-tunnel.service -n 80 --no-pager
```

## Current Public Preview

`https://polo-vic-consumer-nomination.trycloudflare.com`

## Gemini Runtime

The Gemini key lives in ignored local env files such as `.env.local`.

Do not reintroduce Vite build-time key injection. The browser must call the same-origin Node proxy so `GEMINI_API_KEY` is never embedded in the static assets.

Cloudflare quick tunnels are suitable for prototype review only and do not carry an uptime guarantee.
