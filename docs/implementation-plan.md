# BagiYuk MVP Implementation Plan

Status: Professional v2 implemented and verified locally
Last updated: 15 August 2026

## Professional v2 product hardening

- Split receipt scanning into independent server and local phases so a Cloud Run timeout cannot consume the browser fallback budget or discard a valid server candidate.
- Warm the local OCR engine only when the protected server scan is taking unusually long, preserve the best available candidate, and show phase-specific progress and recovery copy.
- Add an in-memory photo preflight and keep the receipt photo available during mandatory verification without saving it to draft storage.
- Support weighted item ownership (for example two portions versus one) while keeping integer-rupiah allocation and deterministic remainder handling exclusively in `src/domain/billing`.
- Let users select who paid the restaurant and generate clear transfer instructions from the final, reconciled allocation without introducing payments or accounts.
- Turn sample data into a complete guided example, surface resumable local drafts on the homepage, and preserve explicit fresh-start behavior.
- Add dedicated privacy and system-diagnostic pages, branded error and not-found states, richer metadata, safe response headers, print-friendly results, and CI quality gates.
- Extend unit and end-to-end coverage for weighted allocation, OCR fallback, resume/sample behavior, settlement handoff, accessibility, and mobile/desktop layouts.
- Verify the complete release through TypeScript, lint, unit tests, production build, `workerd` preview, and Playwright before deployment.

Verification completed on 15 August 2026:

- Protected server and local OCR now have independent phase budgets; delayed local prewarming begins only after a slow server phase, and a valid server result survives a local cross-check timeout.
- Photo preflight reports resolution, lighting, sharpness, and framing guidance. Users can override automatic crop with the full-photo mode, and the original in-memory photo remains available during mandatory verification without entering draft storage.
- Weighted item portions are enforced through the existing integer-only domain allocator. A 2:1 odd-rupiah regression case and conservation assertion pass.
- The guided sample includes three members and complete assignments. Results now support an optional initial payer, transfer instructions, individual payer-aware messages, and print/PDF output without adding payment processing.
- Homepage draft resume, Privacy, Diagnostics, custom error/404, generated PNG/maskable PWA assets, social preview, sitemap/robots, safe response headers, offline-shell expansion, and GitHub Actions/Dependabot configuration are included.
- TypeScript, ESLint, 61 Vitest checks, the Next.js production build, OpenNext bundle, and 12 Playwright mobile/desktop scenarios pass. `workerd` returned 200 for all public pages and metadata routes, 404 for an unknown route, and the expected `nosniff` header.
- Direct browser QA at 390×844 and 1440×1000 confirmed zero horizontal overflow, a usable weighted-assignment and settlement flow, a visible resumable draft, and no console warnings or errors.

## Protected Cloud Run receipt intelligence

- Keep the complete browser OCR and manual flows as credential-free fallbacks, but prefer the official pretrained PP-OCRv6 small server pipeline when configured; evaluate the medium weights only after measuring memory and p95 latency.
- Do not deploy full PP-StructureV3 on the free tier: its official lightweight CPU benchmark peaks near 13 GiB RAM and would undermine the billing guardrail. Use its trained general OCR pipeline with document and text-line orientation plus BagiYuk's deterministic layout parser instead.
- Add a small Python/FastAPI container that validates images in memory, corrects orientation, runs the pretrained CPU pipeline, returns only untrusted text/confidence/polygon JSON, and never writes receipt images to disk or logs their contents.
- Place the service behind the existing Cloudflare Worker API and private Google IAM. The Worker uses a subject-restricted Workload Identity Federation exchange to mint a short-lived service-account ID token, so clients cannot bypass Cloudflare quotas by calling the container URL directly. Do not create or store a Google service-account key.
- Replace isolate-local rate limiting with persistent D1 reservations: three server scans per anonymous device per day and twenty per month; ten per network per day and fifty per month; eight hundred accepted server attempts globally per month; plus a short burst ceiling. Hash network identifiers with a server secret and store only opaque counters.
- Require a single-use Cloudflare Turnstile token for every remote scan and validate its hostname/action at the Worker before reserving quota.
- Validate the request before spending quota: accepted image signatures only, at most 4 MiB, sane dimensions, at most 20 megapixels, one image per request, and bounded upstream/body timeouts.
- Return quota headers and an Indonesian recovery message with the next reset time. When server OCR is unavailable, limited, or unconfigured, transparently offer local OCR and manual entry without weakening the split flow.
- Configure Cloud Run for request-based billing, no GPU, minimum instances zero, maximum instances one, concurrency one, 1 vCPU/2 GiB, a 90-second request timeout, and no unauthenticated direct access. Keep a stricter application timeout because a platform timeout alone does not terminate container work.
- Add unit tests for quota windows, atomic limits, spoofed headers, image signatures/dimensions, upstream errors, and provider output validation; add an E2E scenario for quota recovery UI.
- Document one-time D1, Cloudflare secret, Google Cloud project/billing, container deployment, budget alert, and rollback procedures. Never commit generated secrets or credentials.

