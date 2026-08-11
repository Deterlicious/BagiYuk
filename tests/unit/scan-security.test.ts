import { describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  CloudRunReceiptParserProvider,
  getCloudRunIdentityToken,
} from "@/features/receipt-parser/cloud-run-provider";
import {
  getOrCreateAnonymousDeviceId,
  hashScanIdentity,
  normalizeNetworkIdentity,
  reserveScanQuota,
  SCAN_RESERVATION_SQL,
  type D1PreparedStatement,
  type ScanQuotaDatabase,
} from "@/features/receipt-parser/scan-security";

function quotaDatabase(options?: { insertError?: Error; insertChanges?: number; counts?: Record<string, number> }) {
  const database: ScanQuotaDatabase = {
    prepare(query: string) {
      const statement: D1PreparedStatement = {
        bind() {
          return statement;
        },
        async run() {
          if (query.includes("INSERT") && options?.insertError) throw options.insertError;
          return { success: true, meta: { changes: options?.insertChanges ?? 1 } };
        },
        async first<T>() {
          return (options?.counts ?? {
            device_day: 1,
            device_month: 1,
            network_day: 1,
            network_month: 1,
            global_month: 1,
            burst_ten: 0,
            burst_minute: 0,
          }) as T;
        },
      };
      return statement;
    },
  };
  return database;
}

async function createTestPrivateKey() {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2_048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  const base64 = Buffer.from(pkcs8).toString("base64").match(/.{1,64}/g)?.join("\n");
  return {
    privatePem: `-----BEGIN PRIVATE KEY-----\n${base64}\n-----END PRIVATE KEY-----`,
    publicKey: pair.publicKey,
  };
}

