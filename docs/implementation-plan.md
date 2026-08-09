# BagiYuk MVP Implementation Plan

Status: completed
Last updated: 10 August 2026

## Professional experience upgrade

- Strengthen receipt-scan trust with a visible photo-quality checklist, clearer review counts for low-confidence fields, and reconciliation guidance before continuing.
- Accelerate item assignment with bulk owner actions, per-person running totals, and item duplication while preserving deterministic calculation in `src/domain/billing`.
- Expand results into a payment-ready handoff with individual WhatsApp messages, individual copy actions, and a downloadable branded PNG summary generated locally.
- Add a concise Help & Privacy page covering receipt photography, fee allocation, reconciliation, offline fallback, and on-device image handling.
- Add accessible global toast feedback, a respectful PWA install prompt, explicit empty/error states, and privacy-safe first-party event counters that never include receipt contents or personal names.
- Extend unit and Playwright coverage for the new professional workflow at mobile and desktop sizes.
- Deliberately exclude bill history from this upgrade; normalized draft autosave remains the only local persistence.

Upgrade verification completed on 10 August 2026:

- Receipt verification exposes a live low-confidence count and requires an explicit correction or review confirmation before continuing.
- Assignment shortcuts, participant/item duplication, and domain-calculated running subtotals work across mobile and desktop without changing final billing authority.
- Results provide group share/copy, individual WhatsApp-ready messages, individual copy actions, and a locally rendered PNG download.
- The Help & Privacy route, delayed PWA install prompt, accessible toast, and allow-listed Analytics Engine event endpoint are included in the offline-safe shell.
- TypeScript, ESLint, 38 Vitest checks, the Next.js/OpenNext build, and ten Playwright scenarios pass. Workerd returned HTTP 200 for the homepage, help page, and manifest plus HTTP 204 for analytics.
- Manual browser QA at 390×844 and 1440×1000 found no horizontal overflow or console errors.

## Production hotfix: OCR worker compatibility and POS layouts

- Remove cross-origin isolation headers after production evidence showed that the PaddleOCR module worker was blocked before inference.
- Return ONNX Runtime WASM to the broadly compatible single-thread path while preserving the matching runtime/binary version.
- Accept quantity prefixes written as `2x`, item descriptions written as `name @ quantity x unit price`, and Indonesian `PB1` tax labels.
- Exclude payment and change rows from receipt-total detection so cash tendered cannot replace the actual bill total.
- Add regression fixtures based on the supplied Meatsmith and CW Coffee receipts and verify both real images in the browser before redeployment.

Hotfix verification completed on 7 August 2026:

- The supplied Meatsmith image produced all seven items and reconciled exactly to subtotal Rp2,845,000, tax Rp312,950, and total Rp3,157,950.
- The supplied CW Coffee image produced its single Rp7,272 item, inferred the misaligned PB1 value as Rp727, kept Rp1 rounding editable, and reconciled exactly to Rp8,000.
- The long Pagi Sore image reached verification with 45 editable items and reconciled exactly to subtotal Rp7,476,000 and total Rp8,223,600; low-confidence tail fields remain visibly marked for mandatory review.
- The Cloudflare `workerd` preview returned HTTP 200 without COOP/COEP, confirming that generated PaddleOCR worker assets are no longer isolated from the page.
- Scan failures now include an optional, URL-sanitized technical detail disclosure for support without overwhelming the primary recovery actions.
- The deployed Worker was reloaded with a fresh asset build and the real Meatsmith image completed successfully on the production URL with seven items and exact reconciliation.

## Production follow-up: scan feedback and first-run performance

- Start OCR automatically as soon as a valid camera/gallery image is selected so the upload action has an immediate, predictable result.
- Keep validation errors visible even when no preview can be created, including files with missing browser MIME metadata.
- Replace the single spinner with an accessible staged scan panel that explains preparation, engine loading, text recognition, and result assembly while showing elapsed time.
- Offer cancel, retry, replace-photo, and manual-entry exits without persisting or uploading the receipt image.
- Add a bounded timeout and distinguish offline/model-load failures from receipts whose text cannot be structured.
- Match the ONNX Runtime WebAssembly binary version to the installed runtime and keep the compatible single-thread worker path.
- Add regression coverage for file validation and scan-progress behavior without imposing cross-origin isolation on generated worker assets.
- Re-run the full quality gates and manually verify the upload/scan experience at mobile and desktop viewports before deployment.

## Production follow-up: receipt extraction reliability

- Replace remote vision-LLM extraction with the pretrained PP-OCRv6 Indonesian/Latin model through PaddleOCR.js.
- Run detection and recognition locally in a browser Web Worker/WASM so receipt images never leave the device.
- Group OCR fragments by geometry, parse Indonesian item/summary rows deterministically, validate with Zod, and preserve editable confidence indicators.
- Automatically crop, upscale, grayscale, and increase contrast for receipt photos before local inference without persisting the image.
- Preserve retry/manual fallbacks when models cannot download or a receipt layout cannot be parsed.
- Remove the Cloudflare Workers AI binding from production while retaining the mock/provider boundary for tests and optional future use.
- Make homepage start actions explicit: a fresh split clears a stored sample/draft, while direct `/split/new` navigation may still resume a draft.
- Add regression tests for provider response shapes, arithmetic confidence, and sample-to-fresh navigation.

## Scope

Build a production-ready, mobile-first BagiYuk MVP that supports receipt image parsing as an optional enhancement and always provides a complete manual bill-splitting path. The product has no authentication, payment, accounting dashboard, or permanent receipt-image storage.

## Delivery plan

### 1. Foundation and design system