Verification completed on 11 August 2026:

- The Linux image build verifies pinned model checksums and runs real PP-OCRv6 inference with PaddleOCR 3.7.0, PaddleX 3.7.2, and PaddlePaddle 3.2.2; the incompatible 3.3.1 runtime was rejected after a real oneDNN inference failure.
- The final image is about 583 MB uncompressed, runs as `appuser`, starts with a read-only root filesystem, and uses an ephemeral `/tmp` cache.
- Four supplied real receipts produced 26, 122, 29, and 68 OCR lines in 2.56–12.54 seconds on the 1-vCPU profile. Ten consecutive scans averaged 1.9 seconds with memory stable near 800 MiB, below the 2-GiB limit.
- D1 migrations, Turnstile, the private Cloud Run service, and subject-restricted Workload Identity Federation are provisioned in production. Cloud Run uses 1 vCPU/2 GiB, concurrency one, minimum zero, maximum one, a dedicated role-free runtime identity, and service-level invoker IAM only.
- The production Worker reports server OCR enabled. A live protected request reached Cloud Run revision `bagiyuk-receipt-ocr-00001-cks`, returned HTTP 200 in 17.4 seconds including cold start, and parsed the supplied Meatsmith receipt into all seven item rows with exact subtotal, tax, and total reconciliation. Direct unauthenticated access remained unavailable.
- TypeScript, ESLint, 59 Vitest checks, three dependency-free Python boundary checks, container smoke inference, and 12 Playwright mobile/desktop scenarios pass. A project-scoped monthly Rp25,000 budget now alerts at 50%, 80%, and 100%; D1's 800-dispatch global ceiling and Cloud Run's one-instance maximum remain the active cost controls.

## Advanced local receipt intelligence

- Keep PP-OCRv6 as the credential-free recognition engine, but treat OCR text and receipt structure as separate stages with independent validation.
- Generate a normal grayscale crop and a stronger high-contrast crop from the same in-memory photo. Run the normal pass first and only scan the enhanced variant when item coverage or reconciliation indicates that the first result is incomplete.
- Score OCR candidates using item count, name quality, confidence, and agreement between detected line totals and the printed subtotal. Never prefer a candidate merely because it contains more text.
- Extend the deterministic layout parser for POS tables whose item name, quantity, unit price, and line total are returned as separate OCR boxes or as a single row with two price columns.
- Accept Indonesian currency prefixes while preventing standalone prices, tax rows, payment rows, and table headers from becoming item names.
- Surface a scan-health message during mandatory verification: exact subtotal agreement, likely missing rows, or likely duplicated/misaligned prices.
- Mark arithmetic mismatches as low-confidence editable input so users cannot silently continue with a structurally suspicious scan.
- Add regression fixtures based on the supplied Senandika and Nakoja table layouts, plus candidate-quality and conditional-retry tests.

Research basis (10 August 2026): PaddleOCR's official document preprocessing pipeline recommends orientation correction before OCR, while PP-StructureV3 is the official heavier option for structured documents. This section records the earlier browser-only implementation; the protected Cloud Run plan above supersedes its former no-Python/no-upload constraint while retaining browser OCR as fallback.

