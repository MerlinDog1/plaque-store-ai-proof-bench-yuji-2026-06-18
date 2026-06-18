# Plaque Store AI Spec

## Goal

Build a better ecommerce plaque store inspired by the buying intents on `plaquestore.co.uk`, but differentiated by instant professional text plaque proofs.

Primary hook:

> Professional plaque proof in minutes. Your plaque in days.

## Product Position

This is a practical ecommerce plaque shop, not the high-end photo memorial/image-generation product.

The site should sell text-led engraved plaques with:

- clear product categories;
- live pricing;
- instant proof preview;
- AI-style text layout;
- basket/checkout placeholder;
- simple path from wording to proof to order.

## In Scope

- New standalone repo and app.
- Homepage / storefront.
- Product categories:
  - wall plaques;
  - bench plaques;
  - tree and garden stake plaques;
  - commemorative plaques;
  - business plaques;
  - industrial labels and tags.
- Text-only plaque configurator.
- Smart typography/layout using deterministic local logic.
- Live SVG proof preview.
- Price estimate using our current plaque pricing baseline.
- Placeholder checkout that records the selected configuration locally.
- Downloadable proof SVG or summary.

## Out Of Scope For First Build

- Photo upload.
- AI image generation.
- Portrait/sketch workflow.
- Real payment checkout.
- Real backend/email/order persistence.
- Supplier-ready final production export.

## Pricing Baseline

Use the current simplified pricing logic:

- retail starts from supplier cost x 2;
- add product-specific production allowance where needed;
- add UK packing/postage allowance;
- round to customer-facing prices ending in 9.

Exact first-build prices can be simplified into product bands, then refined once the flow is working.

## UX Requirements

- The first screen must show the hook and proof promise.
- Customer can pick a product category quickly.
- Customer can enter wording without understanding design rules.
- Proof updates immediately.
- The page should feel faster and more helpful than a static Shopify catalogue.
- Checkout must clearly say it is a placeholder in this prototype.

## Evidence Rule

Progress is only reportable when there is a file, commit, screenshot, build output, or running URL to point at.
