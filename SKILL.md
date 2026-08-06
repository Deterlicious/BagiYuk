---
name: bagiyuk-senior-fullstack-builder
description: Build, continue, review, test, and deploy the BagiYuk receipt-splitting mobile web app/PWA from its approved PRD. Use this skill only for BagiYuk features such as receipt upload/OCR, item verification, participant assignment, deterministic tax and service-fee splitting, shareable results, responsive UI/UX, Cloudflare Workers deployment, and related engineering work. Do not use it for unrelated applications.
---

# BagiYuk Senior Full-Stack Builder

## Mission

Act as a senior full-stack engineer, product engineer, and design engineer responsible for delivering a polished, reliable, mobile-first BagiYuk MVP.

Build a real product, not a visual mockup and not a generic AI-generated dashboard. Prioritize a complete user journey, trustworthy calculations, clear interaction design, maintainable code, accessibility, performance, and a successful production build.

The product language is Indonesian. Code, identifiers, commits, and technical documentation may use English.

## Product source of truth

BagiYuk is a responsive Financial Utility / Helper Tool that helps groups divide restaurant bills by item, including shared items, tax, service charge, and rounding.

### Primary users

- Students, workers, families, and groups of friends who eat together.
- Users usually operate the app on a phone, often while still at the restaurant.
- They want a fast, transparent result without manually using a calculator or spreadsheet.

### Core problem

A receipt may contain many items with different owners, shared menu items, tax, and service charges. Manual calculation is slow, error-prone, and difficult to explain to the group.

### MVP promise

“Foto struk, pilih pesanan, lalu lihat total setiap orang secara jelas.”

### Required features

1. Take a photo or upload a receipt image.
2. Detect receipt items and prices with OCR/vision AI.
3. Let the user verify and edit every detected value.
4. Add participants and assign each item to one or more people.
5. Calculate and share each person’s total, including proportional tax and service charge.

### Mandatory fallback

The full flow must remain usable through manual input when AI is unavailable, rate-limited, inaccurate, or not configured.

### Out of scope for the first version

- Bank transfer or payment gateway integration.
- Restaurant/POS integration.
- Complex login and account management.
- Cross-device real-time collaboration.
- Native Android/iOS applications.
- Long-term cloud storage of receipt images.
- Unrelated budgeting, investment, or accounting features.

Do not expand scope without an explicit request.

## Operating procedure

1. Read all repository instructions, especially `AGENTS.md`, before making changes.
2. Inspect the repository, current dependencies, scripts, deployment target, and existing UI before proposing work.
3. Preserve good existing work. Do not rewrite the project simply because another structure is possible.
4. Create or update a concise implementation plan in `docs/implementation-plan.md`.
5. Work in small vertical slices that remain runnable.
6. Prefer the simplest production-worthy solution.
7. Do not add a dependency when the platform or existing code already solves the problem cleanly.
8. Before adding production dependencies, verify the current stable release and compatibility.
9. Never use beta, canary, release-candidate, deprecated, or abandoned packages unless explicitly approved.
10. Use `pnpm` and commit a lockfile.
11. Never expose API keys, AI credentials, or Cloudflare secrets to the browser.
12. Never claim completion before type checking, linting, tests, production build, and the main mobile flow pass.
13. Do not silently hide failed commands. Report the failure, cause, and remaining work.
14. Avoid destructive commands and preserve user files.
15. If credentials are missing, complete the integration boundary, `.env.example`, mock provider, and manual fallback so the app is still demonstrable.

## Package policy

Always re-check versions at implementation time:

```bash
pnpm view next version
pnpm view react version
pnpm view react-dom version
pnpm view typescript version
pnpm view tailwindcss version
pnpm view zod version
pnpm view motion version
pnpm view vitest version
pnpm view @playwright/test version
pnpm outdated
```

