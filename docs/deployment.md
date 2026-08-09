# Cloudflare Workers deployment

## Local setup

1. Install Node.js 22+ and pnpm 11+.
2. Run `pnpm install`.
3. No OCR credentials are required. Copy `.env.example` to `.env.local` only when testing the optional legacy server provider.
4. Run `pnpm dev` for the Next.js development server.

## Production-runtime preview

Run `pnpm preview`. The script builds through OpenNext and starts Wrangler's local `workerd` runtime. Receipt OCR runs in the browser with PaddleOCR.js, so preview remains credential-free.

## Receipt OCR

1. Production uses the stable `@paddleocr/paddleocr-js` runtime with the pretrained PP-OCRv6 Indonesian/Latin model.
2. The first scan downloads about 31 MB of detection and recognition model files; the browser caches those files for later scans.
3. OCR inference runs locally in a Web Worker/WASM. Receipt images are not uploaded to BagiYuk or Cloudflare.
4. Keep the existing mock/server provider interface for tests and future optional integrations. The production Worker deliberately has no Workers AI binding.

## Deploy

1. Run all quality gates: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
2. Verify `pnpm preview` and the five-step mobile flow.
3. Run `pnpm deploy`. The script builds the credential-free production Worker and removes the unused ONNX JSEP/WebGPU artifact that would otherwise exceed Cloudflare's per-asset limit; OCR itself uses the WASM backend.
4. Confirm the generated `workers.dev` or custom-domain URL, then test local OCR and the manual split flow on a phone.

Product analytics is optional and must never block deployment. The event endpoint stores nothing when no binding exists. To enable aggregate product events later, first enable Analytics Engine in the Cloudflare dashboard, then add an `analytics_engine_datasets` binding named `ANALYTICS` with dataset `bagiyuk_product_events` to both the default and production Wrangler environments. It stores only allow-listed event names; no receipt image, item text, participant name, or money value is sent. Querying it requires a separate Cloudflare API token with Account Analytics Read permission, which must never be exposed to the browser.

No database, bucket, or durable storage is required for the MVP.