function syntheticIdentityToken(payload: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode(payload)}.test-signature`;
}

describe("protected server OCR", () => {
  it("reuses a valid anonymous device cookie and replaces malformed values", () => {
    expect(getOrCreateAnonymousDeviceId("abc_DEF-1234567890123456789012")).toEqual({
      id: "abc_DEF-1234567890123456789012",
      created: false,
    });
    const generated = getOrCreateAnonymousDeviceId("bad cookie");
    expect(generated.created).toBe(true);
    expect(generated.id).toMatch(/^[a-f0-9]{32}$/);
  });

  it("stores only keyed hashes instead of raw device and network identifiers", async () => {
    const identity = await hashScanIdentity(
      "device-1234567890123456789012",
      "203.0.113.42",
      "test-quota-secret-that-is-long-enough",
    );
    expect(identity.deviceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(identity.networkHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(identity)).not.toContain("203.0.113.42");
  });

  it("groups rotating IPv6 privacy addresses into the same /64 network", () => {
    expect(normalizeNetworkIdentity("2001:db8:12:34::1")).toBe(
      normalizeNetworkIdentity("2001:0db8:0012:0034:abcd::9"),
    );
    expect(normalizeNetworkIdentity("2001:db8:12:35::1")).not.toBe(
      normalizeNetworkIdentity("2001:db8:12:34::1"),
    );
  });

  it("returns the most restrictive remaining quota after an atomic reservation", async () => {
    const result = await reserveScanQuota(
      quotaDatabase({
        counts: {
          device_day: 2,
          device_month: 7,
          network_day: 4,
          network_month: 9,
          global_month: 20,
          burst_ten: 0,
          burst_minute: 0,
        },
      }),
      { deviceHash: "device", networkHash: "network" },
      new Date("2026-08-11T10:00:00.000Z"),
    );
    expect(result).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("executes the production reservation SQL atomically in SQLite", () => {
    const database = new DatabaseSync(":memory:");
    database.exec(`CREATE TABLE receipt_scan_reservations (
      id TEXT PRIMARY KEY,
      device_hash TEXT NOT NULL,
      network_hash TEXT NOT NULL,
      day_key TEXT NOT NULL,
      month_key TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`);
    const statement = database.prepare(SCAN_RESERVATION_SQL);
    const reserve = (id: string, timestamp: number) =>
      statement.run(
        id,
        "device",
        "network",
        "2026-08-11",
        "2026-08",
        timestamp,
        "device",
        timestamp - 10_000,
        "device",
        timestamp - 60_000,
        "device",
        "2026-08-11",
        "device",
        "2026-08",
        "network",
        "2026-08-11",
        "network",
        "2026-08",
        "2026-08",
      ).changes;

    expect(reserve("first", 1_000_000)).toBe(1);
    expect(reserve("burst", 1_005_000)).toBe(0);
    expect(reserve("second", 1_011_000)).toBe(1);
    expect(reserve("third", 1_022_000)).toBe(1);
    expect(reserve("daily-limit", 1_033_000)).toBe(0);
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM receipt_scan_reservations").get(),
    ).toMatchObject({ count: 3 });
    database.close();
  });

  it("fails closed and maps an atomic reservation denial to a daily quota", async () => {
    const result = await reserveScanQuota(
      quotaDatabase({
        insertChanges: 0,
        counts: {
          device_day: 3,
          device_month: 3,
          network_day: 3,
          network_month: 3,
          global_month: 3,
          burst_ten: 0,
          burst_minute: 0,
        },
      }),
      { deviceHash: "device", networkHash: "network" },
      new Date("2026-08-11T10:00:00.000Z"),
    );
    expect(result).toMatchObject({ allowed: false, reason: "device_daily" });
  });

  it("exchanges a short-lived WIF assertion for a private Cloud Run identity token", async () => {
    const { privatePem, publicKey } = await createTestPrivateKey();
    const cloudRunUrl = "https://private-ocr.example.run.app";
    const serviceAccountEmail = "invoker@example.iam.gserviceaccount.com";
    const expiresAt = Math.floor(Date.now() / 1_000) + 3_600;
    const identityToken = syntheticIdentityToken({
      aud: cloudRunUrl,
      email: serviceAccountEmail,
      email_verified: true,
      exp: expiresAt,
      iss: "https://accounts.google.com",
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "federated-access-token-long-enough",
            expires_in: 3_600,
            token_type: "Bearer",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: identityToken }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const wifAudience =
        "//iam.googleapis.com/projects/513268340263/locations/global/workloadIdentityPools/bagiyuk-cloudflare/providers/bagiyuk-worker";
      const token = await getCloudRunIdentityToken({
        url: cloudRunUrl,
        serviceAccountEmail,
        wifAudience,
        wifIssuer: "https://bagiyuk.example.workers.dev/wif",
        wifSubject: "bagiyuk-cloudflare-worker",
        wifPrivateKey: privatePem,
        wifKeyId: "bagiyuk-wif-test",
      });

      expect(token).toBe(identityToken);
      const stsRequest = fetchMock.mock.calls[0];
      if (!stsRequest) throw new Error("Missing STS request");
      expect(stsRequest[0]).toBe("https://sts.googleapis.com/v1/token");
      expect(stsRequest[1]?.headers).not.toHaveProperty("authorization");
      const stsBody = JSON.parse(String(stsRequest[1]?.body)) as Record<string, string>;
      expect(stsBody.audience).toBe(wifAudience);
      const assertion = stsBody.subjectToken ?? "";
      const [encodedHeader = "", encodedPayload = "", encodedSignature = ""] =
        assertion.split(".");
      expect(JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"))).toMatchObject({
        alg: "RS256",
        kid: "bagiyuk-wif-test",
      });
      const assertionClaims = JSON.parse(
        Buffer.from(encodedPayload, "base64url").toString("utf8"),
      ) as Record<string, unknown>;
      expect(assertionClaims).toMatchObject({
        iss: "https://bagiyuk.example.workers.dev/wif",
        sub: "bagiyuk-cloudflare-worker",
        aud: `https:${wifAudience}`,
        environment: "production",
        workload: "receipt-ocr",
      });
      expect(Number(assertionClaims.exp) - Number(assertionClaims.iat)).toBe(305);
      expect(assertionClaims.jti).toEqual(expect.any(String));
      await expect(
        crypto.subtle.verify(
          "RSASSA-PKCS1-v1_5",
          publicKey,
          Buffer.from(encodedSignature, "base64url"),
          new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
        ),
      ).resolves.toBe(true);
      const identityRequest = fetchMock.mock.calls[1];
      if (!identityRequest) throw new Error("Missing IAM Credentials request");
      expect(identityRequest[0]).toContain(
        "invoker%40example.iam.gserviceaccount.com:generateIdToken",
      );
      expect(identityRequest[1]).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: "Bearer federated-access-token-long-enough",
          }),
          body: JSON.stringify({ audience: cloudRunUrl, includeEmail: true }),
        }),
      );
      await expect(
        getCloudRunIdentityToken({
          url: cloudRunUrl,
          serviceAccountEmail,
          wifAudience,
          wifIssuer: "https://bagiyuk.example.workers.dev/wif",
          wifSubject: "bagiyuk-cloudflare-worker",
          wifPrivateKey: privatePem,
          wifKeyId: "bagiyuk-wif-test",
        }),
      ).resolves.toBe(identityToken);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("validates server OCR lines and sends a private identity token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          engine: "PP-OCRv6-small",
          lines: [
            { text: "TOKO UJI", score: 0.96, poly: [[10, 10], [200, 10], [200, 30], [10, 30]] },
            { text: "1 Nasi Goreng 25.000", score: 0.94, poly: [[10, 60], [300, 60], [300, 80], [10, 80]] },
            { text: "Subtotal 25.000", score: 0.95, poly: [[10, 100], [300, 100], [300, 120], [10, 120]] },
            { text: "Total 25.000", score: 0.97, poly: [[10, 130], [300, 130], [300, 150], [10, 150]] },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new CloudRunReceiptParserProvider(
      {
        url: "https://private-ocr.example.run.app",
        serviceAccountEmail: "invoker@example.iam.gserviceaccount.com",
        wifAudience:
          "//iam.googleapis.com/projects/513268340263/locations/global/workloadIdentityPools/bagiyuk-cloudflare/providers/bagiyuk-worker",
        wifIssuer: "https://bagiyuk.example.workers.dev/wif",
        wifSubject: "bagiyuk-cloudflare-worker",
        wifPrivateKey: "-----BEGIN PRIVATE KEY-----\nunused-in-test\n-----END PRIVATE KEY-----",
        wifKeyId: "bagiyuk-wif-test",
      },
      async () => "private-id-token",
    );
    const output = await provider.parse({
      mimeType: "image/jpeg",
      bytes: new Uint8Array([0xff, 0xd8, 0xff]),
      width: 1000,
      height: 1800,
    });
    expect(output.items[0]).toMatchObject({
      name: { value: "Nasi Goreng" },
      lineTotal: { value: 25_000 },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://private-ocr.example.run.app/v1/ocr",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer private-id-token" }),
      }),
    );
    vi.unstubAllGlobals();
  });
});