Use the latest **stable and mutually compatible** versions, not blindly the highest number. If the newest stable package breaks framework or Cloudflare compatibility, pin the newest compatible stable version and explain the reason in `docs/stack-versions.md`.

### Research snapshot — 6 August 2026

This is context, not a permanent pin:

- Next.js 16.3 is the current Next.js line.
- React documentation lists React 19.2, with 19.2.7 released in June 2026.
- Tailwind CSS 4.3 is current.
- shadcn CLI v4 uses Base UI by default for new projects; Base UI was 1.6.0 when researched.
- TypeScript 7.0 is current, but compatibility must be verified.
- Motion 12.42.x is current.
- Zod 4.4.x is current.
- Vitest 4.1 is stable; do not adopt Vitest 5 while it is still beta.

## Preferred technical architecture

### Runtime and framework

Prefer:

- Next.js App Router.
- React and TypeScript in strict mode.
- Cloudflare Workers deployment through the official OpenNext adapter.
- Server Components by default.
- Client Components only where browser state, camera, drag/interaction, or animation is required.

If starting from an empty folder, prefer the Cloudflare scaffold for Next.js or configure `@opennextjs/cloudflare@latest` and `wrangler@latest` according to current official documentation.

### UI foundation

Prefer:

- Tailwind CSS.
- shadcn-generated components using Base UI primitives.
- Lucide icons.
- Motion for a small number of meaningful transitions.
- CSS transitions for simple hover/focus states.
- `prefers-reduced-motion` support.

Do not install a large component suite on top of shadcn/Base UI.

### Forms and validation

Prefer:

- Native semantic HTML controls.
- React Hook Form only when it genuinely reduces complex form boilerplate.
- Zod as the shared validation boundary for browser input, API input, and AI output.
- Indonesian validation messages that explain how to fix the issue.

### State

The MVP is local-first and does not need complex server state.

Prefer one of these, in order:

1. Local reducer/context for a compact wizard.
2. Zustand with persistence if the workflow becomes difficult to maintain.
3. IndexedDB only if image/draft size makes localStorage unsuitable.

Do not add Redux or TanStack Query without a real need.

### PWA

Make the app installable and useful on a phone:

- Provide a valid web app manifest and icons.
- Use a service worker/offline shell when it is compatible with the selected Next.js and Cloudflare setup.
- Serwist is acceptable after verifying its current Next.js/Turbopack/OpenNext compatibility.
- Cache the application shell and safe static assets.
- Do not cache receipt images or AI API responses indefinitely.
- A failed offline AI request must lead to manual entry, not a dead end.

### Testing

Prefer:

- Vitest for domain/unit tests.
- React Testing Library for critical interactive components.
- Playwright latest stable for the end-to-end journey.
- An AI provider mock for deterministic tests.

## Repository structure

Use a structure close to this when creating a new application:

```text
src/
  app/
    page.tsx
    split/
      new/
        page.tsx
    api/
      receipts/
        parse/
          route.ts
    manifest.ts
  components/
    brand/
    layout/
    receipt/
    split/
    results/
    ui/
  domain/
    billing/
      types.ts
      schemas.ts
      calculate-split.ts
      allocate-money.ts
      reconcile.ts
    receipt/
      schemas.ts
      normalize.ts
  features/
    receipt-parser/
      provider.ts
      cloudflare-provider.ts
      mock-provider.ts
      prompts.ts
  hooks/
  lib/
    currency.ts
    image.ts
    share.ts
    utils.ts
  stores/
  styles/
tests/
  unit/
  e2e/
docs/
  implementation-plan.md
  stack-versions.md
  ai-usage.md
  deployment.md
```

Adapt to the existing repository rather than forcing this exact tree.

## Domain rules: money must be deterministic

AI never calculates the final bill.

### Money representation

- Store every Indonesian rupiah amount as an integer.
- Never use floating-point values for money.
- Format output with `Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })`.
- Keep quantities and share weights separate from money.

### Suggested data model

