# Cloudflare Worker and private Cloud Run deployment

## Production status

The protected server OCR path is live as of 2026-08-11. The production Cloudflare Worker validates Turnstile, reserves quota in D1, exchanges a five-minute Cloudflare-signed workload assertion through Google Security Token Service (STS), obtains a Google-signed Cloud Run ID token, and calls the private OCR service. A production receipt scan completed successfully through that entire path.

No downloadable Google service-account key is used. Google Workload Identity Federation (WIF) validates an uploaded public JWKS, so the issuer does not need an OpenID discovery endpoint. The corresponding private WIF signing key exists only as the `GOOGLE_WIF_PRIVATE_KEY` Cloudflare Worker secret. It must never be placed in Git, Wrangler variables, browser code, logs, or the Cloud Run service.

### Current production resources

| Resource | Current value |
| --- | --- |
| Cloudflare Worker | `bagiyuk.vivoy51577.workers.dev` |
| D1 database | `bagiyuk-ocr-quota` (`c08d9cac-8faf-47c3-a3e9-50f0713f712e`) |
| Google project | `project-592af0e7-ebee-4483-88e` (number `513268340263`) |
| Cloud Run service | `bagiyuk-receipt-ocr` in `asia-southeast1` |
| Cloud Run URL | `https://bagiyuk-receipt-ocr-vf76ow3g7a-as.a.run.app` |
| Runtime service account | `bagiyuk-ocr-runtime@project-592af0e7-ebee-4483-88e.iam.gserviceaccount.com` |
| Invoker service account | `bagiyuk-worker-invoker@project-592af0e7-ebee-4483-88e.iam.gserviceaccount.com` |
| Build service account | `bagiyuk-ocr-builder@project-592af0e7-ebee-4483-88e.iam.gserviceaccount.com` |
| WIF pool / provider | `bagiyuk-cloudflare` / `bagiyuk-worker` |
| WIF issuer / subject | `https://bagiyuk.vivoy51577.workers.dev/wif` / `bagiyuk-receipt-ocr-prod` |
| WIF audience | `//iam.googleapis.com/projects/513268340263/locations/global/workloadIdentityPools/bagiyuk-cloudflare/providers/bagiyuk-worker` |
| Active public key ID | `bagiyuk-msnoned9-dd58e93c` |

Cloud Run is configured for request-based billing, 1 vCPU, 2 GiB memory, concurrency 1, minimum instances 0, maximum instances 1, a 90-second platform timeout, no startup CPU boost, and no GPU. The container has a stricter 75-second inference watchdog, and the Worker has an 85-second upstream timeout. The runtime service account intentionally has no project role. The separate invoker account has `roles/run.invoker` only on this Cloud Run service.

## Local setup

1. Install Node.js 22+, pnpm 11+, Python 3.11+, the Google Cloud CLI, and Docker Desktop.
2. Run `pnpm install`.
3. Run `pnpm dev`. The manual flow and browser OCR work without cloud credentials.
4. Run `pnpm test:ocr-service` for the dependency-free Python response-mapping tests.
5. Build the OCR image with `docker build -t bagiyuk-receipt-ocr:dev services/receipt-ocr` when Docker is available.

The server path fails closed unless Cloud Run, WIF, Turnstile, D1, and all required Worker secrets are present. It never substitutes mock receipt data in production. Browser OCR and manual entry remain available when the server path is disabled or unavailable.

## Cost and abuse guardrails

- D1 permits 3 server dispatches per UTC day and 20 per UTC month for one anonymous device, 10/day and 50/month for one network, and 800 accepted attempts/month globally. It also limits a device to one reservation per 10 seconds and three per minute.
- Turnstile is required before quota reservation. Invalid files, invalid MIME signatures, oversized images, unsafe dimensions, and failed Turnstile challenges are rejected before paid inference.
- An accepted attempt is reserved atomically before WIF and inference and is never refunded. This prevents retry storms from bypassing the cap when an upstream request fails.
- The Worker sends one metadata-free JPEG of at most 4 MiB, 2,500 px on its longest edge, and 20 megapixels after decode. Original uploads up to 8 MiB remain eligible for local OCR.
- Cloud Run is private, so an attacker cannot bypass Worker Turnstile and D1 limits by calling the service URL directly.
- D1 stores opaque HMAC hashes and reservation timestamps only. Rows older than 70 days are removed opportunistically; receipt images and extracted receipt content are not persisted.

