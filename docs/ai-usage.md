# Receipt AI usage

## Boundary

AI only turns a user-selected receipt image into editable structured input. It never assigns items, allocates fees, or determines a person's final total. The deterministic calculator in `src/domain/billing` remains the only source of split totals.

## Providers

- `mock` is the default provider for local development, automated tests, and deployments without AI credentials. It returns deterministic sample receipt data.
- `cloudflare` uses the server-side Workers AI binding named `AI`.

Provider selection is server-only through `RECEIPT_AI_PROVIDER`. No token, account identifier, or API key is sent to the browser.

## Model choice

The production adapter defaults to `@cf/moondream/moondream3.1-9B-A2B`. Cloudflare's [model page](https://developers.cloudflare.com/ai/models/%40cf/moondream/moondream3.1-9B-A2B/) described it on 6 August 2026 as an active image-to-text model intended for OCR and structured output. It is newer and more task-specific than legacy Llama vision examples. Override it with `RECEIPT_AI_MODEL` only after checking the current official [Workers AI catalog](https://developers.cloudflare.com/workers-ai/models/).

## Input and privacy

- The browser re-encodes the selected photo as JPEG, caps its longest edge at 2,400 px, and strips embedded metadata through canvas before inference when browser APIs allow it. The original local preview is unchanged.
- The parse route accepts JPEG, PNG, or WebP up to 8 MB and independently validates the actual image dimensions.
- Parsing happens only after an explicit user action.
- The image is held in request memory for inference and is not written to disk, object storage, logs, local storage, or a database.
- The browser preview is an in-memory object URL and is revoked when replaced or removed.
- The service worker never caches parse requests or receipt images.

## Structured output

The prompt asks for Indonesian receipt fields, integer rupiah, `null` for unreadable values, per-field confidence, and JSON only. The server extracts the JSON payload, validates it with Zod, normalizes missing optional values, and returns a safe error on invalid model output. Values below the confidence threshold are marked **Periksa** in the editor.

## Fallbacks

If AI is absent, slow, rate-limited, or invalid, the selected preview remains visible and the user can retry or continue with **Masukkan manual**. The entire verification, assignment, calculation, and sharing journey is network-independent.
