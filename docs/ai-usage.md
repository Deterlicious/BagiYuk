# Receipt OCR usage

## Boundary

OCR only turns a user-selected receipt image into editable structured input. It never assigns items, allocates fees, or determines a person's final total. The deterministic calculator in `src/domain/billing` remains the only source of split totals.

## Production engines

BagiYuk production first calls the private `bagiyuk-receipt-ocr` Google Cloud Run service in `asia-southeast1`, which contains the pretrained PP-OCRv6 small CPU models. Cloudflare validates the image, Turnstile token, and persistent D1 quota before obtaining a short-lived Google identity token. Cloud Run rejects unauthenticated direct requests. This path completed a live end-to-end receipt scan on 2026-08-11.

### Private workload identity

The Worker uses Google Workload Identity Federation rather than a downloadable Google service-account private key:

- The dedicated `bagiyuk-cloudflare/bagiyuk-worker` provider validates an uploaded RSA public JWKS. The stable issuer is the production Worker URL plus `/wif`; no OpenID discovery or public JWKS endpoint is required.
- For each uncached identity exchange, the Worker creates a five-minute RS256 assertion with a fixed production subject and fixed `environment`/`workload` claims. The signing private key is available only as a Cloudflare Worker secret. It is never included in the application bundle or sent to the browser or Cloud Run.
- Google Security Token Service exchanges the assertion for a scoped federated access token. IAM Credentials then returns a Google-signed ID token whose audience is the exact private Cloud Run origin.
- Before reuse, the Worker validates the ID token issuer, audience, verified invoker email, and expiration. A valid token is cached in Worker memory until shortly before expiry; no identity token is returned to the client.
- The federated IAM grant is restricted to the exact `bagiyuk-receipt-ocr-prod` subject and the least-privilege `roles/iam.serviceAccountOpenIdTokenCreator` role. The resulting invoker service account has `roles/run.invoker` only on this OCR service. The OCR runtime identity has no project role.

This design removes the Google service-account-key lifecycle and narrows the identity blast radius. It still has one long-lived workload-signing secret at Cloudflare, so that key must be rotated with an overlapping uploaded JWKS and treated as production infrastructure. See `docs/deployment.md` for provisioning, rotation, incident response, and rollback.

- Before upload, a narrow receipt crop is enlarged within the 2,500 px/4 MiB server boundary and rendered as a balanced grayscale image. The server then corrects document and text-line orientation and returns only text, confidence, and polygons. The existing TypeScript parser remains responsible for converting those untrusted lines into editable fields.
- The service accepts one JPEG, PNG, or WebP image up to 4 MiB and 20 megapixels. It decodes the image in memory, does not write temporary files, disables application access logs, never logs request bodies/content, and discards request data after inference. Cloud Run still emits platform request metadata.
- Server OCR is capped at 3 scans/day and 20/month per anonymous device, 10/day and 50/month per network, and 800 accepted server attempts/month globally. A reservation is intentionally not refunded after authentication/inference begins, even if identity exchange, inference, or the response fails.
- Anonymous device/network values are HMAC-hashed before D1 storage; IPv6 privacy addresses are grouped by /64. Opaque reservations older than 70 days are removed opportunistically. Raw IP addresses, image contents, item text, and monetary values are never stored in the quota database.
- Full PP-StructureV3 is deliberately excluded: its official lightweight CPU benchmark peaks near 13 GiB RAM, which conflicts with the free-tier cost guardrail.

The following browser engine remains the automatic no-cost fallback, the default whenever server OCR is not configured, and an independent cross-check for structurally suspicious server results:

BagiYuk uses the stable `@paddleocr/paddleocr-js` package with the pretrained PP-OCRv6 Indonesian/Latin model. The runtime performs text detection and recognition in the browser through a Web Worker and ONNX Runtime Web/WASM. The WASM-only bundle keeps every static asset below Cloudflare Workers' 25 MiB limit and works consistently across mobile browsers.

