# Plaque Store AI Restart Brief

## Decision

Do not continue improving the static `index.html` scaffold as the product base.

The next build must start from the existing full-feature plaque designer:

`/home/clawd_bot/clawd/plaque-designer-full-feature-current`

That repo already contains the hard parts that the weak scaffold tried to fake.

## Donor Code To Reuse

- `types.ts` for plaque state, materials, shapes, fixings, backing, border, text colour, and defaults.
- `components/PlaquePreview.tsx` for the real SVG plaque preview composition.
- `services/inscriptionLayout.ts` for safe-area and text-layout geometry.
- `services/safeMargin.ts` for production margin rules.
- `services/plaqueRules.ts` for plaque-specific constraints such as bench plaque behaviour.
- `services/exportService.ts` for proof/export output paths.
- `services/geminiService.ts` for typography/layout generation and realistic preview prompting.
- `scripts/validate-export-fidelity.mjs` for visual/export regression checks.

## What To Strip For This Store

- Memorial portrait/photo generation as the primary journey.
- Pet/person portrait upload flow.
- Grayscale portrait preparation UI.
- Any copy that positions the app as a memorial-art generator instead of a plaque shop.

The realistic preview service can remain, but it should generate product-context shots for plaques, not portrait-led memorial art.

## Product Shape

The rebuilt app should feel like a shop with a proof workstation, not a design toy.

Primary flows:

1. Wall plaque
2. Bench plaque
3. Garden/tree stake plaque
4. Business/office plaque
5. Industrial tag/nameplate

Each flow should include:

- product photography or generated realistic product context;
- size/material/fixing presets;
- wording entry;
- live production-safe proof;
- warning/recommendation when wording does not fit well;
- price estimate;
- add to basket or request human artwork check.

## Gemini Asset Plan

Use the local Gemini/Nano Banana image workflow for:

- desktop hero: brass wall plaque in real hallway or office context;
- mobile hero: close crop of engraved brass plaque with readable texture;
- bench plaque example mounted on wood;
- garden stake plaque in soil/planting context;
- business plaque mounted on exterior/interior wall;
- material close-ups: brass, stainless, acrylic, laminate.

Generated images should be used as supporting product context, not as the proof engine. The proof engine stays SVG/React and production-safe.

## UX Direction From Competitor Audit

Match PlaqueStore on:

- real product context;
- trust signals;
- category coverage;
- simple ecommerce language;
- add-to-cart familiarity.

Beat PlaqueStore on:

- instant proof before checkout;
- live fit/safe-margin feedback;
- size recommendations from wording;
- visible material/fixing effect in the proof;
- proof download and human-review handoff.

## First Rebuild Milestones

### R0 - Preserve Audit And Reset Base

- Commit this audit and restart brief.
- Replace the static scaffold with the full-feature plaque designer base.
- Keep deployment notes and competitor evidence.

### R1 - Text-Only Shop Mode

- Strip portrait-first UI.
- Keep plaque preview, safe margins, inscription layout, materials, fixings, export.
- Add shop-oriented category presets.

### R2 - Competitive Product Page

- Build a PlaqueStore-competitive wall plaque page.
- Put product photo/context, trust signals, controls, live proof, and price in one coherent buying flow.

### R3 - Gemini Product Assets

- Generate and wire realistic hero/product imagery using the Gemini workflow.
- Verify desktop and mobile first viewport screenshots.

### R4 - Proof Basket

- Add basket/order-summary flow that carries proof SVG, selected options, price, and customer wording.

## Acceptance Rule

No progress should be reported as product improvement unless it is backed by:

- committed files;
- passing build/check;
- screenshot evidence;
- live preview or local URL evidence.
