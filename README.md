# BagiYuk

BagiYuk is a mobile-first Indonesian web app for splitting restaurant receipts by item. It supports shared items, proportional tax and service charges, discounts, signed rounding, exact integer-rupiah reconciliation, and shareable per-person results.

The core workflow is fully usable without AI: **Struk → Periksa → Anggota → Bagikan → Hasil**. Receipt OCR is an optional, editable accelerator with a deterministic mock provider enabled by default.

## Features

- Camera/gallery receipt input with in-memory preview and manual fallback.
- Server-only receipt parsing provider boundary for mock or Cloudflare Workers AI.
- Zod-validated structured OCR output and visible low-confidence review states.
- Editable item names, quantity, unit price, line total, subtotal, tax, service, discount, rounding, and receipt total.
- Fast participant entry, deterministic avatars, and accessible multi-owner item assignment.
- Integer-only largest-remainder allocation for shared items and proportional charges.
- Explicit subtotal and final-total reconciliation; mismatches are never hidden.
- WhatsApp-readable Web Share output with clipboard fallback.
- Local JSON draft autosave without persisting receipt images.
- Installable PWA manifest and offline shell for the manual workflow.
- Responsive Warm Ledger UI with sticky mobile actions and reduced-motion support.

## Quick start

Requirements: Node.js 22+ and pnpm 11+.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`. Choose **Coba data contoh** for the fastest full journey. No credentials are required while `RECEIPT_AI_PROVIDER=mock`.

## Commands

```bash
pnpm dev          # Next.js development server
pnpm typecheck    # strict TypeScript
pnpm lint         # ESLint and Next.js rules
pnpm test         # deterministic domain/provider unit tests
pnpm test:e2e     # Playwright mobile and desktop journeys
pnpm screenshots  # refresh visual QA captures while dev server is running
pnpm build        # Next.js production build
pnpm preview      # OpenNext build + local Cloudflare workerd
pnpm deploy       # OpenNext build + Cloudflare Workers deploy
pnpm cf-typegen   # regenerate Cloudflare binding types
```

## Architecture

- `src/domain/billing` is the sole calculation authority. Money is a safe integer and all remainders have stable participant-order tie breaking.
- `src/features/splitter` owns the local reducer-compatible draft shape and persistence schema.
- `src/features/receipt-parser` isolates AI providers. The route validates the actual file header dimensions, size, MIME type, extension, timeout, and model output.
- The Next.js App Router handles the homepage, wizard, manifest, and server parse route. OpenNext packages it for Cloudflare Workers.
- Base UI powers the accessible reset alert dialog; shadcn's `base-nova` configuration and local UI components keep the design system small.

See [implementation plan](docs/implementation-plan.md), [AI boundary](docs/ai-usage.md), [deployment](docs/deployment.md), and [pinned versions](docs/stack-versions.md).

## Screenshots

The main Playwright journey covers a 390×844 mobile viewport and desktop Chromium.

![BagiYuk homepage on mobile](docs/screenshots/home-mobile.png)

![Receipt verification on mobile](docs/screenshots/verify-mobile.png)

![BagiYuk homepage on desktop](docs/screenshots/home-desktop.png)

## Privacy and limitations

- Receipt images are sent only after pressing **Baca struk**, held in request memory, and never stored by this MVP.
- Draft JSON stays in the current browser's local storage; it does not sync across devices.
- The default mock provider returns deterministic demo data for any valid receipt image. Configure the Cloudflare provider for real OCR.
- OCR accuracy depends on image quality and must always be reviewed by the user.
- The lightweight in-isolate parse rate limit is best effort; a distributed production limit would require additional Cloudflare infrastructure.
- The app intentionally has no login, payment transfer, POS integration, or permanent history.