The 800-attempt application cap is deliberately conservative. At the worst-case platform ceiling of 90 seconds with 1 vCPU and 2 GiB per reservation, it represents 72,000 vCPU-seconds and 144,000 GiB-seconds. Actual usage should be lower because the container watchdog exits after 75 seconds.

The project currently has a monthly Rp25,000 Cloud Billing budget named `BagiYuk OCR monthly guardrail`, with current-spend alerts at 50%, 80%, and 100%. Budgets and alerts are notifications, not spend caps. Likewise, `max-instances=1` limits parallel capacity but does not stop one instance from serving requests continuously. The D1 global cap is the primary application-level brake, but it cannot cap unrelated builds, Artifact Registry storage, logging, another workload in the same billing account, or usage caused by a future defect. Cloud Run free usage is shared across the billing account, billing must remain enabled, and prices/free allowances can change. Keep only necessary container revisions/images, enable Artifact Registry cleanup, review Billing reports regularly, and do not increase the 800-attempt cap without measured p95 duration and cost.

Google Cloud also offers project-scoped Cloud Run spend-cap budgets in Preview for eligible accounts. Unlike an ordinary budget, this can pause Cloud Run usage at 100%, but enforcement is not instantaneous, in-flight overage remains possible, and it does not cover Cloud Build or Artifact Registry. If the option appears under **Billing → Budgets & alerts**, add a small spend-cap budget to this dedicated project while keeping the application limits and ordinary alerts.

