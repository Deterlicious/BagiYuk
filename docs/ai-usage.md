# Receipt AI usage

## Boundary

AI only turns a user-selected receipt image into editable structured input. It never assigns items, allocates fees, or determines a person's final total. The deterministic calculator in `src/domain/billing` remains the only source of split totals.

## Providers

- `mock` is the default provider for local development, automated tests, and deployments without AI credentials. It returns deterministic sample receipt data.
- `cloudflare` uses the server-side Workers AI binding named `AI`.

Provider selection is server-only through `RECEIPT_AI_PROVIDER`. No token, account identifier, or API key is sent to the browser.

## Model choice

The production adapter uses two active open models behind the same Workers AI binding:

- Primary: `@cf/google/gemma-4-26b-a4b-it`. Cloudflare documents Gemma 4 as supporting document/PDF parsing, multilingual OCR, variable image aspect ratios, and vision understanding.
- Fallback: `@cf/moondream/moondream3.1-9B-A2B`, a smaller image-to-text model intended for OCR and structured output.

The primary and fallback can be overridden server-side with `RECEIPT_AI_MODEL` and `RECEIPT_AI_FALLBACK_MODEL`. Check the current official [Workers AI catalog](https://developers.cloudflare.com/workers-ai/models/) before changing either model.

PaddleOCR was evaluated because it is a strong Apache-licensed OCR project on GitHub, but its Python/native inference runtime does not run inside this OpenNext Worker. Adding it would require a separate container/server and a materially different deployment architecture. The current hybrid keeps the MVP serverless and uses no browser secret.

## Input and privacy

- The browser detects likely receipt-paper bounds, crops excess background, upscales narrow receipts, applies grayscale/contrast enhancement, caps the longest edge at 3,200 px, and strips embedded metadata through canvas when browser APIs allow it. The original local preview is unchanged.
- The parse route accepts JPEG, PNG, or WebP up to 8 MB and independently validates the actual image dimensions.
- Parsing happens only after an explicit user action.
- The image is held in request memory for inference and is not written to disk, object storage, logs, local storage, or a database.
- The browser preview is an in-memory object URL and is revoked when replaced or removed.
- The service worker never caches parse requests or receipt images.

## Structured output

The prompt asks for Indonesian receipt fields, integer rupiah, `null` for unreadable values, and JSON only. The primary request also supplies a JSON Schema. The server accepts the documented Workers AI response shapes, validates/coerces safe integer fields with Zod, and derives field confidence from presence plus line/subtotal/total arithmetic consistency. Values below the confidence threshold are marked **Periksa** in the editor. AI values remain editable and are never split totals.

## Fallbacks

If AI is absent, slow, rate-limited, or invalid, the selected preview remains visible and the user can retry or continue with **Masukkan manual**. The entire verification, assignment, calculation, and sharing journey is network-independent.