- Scaffold Next.js App Router with strict TypeScript, Tailwind CSS, stable Base UI-compatible primitives, Lucide, Motion, Zod, Vitest, and Playwright.
- Configure OpenNext for Cloudflare Workers so `pnpm preview` runs the production bundle in `workerd`.
- Establish the Warm Ledger tokens, Plus Jakarta Sans, application shell, responsive layout, semantic controls, focus treatment, and receipt motif.
- Add persistent project instructions, environment example, and version documentation.

### 2. Deterministic billing domain

- Model receipt items, participants, assignments, charges, allocations, and reconciliation with Zod boundaries.
- Store all money as integer rupiah and reject invalid, unsafe, negative, or missing values.
- Allocate shared-item remainders deterministically by stable participant order.
- Allocate tax, service, discount, and rounding proportionally with a deterministic largest-remainder algorithm.
- Keep calculated total and entered receipt total separate so mismatches remain visible.
- Cover ordinary, odd-remainder, fee, discount, rounding, large-value, invalid-input, duplicate-name, mismatch, and conservation cases with unit tests.

### 3. Complete manual flow

- Implement the five-step journey: Struk, Periksa, Anggota, Bagikan, Hasil.
- Support camera/gallery input, preview/remove/replace, manual entry, sample receipt data, full receipt editing, participant management, complete assignment validation, detailed results, copy/share, backward navigation, and confirmed reset.
- Autosave structured draft data in local storage without persisting the receipt image.
- Use sticky mobile actions, clear inline errors, Indonesian copy, and responsive desktop summaries.

### 4. OCR enhancement

- Add an on-device PaddleOCR.js/PP-OCRv6 engine plus a deterministic mock/server provider boundary.
- Preprocess the selected image, group detected text by geometry, parse integer-rupiah rows, and validate editable output with Zod.
- Surface low-confidence fields for review, parsing progress, retry, safe errors, and manual fallback.
- Never allow OCR to calculate the final split or introduce browser credentials.

### 5. PWA, accessibility, sharing, and polish

- Add a valid manifest, legal generated icons, install metadata, offline application shell, and offline manual workflow.
- Use Web Share with clipboard fallback and WhatsApp-readable Indonesian output.
- Verify keyboard operation, live regions, target sizes, reduced motion, 200% zoom resilience, mobile safe areas, and visible focus.
- Use Motion only for short, state-explaining transitions.

### 6. Verification and handoff

- Add Playwright coverage for the required sample-data journey on 390x844 and desktop viewports.
- Run and fix `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm preview`, and `pnpm test:e2e` when browser binaries are available.
- Manually inspect core screens at mobile and desktop widths and verify the production `workerd` preview.
- Complete README, stack versions, AI usage, deployment, and known-limitations documentation.

## Architecture decisions

- Use a local reducer/context because the workflow is a compact client-side wizard and does not need external server state.
- Persist only normalized draft JSON in local storage; keep selected image data in memory and discard it on reload/reset.
- Make the pure domain calculator the only source of split totals. The UI and AI layer provide inputs but never calculate money independently.
- Treat the entered receipt total as a reconciliation reference. Allocations use the sum of verified items plus explicit charges, preserving any mismatch for correction.
- Keep the optional server provider on mock by default; production OCR is credential-free and runs in the browser.

## Definition of done

- A user can complete and share a reconciled split from sample data or fully manual input without AI or Cloudflare credentials.
- Shared items and all charge allocations conserve integer rupiah exactly and have automated test coverage.
- OCR results are editable, confidence-aware, schema-validated, and recoverable through retry/manual entry.
- The app is responsive, keyboard usable, installable as a PWA, and the required quality gates pass.

## Verification record

Completed on 6 August 2026:

- Strict TypeScript and ESLint pass without source warnings.
- 26 Vitest checks pass, including deterministic billing, provider boundaries, OCR geometry/column parsing, Indonesian rupiah normalization, and image preprocessing.
- Six Playwright checks pass: the full journey on 390×844 and desktop, 200% text-size reflow, and the sample-to-fresh-start regression on both viewports.
- Next.js production build completes with a self-hosted Plus Jakarta Sans variable font.
- OpenNext builds the Worker bundle and `pnpm preview` starts Wrangler `workerd`; homepage, manifest, and fresh split route return HTTP 200.
- Browser OCR was verified against two supplied real receipts: the simple receipt produced 2/2 exact item rows and a reconciled Rp694.500 total; the long receipt produced 45/45 item rows whose sum exactly matches the Rp7.476.000 printed subtotal and Rp8.223.600 total.
- Homepage and verification screens were visually inspected from the generated mobile and desktop captures.

Production scan UX follow-up completed on 7 August 2026:

- A valid camera/gallery selection now starts OCR immediately and exposes preparation, engine loading, recognition, and result-assembly stages with elapsed time.
- Invalid uploads always show an actionable error; missing MIME metadata falls back safely to the supported file extension.
- Cancellation, retry, replacement, manual fallback, differentiated offline/model/parser failures, and a two-minute timeout were manually verified.
- The simple supplied receipt still parsed to two exact rows and a reconciled Rp694.500 total after the runtime change.
- ONNX Runtime uses the matching 1.27.0 WASM binary; the attempted COOP/COEP threading optimization was removed after production worker compatibility testing.
- 36 Vitest checks and eight Playwright scenarios pass across 390×844 mobile and desktop projects; the OpenNext `workerd` preview returns HTTP 200 without the incompatible isolation headers.

## Known MVP limitations

- The first OCR scan downloads roughly 31 MB of model files and therefore needs an internet connection; the complete manual flow remains available without it.
- Unusual receipt layouts, faint thermal print, glare, or severely cropped images can still require manual correction.
- Parse rate limiting is best effort per Worker isolate rather than distributed.
- Offline shell behavior is implemented but not included in the automated browser suite.
