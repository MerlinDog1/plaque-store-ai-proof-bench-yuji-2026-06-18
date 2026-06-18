# PlaqueStore Competitor Audit

Captured: 2026-06-16

## URLs Reviewed

- `https://plaquestore.co.uk/`
- `https://plaquestore.co.uk/products/brass-wall-plaque`

## Local Evidence

- `output/competitor/plaquestore-home-desktop-clean.png`
- `output/competitor/plaquestore-home-mobile.png`
- `output/competitor/plaquestore-brass-wall-product-clean.png`
- `output/competitor/plaquestore-product-extract.json`

## What PlaqueStore Does Well

1. It looks like a real shop quickly. The first screen uses product photography, Google review proof, category navigation, and practical trust signals instead of abstract design language.
2. It makes the basic promise clear: bespoke engraved plaques, made in the UK, with a visible lead-time and free artwork approval.
3. It has a familiar ecommerce structure. Search, cart, account, product pages, add-to-cart, product categories, and policy links are immediately recognisable.
4. The product page is commercially specific. The brass wall plaque page exposes size, backing board, font, engraving text, logo/image, border, screw-hole, and additional-detail options.
5. The product photography is stronger than the current Plaque Store AI prototype. The buyer can see brass plates, mounting context, and material finish before they read much copy.
6. It has a service fallback. Enquiry links, contact details, guides, and artwork approval help customers who are unsure.

## What PlaqueStore Does Poorly

1. It does not give an instant proof. The customer types wording into a form, but the final composition is still deferred to the later artwork approval process.
2. The product builder is form-heavy. Options are commercially useful, but they are not tied to a live visual proof beside the controls.
3. Text fitting is opaque. The page gives character-count style constraints, but not safe-area warnings, line fit feedback, or production-margin feedback.
4. The buying journey starts from SKUs rather than intent. Customers must choose a product page before the site helps them translate use case into material, size, fixing, and wording.
5. Mobile is modal-heavy and long-form. The cookie dialog and stacked product form interrupt the path to purchase.
6. The font picker is not visually meaningful enough. Font labels are selectable, but the user still has to imagine the plaque.
7. Pricing is mostly option-driven rather than proof-driven. The page can price add-ons, but it does not explain why a bigger plaque or backing board is needed for the wording.
8. The strongest promise is operational, not technical. "Free artwork approval" is credible, but it is slower than a real-time proof workstation.

## Competitive Position

PlaqueStore is a credible traditional ecommerce plaque shop. It wins on trust, product photography, category coverage, and familiar checkout behaviour.

Plaque Store AI should not try to beat it with a generic landing page. The viable wedge is:

> Choose a plaque, type the wording, see a production-safe proof immediately, then order or request human review.

That means we need to match PlaqueStore's commercial basics, then exceed it with the existing plaque designer's proof engine.

## Required Product Response

- Use real-looking product photography and product context from the first viewport.
- Keep ecommerce trust signals: lead time, UK production, material quality, proof approval, reviews/testimonials.
- Put live proof beside the controls on product pages.
- Explain fit, safe margins, and long wording directly in the UI.
- Recommend size/material/fixing from customer intent.
- Keep an enquiry path, but make instant proof the primary conversion path.
- Use Gemini/Nano Banana-style image generation for hero and product assets where real photography is not available.