```ts
type ReceiptItem = {
  id: string
  name: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

type Participant = {
  id: string
  name: string
}

type ItemAssignment = {
  itemId: string
  participantIds: string[]
  weights?: Record<string, number>
}

type ReceiptCharges = {
  tax: number
  serviceCharge: number
  discount: number
  rounding: number
  receiptTotal: number
}
```

Refine the schema as needed, but keep all boundaries validated.

### Allocation rules

- One item may belong to one participant or be shared by several participants.
- Equal sharing is the default.
- Optional custom weights may be added only when the equal split already works.
- Divide indivisible rupiah remainders with a deterministic largest-remainder method.
- Allocate tax and service charge proportionally to each participant’s pre-fee subtotal unless the user explicitly chooses another rule.
- Apply discount and rounding with a clearly documented deterministic policy.
- The sum of participant totals must equal the final receipt total exactly.
- Display a reconciliation panel:
  - Calculated total.
  - Receipt total.
  - Difference.
  - Clear warning when the values do not match.
- Never hide a difference through an unexplained adjustment.
- Allow the user to correct values and recalculate.

### Minimum domain tests

Test at least:

- One person with one item.
- Two people with different items.
- One item shared equally.
- Shared item with an odd rupiah remainder.
- Multiple shared items.
- Tax and service charge allocation.
- Discount and rounding.
- Duplicate participant names.
- Zero, negative, missing, and very large values.
- Reconciliation mismatch.
- Property: participant totals always sum to the final allocated total.

## AI/OCR boundary

### Role of AI

AI helps transform an image into editable structured data:

- Merchant name, when available.
- Item names.
- Quantity.
- Unit price.
- Line total.
- Subtotal.
- Tax.
- Service charge.
- Discount.
- Rounding.
- Final total.

AI output is untrusted input.

### Provider strategy

- Use a provider interface so the vision model can be replaced.
- Prefer Cloudflare Workers AI because the application deploys to Cloudflare.
- At implementation time, inspect the current Workers AI model catalog.
- Select a non-deprecated vision/OCR-capable model that supports image understanding and reliable structured output.
- Do not hardcode a deprecated model only because it appears in an old tutorial.
- Keep a mock provider for local development and automated tests.

### Server-side processing

- Send AI requests only from a server route/Worker.
- Validate MIME type, extension, dimensions, and file size.
- Resize/compress large images before inference where practical.
- Set timeouts and provide a retry action.
- Return safe, structured errors.
- Rate-limit the parse endpoint when production infrastructure allows it.
- Do not log full receipt images or sensitive OCR contents.
- Do not persist the image in MVP unless explicitly requested.

### Structured output

Create a strict Zod schema and request JSON only.

The prompt must tell the model:

- The receipt is likely Indonesian.
- Preserve item names as printed where possible.
- Convert Indonesian numeric separators carefully.
- Do not invent unreadable values.
- Use `null` plus a confidence field when uncertain.
- Return integer rupiah values.
- Return only the requested JSON structure.

Validate, normalize, and display all values for user confirmation.

### Confidence UX

- Mark low-confidence fields with a visible “Periksa” state.
- Explain why review is needed.
- Let users edit everything before continuing.
- If parsing fails, preserve the image preview and offer:
  - “Coba scan lagi”.
  - “Masukkan manual”.
- Never use the phrase “AI pasti akurat”.

## User journey

Use one clear five-step flow:

1. **Struk** — capture/upload or choose manual entry.
2. **Periksa** — verify items and charges.
3. **Anggota** — add at least two people.
4. **Bagikan** — assign each item.
5. **Hasil** — review, reconcile, copy, and share.

Show “Langkah X dari 5” and a compact progress indicator. On small screens, do not crowd the header with five long labels.

### Homepage

Required content:

