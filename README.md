# Plaque Store AI Proof Bench - Yuji Copy - 2026-06-18

Yuji-marked copy of the consumer-facing Plaque Store AI proof bench build as
of 2026-06-18.

Source snapshot:

- original working repo: `MerlinDog1/plaque-store-ai-consumer`
- source commit: `42bd86af2718f94fd2b15f75fb09f58edcb13758`
- fresh repo label: `plaque-store-ai-proof-bench-2026-06-18`
- Yuji copy label: `plaque-store-ai-proof-bench-yuji-2026-06-18`

This snapshot includes the current proof-bench UI and the latest fixes:

- compact `Fixings and border` controls;
- no customer-facing inset border option;
- no scalloped border options on bench-plaque class sizes;
- corrected wood-backed stainless/brass texture alignment;
- fixed double-scallop decorative cap positions;
- 3D preview text rendered from outlined live SVG text so fonts stay correct;
- 3D preview physical layer work for metal face, wood backing, caps, and live
  SVG proof textures.

## Security

- No API keys, credentials, customer records, local agent files, generated
  proofs, screenshots, build output, or machine-specific paths are included.
- Keep real credentials in `.env.local`; that file is ignored by Git.
- `.env.example` contains variable names only.

## Run Locally

Prerequisite: Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local
# Add GEMINI_API_KEY to .env.local
npm run dev
```

## Verify

```bash
npx tsc --noEmit
npm run build
npm run check:preview-geometry
npm run check:fixings-border-ui
```

The optional export-fidelity check expects a running app and may create local
output files, which are ignored:

```bash
npm run test:export-fidelity
```
