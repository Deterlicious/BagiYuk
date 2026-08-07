# Receipt OCR usage

## Boundary

OCR only turns a user-selected receipt image into editable structured input. It never assigns items, allocates fees, or determines a person's final total. The deterministic calculator in `src/domain/billing` remains the only source of split totals.

## Production engine

BagiYuk uses the stable `@paddleocr/paddleocr-js` package with the pretrained PP-OCRv6 Indonesian/Latin model. The runtime performs text detection and recognition in the browser through a Web Worker and ONNX Runtime Web/WASM. The WASM-only bundle keeps every static asset below Cloudflare Workers' 25 MiB limit and works consistently across mobile browsers.

- No Cloudflare Workers AI binding or API key is required.
- The Paddle detection and recognition models total about 31 MB and are downloaded on the first scan, then reused from the browser cache.
- The package is loaded dynamically only after the user selects a valid receipt photo, so it does not increase the homepage's initial JavaScript path.
- The scan UI reports four real pipeline stages and elapsed time, then offers cancel/manual exits during a slow first run. A two-minute ceiling stops a stalled scan with an actionable error.
- COOP/COEP headers allow ONNX Runtime to use a conservative automatic multi-core WASM configuration on supporting browsers; unsupported browsers safely remain single-threaded.
- The WebAssembly CDN version is pinned to the installed ONNX Runtime version to avoid a JavaScript/binary mismatch.
- OCR returns text, polygons, and confidence scores. BagiYuk groups fragments into visual rows and parses Indonesian rupiah deterministically.

The existing server provider interface and deterministic mock provider remain available for tests and future optional integrations. Production deliberately selects `mock` for that unused endpoint and has no `AI` binding.

## Input and privacy

- The browser detects likely receipt-paper bounds, crops excess background, upscales narrow receipts, applies grayscale/contrast enhancement, caps the longest edge at 3,200 px, and strips embedded metadata through canvas when browser APIs allow it. The original local preview is unchanged.
- Parsing starts only after the explicit camera/gallery selection action.
- The receipt image and OCR inference remain on the user's device. They are not posted to the BagiYuk Worker, written to storage, logged, or placed in local storage.
- The browser preview is an in-memory object URL and is revoked when replaced or removed.
- The service worker never caches receipt image requests.

## Structured output

OCR fragments are untrusted input. The deterministic parser:

- groups fragments by their detected coordinates;
- recognizes quantity, item name, and trailing rupiah amount;
- extracts subtotal, tax, service, discount, rounding, and total labels;
- preserves all rupiah values as safe integers;
- validates the final editable receipt with Zod; and
- exposes low-confidence fields as **Periksa**.

When a line total divides evenly by its quantity, the unit price is derived exactly. Otherwise the verified line total remains authoritative for that editable item. Small rounding differences can be inferred from the receipt total, but every field remains editable and the billing domain independently reconciles the final allocation.

## Fallbacks

If the model cannot download, the browser lacks required WASM support, or OCR finds no item rows, the selected preview remains visible and the user can retry or continue with **Masukkan manual**. The sample-data and complete manual split journeys remain usable without OCR.