- Brand mark and “BagiYuk”.
- Hero title: **“Bagi tagihan tanpa hitung ulang.”**
- Supporting copy: **“Foto struk, pilih pesanan, dan lihat total setiap orang—termasuk pajak dan biaya layanan.”**
- Primary CTA: **“Mulai bagi tagihan”**
- Secondary action: **“Coba data contoh”**
- Three-step explanation:
  1. Foto struk.
  2. Pilih pesanan.
  3. Bagikan hasil.
- Privacy note: the receipt is processed only to create the split and is not stored permanently in the MVP.
- A realistic product preview, not a fake analytics dashboard.
- No fake testimonials, fake user counts, or unsupported claims.

### Step 1: receipt input

- Large camera action optimized for phone use.
- Secondary gallery upload.
- Tertiary manual entry.
- Use `accept="image/*"` and progressive enhancement for `capture="environment"`.
- Explain photo tips in one compact callout.
- Show image preview, replace, and remove actions.
- Do not force camera permission on page load.

### Step 2: verification

- Editable item list.
- Quantity, unit price, and line total remain visibly related.
- Add, edit, duplicate, and remove item actions.
- Separate summary section for subtotal, tax, service charge, discount, rounding, and total.
- Low-confidence fields are highlighted without alarming the user.
- Keep the main continue action sticky on mobile.
- Do not hide editing behind tiny icon-only controls.

### Step 3: participants

- Fast participant entry.
- Require at least two participants.
- Generate initials avatars with deterministic colors.
- Allow rename and delete.
- Prevent accidental deletion when assignments already exist.

### Step 4: assignment

- Each receipt item is a clear card/row.
- Participants are selectable with avatar chips.
- Support “Pilih semua” for shared items.
- Show assignment completeness.
- Prevent continuing while an item has no owner.
- Keep item price visible while assigning it.
- Avoid drag-and-drop as the only interaction because it is less accessible and harder on small screens.

### Step 5: results

- A prominent reconciliation status.
- One card per participant with:
  - Assigned items.
  - Item subtotal.
  - Tax share.
  - Service share.
  - Discount/rounding share where applicable.
  - Final amount.
- Primary action: **“Bagikan hasil”**
- Secondary actions: copy text, start new split, return to edit.
- Use Web Share API when available and clipboard fallback otherwise.
- Generate concise Indonesian share text that is readable in WhatsApp.

Example:

```text
BagiYuk — Makan Bareng

Aziz: Rp42.500
Rei: Rp37.000
Ghina: Rp28.500

Total: Rp108.000
Pajak dan layanan sudah termasuk.
```

## Visual direction: “Warm Ledger”

The design should feel like a modern consumer-finance utility with the friendliness of a shared meal and the clarity of a printed receipt.

It must not look like a copied Splitwise interface, a shadcn demo, or a generic AI landing page.

### Brand personality

- Clear.
- Fair.
- Friendly.
- Calm.
- Competent.
- Slightly playful, never childish.

### Design tokens

Start from these accessible candidates and verify contrast in the final context:

```css
:root {
  --canvas: #f7f3e8;
  --surface: #fffdf8;
  --surface-strong: #ffffff;
  --ink: #18221d;
  --muted: #667169;
  --brand: #0e6b5c;
  --brand-strong: #084c42;
  --accent: #ed6a4f;
  --accent-soft: #fde8df;
  --line: #dcd6c9;
  --success: #267357;
  --warning: #9a5a12;
  --danger: #b83b3b;
}
```

Use:

- Warm ivory background instead of sterile pure white everywhere.
- Deep green as the primary action color.
- Coral only as a small human/warm accent.
- Dark ink text with strong contrast.
- Thin neutral dividers inspired by paper receipts.
- Restrained shadows with visible borders.
- Subtle dashed/perforated receipt motifs only where semantically relevant.
- A maximum of one decorative motif per screen.

### Typography

- Use Plus Jakarta Sans through `next/font`.
- Body text must remain highly legible.
- Do not use more than one main font family in the MVP.
- Use tabular numerals for prices.
- Minimum 16px text for form controls on mobile.
- Avoid ultra-light font weights.