- Browser OCR requires no Cloudflare Workers AI binding or API key.
- The Paddle detection and recognition models total about 31 MB and are downloaded on the first scan, then reused from the browser cache.
- The package is loaded dynamically only after the user selects a valid receipt photo, so it does not increase the homepage's initial JavaScript path.
- The scan UI reports five real pipeline stages and elapsed time, including an optional enhancement pass, then offers cancel/manual exits during a slow first run. A two-minute ceiling stops a stalled scan with an actionable error.
- ONNX Runtime uses the broadly compatible single-thread WASM path because cross-origin isolation can block PaddleOCR's generated module worker on the Cloudflare static-asset path.
- The WebAssembly CDN version is pinned to the installed ONNX Runtime version to avoid a JavaScript/binary mismatch.
- OCR returns text, polygons, and confidence scores. BagiYuk groups fragments into visual rows and parses Indonesian rupiah deterministically.
- A server result is cross-checked locally when reconciliation is weak, summary arithmetic conflicts, names are suspicious, trusted totals are missing, or the receipt has at least 20 items. Candidate ranking prefers exact item reconciliation with a coherent trusted subtotal/total, then clean labels over inferred placeholders and more complete trusted summary fields before item count and confidence are used as tie-breakers.
- If a local cross-check fails or exceeds its 60-second phase limit, the editable server result is preserved with an explicit mandatory-review notice instead of discarding all progress.

The deterministic mock provider remains available only for development and tests. Production currently selects `cloudrun`; the configuration endpoint reports it enabled only when WIF, the private service URL, D1, Turnstile, and every required secret are present. An incomplete server configuration fails closed and the product falls back to local OCR or manual input.

## Input and privacy

- The browser detects likely receipt-paper bounds, crops excess background, upscales narrow receipts, produces aligned balanced/high-contrast variants, caps the longest edge at 3,200 px, and strips embedded metadata through canvas when browser APIs allow it. The original local preview is unchanged.
- The balanced variant is scanned first. The stronger variant is only scanned when item names look like prices or detected line totals do not reasonably cover the printed subtotal, avoiding a routine two-pass speed penalty.
- Parsing starts only after the explicit camera/gallery selection action.
- For protected server OCR, the browser sends only a metadata-free, compressed copy to the BagiYuk Worker and private Cloud Run service. It exists only for that request and is not written to storage or logs.
- When local fallback is used, the receipt image and inference remain on the user's device.
- The browser preview is an in-memory object URL and is revoked when replaced or removed.
- The service worker never caches receipt image requests.

## Structured output

OCR fragments are untrusted input. The deterministic parser:

- groups fragments by their detected coordinates;
- recognizes quantity, item name, unit price, and line total even when a POS printer places them in separate columns or adjacent rows;
- accepts `Rp` and `IDR` prefixes without allowing standalone prices to become item names;
- extracts subtotal, tax, service, discount, rounding, and total labels;
- scores multiple OCR candidates by reconciliation, confidence, item coverage, and name quality;
- keeps detected item labels when one amount box is missing, infers at most one missing amount from an exact printed-subtotal gap, and marks that inferred value low-confidence;
- repairs a narrowly detected one-row tail shift only when quantity divisibility, unit-price dispersion, and the printed subtotal all improve; a displaced amount whose label is still missing remains an explicit low-confidence `Item belum terbaca` row;
- preserves all rupiah values as safe integers;
- validates the final editable receipt with Zod; and
- exposes low-confidence fields as **Periksa**.

When a line total divides evenly by its quantity, the unit price is derived exactly. Otherwise the verified line total remains authoritative for that editable item. Small rounding differences can be inferred from the receipt total, but every field remains editable and the billing domain independently reconciles the final allocation.

## Fallbacks

If Turnstile, D1, private Cloud Run, or its quota is unavailable, the UI automatically continues with the browser engine without consuming more server quota. If the browser model cannot download, WASM is unavailable, or OCR finds no item rows, the selected preview remains visible and the user can retry or continue with **Masukkan manual**. Structurally suspicious results remain visibly low-confidence and editable. The sample-data and complete manual journeys remain usable without either OCR engine.