Official references: [Cloud Run pricing](https://cloud.google.com/run/pricing), [Cloud Billing budgets](https://cloud.google.com/billing/docs/how-to/budgets), [Cloud Run spend-cap budgets](https://cloud.google.com/billing/docs/how-to/budgets-spend-caps), [Cloud Run build identity](https://cloud.google.com/run/docs/configuring/services/build-service-account), and [Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation-with-other-providers).

## Reproduce the private Cloud Run service

Set the current project and enable the required build, runtime, federation, and token APIs:

```bash
PROJECT_ID="project-592af0e7-ebee-4483-88e"
PROJECT_NUMBER="513268340263"
REGION="asia-southeast1"
SERVICE="bagiyuk-receipt-ocr"
RUNTIME_SA="bagiyuk-ocr-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
INVOKER_SA="bagiyuk-worker-invoker@${PROJECT_ID}.iam.gserviceaccount.com"
BUILDER_SA="bagiyuk-ocr-builder@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT_ID"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  cloudresourcemanager.googleapis.com
```

Create the three purpose-specific service accounts if they do not already exist. Do not create a service-account key:

```bash
gcloud iam service-accounts create bagiyuk-ocr-runtime \
  --display-name="BagiYuk OCR runtime"
gcloud iam service-accounts create bagiyuk-worker-invoker \
  --display-name="BagiYuk Worker invoker"
gcloud iam service-accounts create bagiyuk-ocr-builder \
  --display-name="BagiYuk OCR source builder"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${BUILDER_SA}" \
  --role="roles/run.builder"
```

Deploy a private revision and bind only the dedicated invoker account:

```bash
gcloud run deploy "$SERVICE" \
  --source services/receipt-ocr \
  --region "$REGION" \
  --execution-environment gen2 \
  --cpu 1 \
  --memory 2Gi \
  --concurrency 1 \
  --min 0 \
  --max 1 \
  --timeout 90 \
  --no-cpu-boost \
  --build-service-account "$BUILDER_SA" \
  --service-account "$RUNTIME_SA" \
  --no-allow-unauthenticated

gcloud run services add-iam-policy-binding "$SERVICE" \
  --region "$REGION" \
  --member="serviceAccount:${INVOKER_SA}" \
  --role="roles/run.invoker"
```

Record the service URL returned by Cloud Run. The URL is an identifier, not a secret, but the service must remain private.

## Provision WIF with an uploaded JWKS

For initial provisioning, generate a 2,048-bit RSA key pair in a trusted temporary location. The helper sends the PKCS#8 private key directly to the production Wrangler secret and writes only the public JWKS to the requested path. It refuses to overwrite an existing file.

```bash
node scripts/provision-wif-signing-key.mjs /secure/admin/path/bagiyuk-wif-jwks.json
```

Copy the emitted public `keyId` into `GOOGLE_WIF_KEY_ID` in the production Wrangler variables. Never commit or print the private key. The public JWKS contains only `kty`, `n`, `e`, `alg`, `use`, and `kid`; it must not contain RSA private members.

Create a dedicated pool and an OIDC provider that uses the uploaded JWKS. The canonical HTTPS provider URL is the assertion audience; the STS request uses the same resource with the leading `https:` removed.

```bash
POOL_ID="bagiyuk-cloudflare"
PROVIDER_ID="bagiyuk-worker"
WIF_SUBJECT="bagiyuk-receipt-ocr-prod"
WIF_ISSUER="https://bagiyuk.vivoy51577.workers.dev/wif"
WIF_RESOURCE="//iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"
WIF_OIDC_AUDIENCE="https:${WIF_RESOURCE}"

gcloud iam workload-identity-pools create "$POOL_ID" \
  --location="global" \
  --display-name="BagiYuk Cloudflare"

gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
  --location="global" \
  --workload-identity-pool="$POOL_ID" \
  --display-name="BagiYuk Worker" \
  --issuer-uri="$WIF_ISSUER" \
  --allowed-audiences="$WIF_OIDC_AUDIENCE" \
  --attribute-mapping="google.subject=assertion.sub,attribute.environment=assertion.environment,attribute.workload=assertion.workload" \
  --attribute-condition="assertion.sub == '${WIF_SUBJECT}' && assertion.environment == 'production' && assertion.workload == 'receipt-ocr'" \
  --jwk-json-path="/secure/admin/path/bagiyuk-wif-jwks.json"
```

Grant the exact federated subject only the permission required to mint an OpenID Connect token for the invoker service account:

```bash
WIF_PRINCIPAL="principal://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/subject/${WIF_SUBJECT}"

gcloud iam service-accounts add-iam-policy-binding "$INVOKER_SA" \
  --member="$WIF_PRINCIPAL" \
  --role="roles/iam.serviceAccountOpenIdTokenCreator"
```

Do not replace that exact `principal://.../subject/...` member with a pool-wide `principalSet`, and do not grant the broader `roles/iam.serviceAccountTokenCreator`. The production assertion has a five-minute lifetime and constant `subject`, `environment`, and `workload` claims. The provider condition rejects assertions outside that boundary.

## Configure Cloudflare

The production `wrangler.jsonc` contains the non-secret values:

- `RECEIPT_AI_PROVIDER=cloudrun`
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_EXPECTED_HOSTNAME=bagiyuk.vivoy51577.workers.dev`
- `CLOUD_RUN_OCR_URL`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_WIF_AUDIENCE`
- `GOOGLE_WIF_ISSUER`
- `GOOGLE_WIF_SUBJECT`
- `GOOGLE_WIF_KEY_ID`

The production environment must also contain these Wrangler secrets:

```bash
wrangler secret put OCR_QUOTA_SECRET --env production
wrangler secret put TURNSTILE_SECRET_KEY --env production
wrangler secret put GOOGLE_WIF_PRIVATE_KEY --env production
```

`OCR_QUOTA_SECRET` must contain at least 32 random bytes. The Turnstile widget must allow the production hostname, use action `receipt_scan`, and be validated against the connecting network address. Never prefix a secret with `NEXT_PUBLIC_` or place it in `.env.example` with a value.

Provision D1 once, add its binding to both the root and named production Wrangler environments, then apply all migrations remotely:

```bash
wrangler d1 create bagiyuk-ocr-quota
wrangler d1 migrations apply bagiyuk-ocr-quota --remote
```

Named Wrangler environments do not inherit D1 bindings.

## Deploy and verify

Run the complete quality gate, then deploy the Worker:

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

Production verification completed on 2026-08-11:

- `GET /api/receipts/parse` reported `enabled: true` without exposing any secret.
- Direct unauthenticated access to the Cloud Run service was denied.
- A real browser scan passed Turnstile, reserved a D1 row, completed WIF STS exchange and Google ID-token generation, reached the private PP-OCRv6 service, and returned editable receipt fields.
- No Google service-account private key is configured or used.

Repeat these checks after every identity, service, or Worker change:

1. Confirm the configuration endpoint remains enabled and has `cache-control: private, no-store`.
2. Request the Cloud Run `/healthz` path without authentication and confirm a non-success response. Google may conceal a private service as HTTP 404 instead of returning 401/403.
3. Complete one production scan and verify the result remains editable before splitting.
4. Confirm a fourth same-day scan for one device switches to local OCR with a quota message.
5. Confirm invalid Turnstile, an invalid signature, a body larger than 4 MiB, and an image over 20 megapixels are rejected before Cloud Run dispatch.
6. Confirm D1 contains only opaque quota rows and application logs contain no receipt image or extracted content.
7. Confirm the complete manual flow still works offline.

## Key rotation

Uploaded JWKS updates replace the entire provider key set. Use an overlap rotation; do not upload only the new public key before the Worker has switched.

1. In a trusted temporary location, generate a new RSA key pair and a new unique `kid`. Do not use the initial provisioning helper for a zero-downtime rotation because it immediately replaces the production Worker secret.
2. Create a combined public JWKS containing both the current and new public keys. Google accepts at most eight uploaded keys.
3. Upload the combined JWKS:

   ```bash
   gcloud iam workload-identity-pools providers update-oidc bagiyuk-worker \
     --location="global" \
     --workload-identity-pool="bagiyuk-cloudflare" \
     --jwk-json-path="/secure/admin/path/bagiyuk-wif-overlap.json"
   ```

4. Replace `GOOGLE_WIF_PRIVATE_KEY` through Wrangler secret input, update `GOOGLE_WIF_KEY_ID`, deploy, and complete a production scan.
5. Keep the old private key only in a protected rollback location during the overlap window. After at least 65 minutes and successful verification, upload a JWKS containing only the new public key, then securely destroy the old private key and temporary files.

If the new key fails during the overlap window, restore the old Worker secret and `kid`, redeploy, and investigate while both public keys remain accepted. If a signing key might be compromised, immediately set `RECEIPT_AI_PROVIDER=disabled` and deploy, remove the federated IAM binding or disable the WIF provider, then rotate. Disabling the provider prevents new exchanges but cannot revoke already-issued Google tokens before their expiration.

## Application and service rollback

The fastest safe application rollback is to set `RECEIPT_AI_PROVIDER=disabled` in the production Wrangler environment and redeploy. The configuration endpoint then hides Turnstile, and users continue through browser OCR or manual input without breaking the five-step flow.

To roll Cloud Run back while preserving private IAM, route all traffic to a known-good revision:

```bash
gcloud run revisions list --service="bagiyuk-receipt-ocr" --region="asia-southeast1"
gcloud run services update-traffic "bagiyuk-receipt-ocr" \
  --region="asia-southeast1" \
  --to-revisions="KNOWN_GOOD_REVISION=100"
```

Re-enable `cloudrun` only after the private service, WIF exchange, quota checks, and one end-to-end scan pass again. Product analytics remains optional and must never include receipt images, extracted text, participant names, or monetary values.
