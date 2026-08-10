# Cloudflare + private Cloud Run deployment

## Current production state

Cloudflare D1, both quota migrations, Turnstile, and the quota/Turnstile secrets are provisioned. `RECEIPT_AI_PROVIDER` deliberately remains `disabled`, so the deployed site continues to use browser OCR/manual input safely. The authenticated Google account currently has no billing-enabled project or billing account; Google requires billing to be attached before Cloud Run can use even its monthly free allocation. Complete section 1, then add the three remaining Worker values and activate `cloudrun`.

## Local setup

1. Install Node.js 22+, pnpm 11+, Python 3.11+, and Docker Desktop.
2. Run `pnpm install`.
3. Run `pnpm dev`. The manual flow and browser OCR work without credentials.
4. Run `pnpm test:ocr-service` for the dependency-free Python response-mapping tests.
5. Build the real OCR container with `docker build -t bagiyuk-receipt-ocr:dev services/receipt-ocr`.

The server path fails closed until Cloud Run, Turnstile, D1, and every server secret are present. It never falls back to mock data in production.

## Cost guardrails

- Cloud Run: request-based billing, 1 vCPU, 2 GiB RAM, concurrency 1, minimum instances 0, maximum instances 1, timeout 90 seconds, no GPU. A 75-second container watchdog terminates a stuck inference instead of relying on Cloud Run's connection timeout as a process kill.
- D1: 3 dispatches/day and 20/month per anonymous device; 10/day and 50/month per network; 800/month globally; plus 10-second and one-minute burst ceilings.
- Every accepted server attempt is reserved conservatively before private authentication/inference and is never refunded. Rejected files and failed Turnstile challenges do not consume OCR quota.
- Original uploads may be up to 8 MiB for local OCR. The server copy is metadata-free JPEG, at most 4 MiB, 2,500 px on its longest edge, and 20 megapixels after decode.
- Opaque D1 reservation rows older than 70 days are removed during later scans; no receipt content is retained.
- Cloud Run budget alerts should be set at 50%, 80%, and 100%. Alerts do not stop spending; the D1 global cap and `max-instances=1` are the active safeguards.

At the deliberately conservative request ceiling of one full 90-second, 1-vCPU/2-GiB request per reservation, 800 attempts correspond to 72,000 vCPU-seconds and 144,000 GiB-seconds. The platform timeout is not a hard process kill and free usage is shared across the billing account, so monitor real usage and do not raise the D1 cap without measurements. Artifact Registry also has a separate 0.5-GiB-month free allowance; keep one production image, enable cleanup policies, and check its compressed registry size. Pricing can change.

## 1. Deploy the private OCR container

Create or select a Google Cloud project with billing enabled, then install/authenticate `gcloud`:

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
gcloud iam service-accounts create bagiyuk-ocr-runtime
gcloud run deploy bagiyuk-receipt-ocr \
  --source services/receipt-ocr \
  --region asia-southeast1 \
  --execution-environment gen2 \
  --cpu 1 \
  --memory 2Gi \
  --concurrency 1 \
  --min 0 \
  --max 1 \
  --timeout 90 \
  --no-cpu-boost \
  --service-account bagiyuk-ocr-runtime@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --no-allow-unauthenticated
```

Record the HTTPS service URL. Do not make the service public.

The runtime identity intentionally receives no project role. Create a separate identity that can only invoke this service:

```bash
gcloud iam service-accounts create bagiyuk-worker-invoker
gcloud run services add-iam-policy-binding bagiyuk-receipt-ocr \
  --region asia-southeast1 \
  --member serviceAccount:bagiyuk-worker-invoker@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --role roles/run.invoker
gcloud iam service-accounts keys create bagiyuk-invoker-key.json \
  --iam-account bagiyuk-worker-invoker@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

The Worker exchanges this key for a short-lived Google-signed identity token. Store the private key only as a Wrangler secret, delete the downloaded JSON after setup, and rotate the key periodically. If the Google organization forbids service-account keys, use Workload Identity Federation instead.

## 2. Create Turnstile

In Cloudflare Dashboard, create a managed Turnstile widget for `bagiyuk.vivoy51577.workers.dev` (and the final custom domain if added). Record its public site key and secret key.

The Worker validates every token using Siteverify and requires:

- a successful, single-use token;
- action `receipt_scan`;
- the exact configured hostname; and
- the connecting network address supplied by Cloudflare.

## 3. Create the persistent D1 quota database

```bash
wrangler d1 create bagiyuk-ocr-quota
```

Add the returned database ID to `wrangler.jsonc` as binding `OCR_QUOTA` in both the root environment and `env.production`; named environments do not inherit D1 bindings. Then apply the quota schema and indexes:

```bash
wrangler d1 migrations apply bagiyuk-ocr-quota --remote
```

The database stores random reservation IDs, HMAC hashes, UTC day/month keys, and timestamps only. It never stores raw IPs, image data, receipt text, names, or money.

## 4. Configure Worker variables and secrets

Set non-secret runtime variables in the production Wrangler environment:

- `RECEIPT_AI_PROVIDER=cloudrun`
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_EXPECTED_HOSTNAME=bagiyuk.vivoy51577.workers.dev`
- `CLOUD_RUN_OCR_URL`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`

Generate a random quota HMAC secret of at least 32 bytes. Add these only with Wrangler secret storage, using `--env production`:

```bash
wrangler secret put OCR_QUOTA_SECRET --env production
wrangler secret put TURNSTILE_SECRET_KEY --env production
wrangler secret put GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY --env production
```

Never place those values in `.env.example`, browser variables, Git, build logs, or Cloud Run environment variables.

## 5. Verify and deploy the Worker

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:ocr-service
pnpm build
pnpm preview
pnpm test:e2e
pnpm deploy
```

Verify on production:

1. `/api/receipts/parse` GET reports `enabled: true` without exposing secrets.
2. Direct unauthenticated access to Cloud Run returns 401/403.
3. A valid image reaches verification and remains editable.
4. A fourth same-day server scan switches to local OCR with a quota message.
5. An invalid Turnstile token, >4 MiB server body, mismatched MIME signature, and >20-megapixel image are rejected before dispatch.
6. D1 contains only opaque quota rows and Cloud Run logs contain no receipt content.
7. The complete manual flow still works offline.

## Rollback

Set `RECEIPT_AI_PROVIDER=disabled` and redeploy the Worker. The configuration endpoint immediately hides Turnstile and the UI uses local OCR/manual input. Cloud Run can then be disabled without breaking the five-step flow.

Product analytics remains optional. Its allow-listed event endpoint contains no receipt image, text, participant name, or monetary value.
