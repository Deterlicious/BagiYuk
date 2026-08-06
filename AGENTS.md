# BagiYuk project instructions

- Product copy is Indonesian; code and technical documentation use English.
- Keep the five-step flow intact: Struk, Periksa, Anggota, Bagikan, Hasil.
- Store rupiah as safe integers. Only `src/domain/billing` may determine split totals.
- AI output is untrusted editable input and never calculates the final split.
- Keep the manual flow fully usable without network access or AI credentials.
- Do not persist receipt images. Draft persistence may contain normalized JSON only.
- Preserve the Warm Ledger design tokens and mobile-first, accessible interaction model.
- Do not add authentication, payments, collaboration, or unrelated finance features.
- Use `pnpm`; do not introduce prerelease dependencies.
- Before handoff run: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm preview`, and `pnpm test:e2e` when browser binaries are available.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