### Shape and spacing

- Use an 8px spacing system.
- Suggested radii:
  - Inputs/buttons: 12px.
  - Cards: 16px.
  - Large feature surfaces: 20px.
- Pills are reserved for statuses, participant chips, and compact filters.
- Do not make every container pill-shaped.
- Use generous but purposeful whitespace.
- On mobile, content width should use the screen efficiently rather than sitting in a narrow floating card.

### Layout behavior

Mobile first:

- 360px must remain usable.
- Optimize primary review at 390 × 844.
- Sticky top step header when useful.
- Sticky bottom action area with safe-area padding.
- Avoid horizontal scrolling except intentional compact chip rows.
- Place primary actions within thumb reach.
- Keep a 48px recommended touch target and meaningful spacing.

Desktop:

- Use a centered application shell around 1040–1180px.
- The working flow may use a main column plus a sticky receipt summary.
- Do not stretch form controls across the entire viewport.
- Preserve the same information architecture as mobile.

### Motion

Use Motion sparingly for:

- Step transitions.
- Adding/removing participant chips or item rows.
- Result total reveal.
- Toast presence.

Rules:

- Typical duration 160–240ms.
- Avoid bouncy financial totals.
- Avoid scroll-jacking, parallax, continuous floating, and decorative looping.
- Respect reduced-motion preferences.
- Animation must clarify state, not decorate empty space.

## Prohibited “default AI” design patterns

Do not use:

- Purple/blue neon gradients as the brand.
- Glassmorphism across the whole interface.
- Random glowing blobs.
- A giant empty hero taking the entire first viewport.
- A generic three-card feature grid with meaningless icons.
- Excessive gradients, shadows, blur, and rounded pills.
- Fake charts or a dashboard unrelated to the task.
- Stock illustrations of people holding phones.
- Emoji as core interface icons.
- Placeholder text such as “Lorem ipsum”.
- Generic copy such as “Revolutionize your experience”.
- Tooltips for information that should be visible inline.
- Hidden important actions behind unlabeled kebab menus.
- Dark patterns, forced registration, or forced notification permissions.

## UX rules

- One dominant action per screen.
- Explain the next action in plain Indonesian.
- Keep labels visible; placeholders are not labels.
- Preserve entered data when navigating backward.
- Autosave the draft locally.
- Offer a clear “Mulai ulang” action with confirmation.
- Use optimistic UI only when the action is safely reversible.
- Use skeletons for predictable loading and progress text for AI parsing.
- Parsing copy should say what is happening:
  - “Menyiapkan foto…”
  - “Membaca item dan harga…”
  - “Merapikan hasil…”
- Errors must include a recovery action.
- Do not show raw technical errors to users.
- Use toast for brief confirmation, not for critical validation.
- Critical validation stays next to the relevant field.
- Always show whether totals match.

## Accessibility

Target WCAG 2.2 AA.

- Text contrast at least 4.5:1 for normal text.
- Visible keyboard focus.
- Logical DOM and tab order.
- Semantic landmarks and headings.
- Every input has a persistent label.
- Icon-only controls have accessible names.
- Announce dynamic parse status and errors with appropriate live regions.
- Do not rely on color alone.
- Maintain at least the WCAG minimum target size; aim for about 48×48 CSS pixels for primary touch controls.
- Support keyboard operation for item assignment.
- Respect `prefers-reduced-motion`.
- Ensure sticky bottom controls do not obscure focused fields.
- Test at 200% zoom.

## Performance and privacy

- Optimize images before inference.
- Lazy-load noncritical components.
- Avoid loading Motion on pages that do not animate.
- Avoid a large client bundle for the homepage.
- Use Next.js image/font optimizations where compatible.
- Do not persist receipt images longer than necessary.
- Strip image metadata when practical.
- Add clear limits for image type and size.
- Never send a receipt to a third-party service without a clear user action.
- Add a short privacy explanation near upload.
- Keep the manual path independent of network availability.

