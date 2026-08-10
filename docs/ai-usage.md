# Receipt OCR usage

## Boundary

OCR only turns a user-selected receipt image into editable structured input. It never assigns items, allocates fees, or determines a person's final total. The deterministic calculator in `src/domain/billing` remains the only source of split totals.

## Production engines

When fully configured, BagiYuk first calls a private Google Cloud Run service containing the pretrained PP-OCRv6 small CPU models. Cloudflare validates the image, Turnstile token, and persistent D1 quota before minting a short-lived Google identity token. Cloud Run rejects unauthenticated direct requests.

- The server corrects document and text-line orientation and returns only text, confidence, and polygons. The existing TypeScript parser remains responsible for converting those untrusted lines into editable fields.
- The service accepts one JPEG, PNG, or WebP image up to 4 MiB and 20 megapixels. It decodes the image in memory, does not write temporary files, disables application access logs, never logs request bodies/content, and discards request data after inference. Cloud Run still emits platform request metadata.
- Server OCR is capped at 3 scans/day and 20/month per anonymous device, 10/day and 50/month per network, and 800 accepted server attempts/month globally. A reservation is intentionally not refunded after authentication/inference begins, even if identity exchange, inference, or the response fails.
- Anonymous device/network values are HMAC-hashed before D1 storage; IPv6 privacy addresses are grouped by /64. Opaque reservations older than 70 days are removed opportunistically. Raw IP addresses, image contents, item text, and monetary values are never stored in the quota database.
- Full PP-StructureV3 is deliberately excluded: its official lightweight CPU benchmark peaks near 13 GiB RAM, which conflicts with the free-tier cost guardrail.

The following browser engine remains the automatic no-cost fallback and the default whenever server OCR is not configured:

BagiYuk uses the stable `@paddleocr/paddleocr-js` package with the pretrained PP-OCRv6 Indonesian/Latin model. The runtime performs text detection and recognition in the browser through a Web Worker and ONNX Runtime Web/WASM. The WASM-only bundle keeps every static asset below Cloudflare Workers' 25 MiB limit and works consistently across mobile browsers.

- Browser OCR requires no Cloudflare Workers AI binding or API key.
- The Paddle detection and recognition models total about 31 MB and are downloaded on the first scan, then reused from the browser cache.
- The package is loaded dynamically only after the user selects a valid receipt photo, so it does not increase the homepage's initial JavaScript path.
- The scan UI reports five real pipeline stages and elapsed time, including an optional enhancement pass, then offers cancel/manual exits during a slow first run. A two-minute ceiling stops a stalled scan with an actionable error.
- ONNX Runtime uses the broadly compatible single-thread WASM path because cross-origin isolation can block PaddleOCR's generated module worker on the Cloudflare static-asset path.
- The WebAssembly CDN version is pinned to the installed ONNX Runtime version to avoid a JavaScript/binary mismatch.
- OCR returns text, polygons, and confidence scores. BagiYuk groups fragments into visual rows and parses Indonesian rupiah deterministically.

The deterministic mock provider remains available only for development and tests. Production selects `cloudrun` only after every protected-server dependency is configured; otherwise the endpoint fails closed and the product falls back to local OCR or manual input.

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
- preserves all rupiah values as safe integers;
- validates the final editable receipt with Zod; and
- exposes low-confidence fields as **Periksa**.

When a line total divides evenly by its quantity, the unit price is derived exactly. Otherwise the verified line total remains authoritative for that editable item. Small rounding differences can be inferred from the receipt total, but every field remains editable and the billing domain independently reconciles the final allocation.

## Fallbacks

If Turnstile, D1, private Cloud Run, or its quota is unavailable, the UI automatically continues with the browser engine without consuming more server quota. If the browser model cannot download, WASM is unavailable, or OCR finds no item rows, the selected preview remains visible and the user can retry or continue with **Masukkan manual**. Structurally suspicious results remain visibly low-confidence and editable. The sample-data and complete manual journeys remain usable without either OCR engine.
