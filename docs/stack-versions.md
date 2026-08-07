# Stack versions

Verified against the npm registry on 7 August 2026. All selected releases are stable; no beta, canary, or release-candidate packages are used.

| Package | Version | Rationale |
| --- | ---: | --- |
| Next.js | 16.3.0 | Current stable App Router line. |
| React / React DOM | 19.2.8 | Current stable and supported by Next.js 16.3. |
| TypeScript | 6.0.3 | Newest stable accepted by typescript-eslint 8.66 (`<6.1`); strict mode enabled. |
| Tailwind CSS / PostCSS plugin | 4.3.3 | Current stable styling toolchain. |
| shadcn schema | base-nova | Base UI-backed shadcn configuration. |
| Base UI | 1.7.0 | Current stable accessible primitive library. |
| Lucide React | 1.29.0 | Current stable icon set. |
| Motion | 13.0.0 | Current stable; limited to wizard state transitions. |
| Plus Jakarta Sans (Fontsource variable) | 5.3.0 | Stable self-hosted font source, bundled through `next/font/local`. |
| PaddleOCR.js | 0.4.2 | Stable Apache-2.0 browser runtime for local PP-OCRv6 inference. |
| ONNX Runtime Web (transitive) | 1.27.0 | WASM inference runtime resolved by PaddleOCR.js; its matching binary version is pinned at runtime. |
| Zod | 4.4.3 | Current stable validation boundary. |
| OpenNext Cloudflare | 1.20.2 | Supports Next.js `>=16.2.11`; paired with 16.3.0. |
| Wrangler | 4.119.0 | Current stable Cloudflare CLI. |
| Vitest | 4.1.10 | Current stable test runner. |
| Playwright | 1.62.1 | Current stable browser test runner. |
| ESLint / Next config | 9.39.5 / 16.3.0 | Newest stable major accepted by the React/a11y/import plugins bundled with the Next config. |

Runtime used during development: Node.js 22.21.0 and pnpm 11.16.0.

The repository uses pnpm's `node-linker=hoisted` layout because OpenNext's Windows bundler cannot reliably traverse the relative symlinks copied from pnpm's default isolated layout. Package resolution remains locked by `pnpm-lock.yaml`; Linux CI and Cloudflare deployment use the same versions.