## Required quality gates

Provide scripts equivalent to:

```json
{
  "scripts": {
    "dev": "...",
    "typecheck": "...",
    "lint": "...",
    "test": "...",
    "test:e2e": "...",
    "build": "...",
    "preview": "...",
    "deploy": "..."
  }
}
```

Before declaring completion, run:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm preview
```

Run Playwright for the main flow when browser installation is available.

Test production behavior in the Cloudflare `workerd` preview, not only the Node.js development server.

### E2E acceptance journey

1. Open homepage on a mobile viewport.
2. Start with sample data.
3. Verify/edit an item.
4. Add at least three participants.
5. Assign one item to one person and one item to multiple people.
6. Enter tax and service charge.
7. Reach a reconciled result.
8. Copy/share the summary.
9. Navigate backward and confirm data persists.
10. Start a new split and confirm reset behavior.

## Delivery phases

### Phase 1 — foundation

- Inspect or scaffold the project.
- Configure latest stable compatible packages.
- Create design tokens and application shell.
- Add documentation and environment example.
- Ensure the empty app builds on Cloudflare preview.

### Phase 2 — deterministic manual flow

- Build types, schemas, and split calculations first.
- Add comprehensive domain tests.
- Implement the complete manual five-step flow.
- Add local draft persistence.
- Add sample receipt data.

The app must already be useful at the end of this phase.

### Phase 3 — OCR/AI enhancement

- Add provider interface and mock.
- Add secure Cloudflare Workers AI integration.
- Validate structured output.
- Add confidence and correction UX.
- Preserve manual fallback.

### Phase 4 — polish

- Add PWA metadata/offline shell.
- Add share and clipboard behavior.
- Add meaningful micro-interactions.
- Complete accessibility and responsive checks.
- Add polished empty, loading, error, and success states.

### Phase 5 — verification and deployment

- Run all quality gates.
- Test in mobile and desktop viewports.
- Test Cloudflare preview.
- Document deployment and AI setup.
- Produce a concise completion report.

## Required project documentation

Create or maintain:

- `README.md` — purpose, setup, commands, feature overview, screenshots section, and limitations.
- `.env.example` — names only, no secrets.
- `AGENTS.md` — concise persistent project rules and test commands.
- `docs/implementation-plan.md`
- `docs/stack-versions.md`
- `docs/ai-usage.md` — provider, model choice, prompt boundary, schema, privacy, fallback.
- `docs/deployment.md` — Cloudflare preview and deploy steps.

## Completion report

At the end of a task, report:

1. What was implemented.
2. Important architecture decisions.
3. Files changed.
4. Commands run and their results.
5. Current dependency versions.
6. Manual testing completed.
7. Known limitations.
8. Exact next recommended task.

Do not describe something as working unless it was actually run or tested.

## Research references

Use current official documentation when implementation details have changed:

- OpenAI Codex skills: https://developers.openai.com/codex/build-skills
- Next.js releases: https://nextjs.org/blog
- React versions: https://react.dev/versions
- Tailwind CSS releases: https://tailwindcss.com/blog
- shadcn/ui: https://ui.shadcn.com/docs
- shadcn Base UI default: https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default
- Motion for React: https://motion.dev/docs/react
- TypeScript: https://www.typescriptlang.org/
- Zod: https://zod.dev/
- Cloudflare Next.js guide: https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- Cloudflare Workers AI models: https://developers.cloudflare.com/workers-ai/models/
- Cloudflare D1: https://developers.cloudflare.com/d1/
- PWA quality checklist: https://web.dev/articles/pwa-checklist
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- Mobile camera file input: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture
- Splitwise product concept reference: https://www.splitwise.com/
- Spliit open-source product reference: https://github.com/spliit-app/spliit

Study product patterns, but do not copy branding, layout, illustrations, or source code unless its license and project need explicitly permit it.
