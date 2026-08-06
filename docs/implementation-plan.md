# BagiYuk MVP Implementation Plan

Status: completed
Last updated: 6 August 2026

## Production follow-up: receipt extraction reliability

- Replace the single Moondream request with a document-oriented Workers AI primary model and a lightweight fallback.
- Route very tall, long-item receipts to the faster extraction attempt first while retaining the document model as fallback.
- Request a smaller structured extraction shape, validate it with Zod, and derive editable confidence indicators deterministically.
- Automatically crop, upscale, grayscale, and increase contrast for receipt photos before upload without persisting the image.
- Increase the guarded inference timeout for long receipts and preserve retry/manual fallbacks.
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

### 4. OCR/AI enhancement

- Add a server-only receipt-parser provider interface, deterministic mock provider, and Cloudflare Workers AI implementation.
- Validate upload type and size, request strict JSON from a current non-deprecated vision model, normalize the response, and validate it with Zod.
- Surface low-confidence fields for review, parsing progress, retry, safe errors, and manual fallback.
- Never allow AI to calculate the final split or expose credentials to the client.

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
- Keep provider selection server-side through environment bindings: mock by default, Cloudflare Workers AI only when configured.

## Definition of done

- A user can complete and share a reconciled split from sample data or fully manual input without AI or Cloudflare credentials.
- Shared items and all charge allocations conserve integer rupiah exactly and have automated test coverage.
- OCR results are editable, confidence-aware, schema-validated, and recoverable through retry/manual entry.
- The app is responsive, keyboard usable, installable as a PWA, and the required quality gates pass.

## Verification record

Completed on 6 August 2026:

- Strict TypeScript and ESLint pass without source warnings.
- 19 Vitest tests pass across deterministic billing, conservation, AI normalization, and image-header validation.
- Four Playwright checks pass: the full journey on 390×844 and desktop, plus 200% text-size reflow on both viewports.
- Next.js production build completes with a self-hosted Plus Jakarta Sans variable font.
- OpenNext builds the Worker bundle and `pnpm preview` starts Wrangler `workerd`; homepage, manifest, and multipart mock parse return HTTP 200.
- Homepage and verification screens were visually inspected from the generated mobile and desktop captures.

## Known MVP limitations

- Real Workers AI inference was not executed because no Cloudflare credential/account binding was supplied; the production provider boundary is complete and the credential-free mock path was tested.
- Parse rate limiting is best effort per Worker isolate rather than distributed.
- Offline shell behavior is implemented but not included in the automated browser suite.