Verification completed on 10 August 2026:

- Regression fixtures for Senandika-style four-column tables and Nakoja-style name/detail rows parse their item names, quantities, `Rp`/`IDR` prices, PB1, subtotal, and total without turning prices into names.
- A real Meatsmith receipt completed in the mobile browser with 7/7 items, exact Rp2,845,000 subtotal reconciliation, and exact Rp3,157,950 total.
- The adaptive enhancement stage is visible during scanning, while already reconciled one-pass receipts do not incur the second OCR inference.
- A forced Rp155,000 item/subtotal gap produced the specific missing-row warning; 390×844 and 1440×1000 browser QA had no horizontal overflow or console errors.
- TypeScript, ESLint, 41 Vitest checks, the Next/OpenNext build, workerd HTTP checks, and ten Playwright scenarios pass.

## CORD dataset evaluation

- Use the CC-BY-4.0 Voxel51 CORD mirror as an evaluation corpus, not as production data or a browser download.
- Convert all 800 annotated OCR boxes into the same coordinate/text boundary consumed by the BagiYuk parser, then measure parse success, exact item count, subtotal, tax, service, rounding, and total accuracy.
- Cache the 5.7 MB annotation file and selected images under the ignored `.cache/cord` directory; do not commit the 1.3 GB dataset or receipt images.
- Select a deterministic stratified image subset covering few/many items, service/tax, rounding, narrow/tall layouts, and varied image sizes for end-to-end browser OCR checks.
- Store a machine-readable local benchmark report and document the dataset revision, limitations, commands, and observed results.
- Treat CORD as a post-OCR parsing benchmark first: its manually verified text boxes do not by themselves measure PaddleOCR recognition quality.

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
- The Help & Privacy route, delayed PWA install prompt, accessible toast, and allow-listed analytics endpoint are included in the offline-safe shell. Analytics storage remains optional when its Cloudflare binding is unavailable.
- TypeScript, ESLint, 38 Vitest checks, the Next.js/OpenNext build, and ten Playwright scenarios pass. Workerd returned HTTP 200 for the homepage, help page, and manifest plus HTTP 204 for the optional analytics endpoint.
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
- The long Pagi Sore image reached verification with all 45 monetary rows and reconciled exactly to subtotal Rp7,476,000 and total Rp8,223,600. OCR recognized 44 item names; the missing final label remains an explicit low-confidence placeholder, while the repaired tail prices are visibly marked for mandatory review.
- The Cloudflare `workerd` preview returned HTTP 200 without COOP/COEP, confirming that generated PaddleOCR worker assets are no longer isolated from the page.
- Scan failures now include an optional, URL-sanitized technical detail disclosure for support without overwhelming the primary recovery actions.
- The deployed Worker was reloaded with a fresh asset build and the real Meatsmith image completed successfully on the production URL with seven items and exact reconciliation.

## Production follow-up: scan feedback and first-run performance

- Start OCR automatically as soon as a valid camera/gallery image is selected so the upload action has an immediate, predictable result.
- Keep validation errors visible even when no preview can be created, including files with missing browser MIME metadata.
- Replace the single spinner with an accessible staged scan panel that explains preparation, engine loading, text recognition, and result assembly while showing elapsed time.
- Offer cancel, retry, replace-photo, and manual-entry exits without persisting the receipt image. Server upload is now optional, protected, metadata-free, and disclosed; local fallback remains on-device.
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
- Keep mock output development/test-only. Production fails closed unless every protected Cloud Run, WIF, Turnstile, and D1 dependency is configured; browser OCR and manual entry remain credential-free.

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
- Browser OCR was verified against two supplied real receipts: the simple receipt produced 2/2 exact item rows and a reconciled Rp694.500 total; the long receipt preserved all 45 monetary rows, recognized 44 names, exposed one missing name as a low-confidence editable placeholder, and matched the Rp7.476.000 printed subtotal and Rp8.223.600 total exactly.
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
- Protected server scans use persistent atomic D1 reservations plus device, network, burst, and global limits; local OCR and manual entry are unlimited.
- Offline shell behavior is implemented but not included in the automated browser suite.
