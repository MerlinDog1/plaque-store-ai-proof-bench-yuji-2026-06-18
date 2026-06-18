# Status

## Current Milestone

R1 - Restart From Plaque Designer Base

## Last Verified Artifact

Restart pass verified:

- Local: `/home/clawd_bot/clawd/plaque-store-ai`
- GitHub: `https://github.com/MerlinDog1/plaque-store-ai`
- Public preview: `https://lindsay-magnet-petition-flux.trycloudflare.com`
- Competitor audit: `docs/COMPETITOR_AUDIT.md`
- Restart brief: `docs/RESTART_BRIEF.md`
- App base: copied from `/home/clawd_bot/clawd/plaque-designer-full-feature-current`
- Preserved real proof engine: React/Vite app, `PlaquePreview`, safe-margin logic, inscription layout, export service, Gemini realistic preview hooks
- Gemini is wired through `server.mjs`: frontend calls same-origin `/api/gemini/*`, and the server reads ignored `.env.local` so the API key is not baked into `dist/`
- First shop-mode pass: public title/header/steps changed from memorial-first to Plaque Store AI proof-builder language
- Deployment note: `DEPLOYMENT.md`
- Screenshots:
  - `output/competitor/plaquestore-home-desktop-clean.png`
  - `output/competitor/plaquestore-home-mobile.png`
  - `output/competitor/plaquestore-brass-wall-product-clean.png`
  - `output/playwright/restart-shop-mode-live-desktop.png`
  - `output/playwright/restart-shop-mode-live-mobile.png`

## Last Verification

`npm run build` passes.

Local production server returned HTTP 200 from `http://127.0.0.1:4179/`.

Public preview returned HTTP 200 from `https://lindsay-magnet-petition-flux.trycloudflare.com`.

`/api/gemini/health` returned `{"ok":true,"hasKey":true}` locally and through the public tunnel.

`npm run check:gemini` passes and verifies a real Gemini-authored proof via proxy HTTP 200.

Desktop and mobile screenshots were captured from the rebuilt public preview.

`npm run test:export-fidelity` still needs a separate repair pass; it timed out in the older mobile generated-layout path before the dedicated Gemini smoke test was added.

## Blockers

The rebuilt app still contains donor internals and optional artwork code named around memorial/portrait concepts. Public wording has been softened to shop/proof language, but R2 must strip or isolate that flow properly.

## Next Command

Commit and push restart pass, then continue R2 product-page rebuild.
