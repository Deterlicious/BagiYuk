# Cloudflare Workers deployment

## Local setup

1. Install Node.js 22+ and pnpm 11+.
2. Run `pnpm install`.
3. Copy `.env.example` to `.env.local` only when changing the default mock provider.
4. Run `pnpm dev` for the Next.js development server.

## Production-runtime preview

Run `pnpm preview`. The script builds through OpenNext and starts Wrangler's local `workerd` runtime. Keep `RECEIPT_AI_PROVIDER=mock` for a credential-free preview.

## Enable Workers AI

1. Authenticate the Wrangler CLI with `pnpm wrangler login`.
2. The `production` Wrangler environment supplies the `AI` binding and selects the Cloudflare provider. The default local environment deliberately has no remote binding, so `pnpm preview` remains credential-free.
3. Production uses Gemma 4 vision for document OCR and Moondream as fallback. Optionally override `RECEIPT_AI_MODEL` or `RECEIPT_AI_FALLBACK_MODEL` after checking the current model catalog.
4. Do not add API keys to `NEXT_PUBLIC_*` variables. Workers AI is accessed through the server-side binding.

## Deploy

1. Run all quality gates: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
2. Verify `pnpm preview` and the five-step mobile flow.
3. Run `pnpm deploy`. The script deploys with `--env production`, which enables Workers AI.
4. Confirm the generated `workers.dev` or custom-domain URL and test one mock/manual split before enabling the Cloudflare provider.

No database, bucket, or durable storage is required for the MVP.
