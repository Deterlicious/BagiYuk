export const SERVER_SCAN_LIMITS = {
  deviceDaily: 3,
  deviceMonthly: 20,
  networkDaily: 10,
  networkMonthly: 50,
  globalMonthly: 800,
} as const;

const QUOTA_RETENTION_MS = 70 * 24 * 60 * 60 * 1_000;

export type D1RunResult = { success: boolean; meta?: { changes?: number } };
export type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<D1RunResult>;
  first<T>(): Promise<T | null>;
};
export type ScanQuotaDatabase = { prepare(query: string): D1PreparedStatement };

export type QuotaReason =
  | "burst"
  | "device_daily"
  | "device_monthly"
  | "network_daily"
  | "network_monthly"
  | "global_monthly"
  | "unavailable";

export type ScanQuotaResult =
  | { allowed: true; remaining: number; dailyResetAt: number; monthlyResetAt: number }
  | { allowed: false; reason: QuotaReason; retryAt: number };

type QuotaCounts = {
  device_day: number | null;
  device_month: number | null;
  network_day: number | null;
  network_month: number | null;
  global_month: number | null;
  burst_ten: number | null;
  burst_minute: number | null;
};

function periodKeys(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return { day: `${year}-${month}-${day}`, month: `${year}-${month}` };
}

function nextUtcDay(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

function nextUtcMonth(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function getOrCreateAnonymousDeviceId(cookieValue: string | undefined) {
  if (cookieValue && /^[A-Za-z0-9_-]{22,64}$/.test(cookieValue)) {
    return { id: cookieValue, created: false };
  }
  return { id: crypto.randomUUID().replace(/-/g, ""), created: true };
}

export async function hashScanIdentity(deviceId: string, network: string, secret: string) {
  if (secret.length < 24) throw new Error("quota_secret_too_short");
  const [deviceHash, networkHash] = await Promise.all([
    hmac(`device:${deviceId}`, secret),
    hmac(`network:${normalizeNetworkIdentity(network)}`, secret),
  ]);
  return { deviceHash, networkHash };
}

/** Keeps IPv4 exact, but groups IPv6 privacy addresses by their first 64 bits. */
export function normalizeNetworkIdentity(network: string) {
  const value = network.trim().toLocaleLowerCase("en-US").split("%", 1)[0] ?? "";
  if (!value.includes(":")) return value;
  if (value.includes(".")) return value;
  const halves = value.split("::");
  if (halves.length > 2) return value;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  if (
    left.some((part) => !/^[a-f0-9]{1,4}$/.test(part)) ||
    right.some((part) => !/^[a-f0-9]{1,4}$/.test(part))
  ) {
    return value;
  }
  const missing = halves.length === 2 ? 8 - left.length - right.length : 0;
  const groups = [...left, ...Array(Math.max(0, missing)).fill("0"), ...right];
  if (groups.length !== 8) return value;
  return `${groups
    .slice(0, 4)
    .map((part) => part.padStart(4, "0"))
    .join(":")}::/64`;
}

function deniedResult(reason: QuotaReason, timestamp: number, dailyResetAt: number, monthlyResetAt: number) {
  return {
    allowed: false as const,
    reason,
    retryAt:
      reason === "burst"
        ? timestamp + 60_000
        : reason === "unavailable"
          ? timestamp + 60_000
        : reason.includes("monthly")
          ? monthlyResetAt
          : dailyResetAt,
  };
}

function limitReason(counts: QuotaCounts | null): QuotaReason {
  if (Number(counts?.burst_ten ?? 0) >= 1 || Number(counts?.burst_minute ?? 0) >= 3) {
    return "burst";
  }
  if (Number(counts?.device_day ?? 0) >= SERVER_SCAN_LIMITS.deviceDaily) return "device_daily";
  if (Number(counts?.device_month ?? 0) >= SERVER_SCAN_LIMITS.deviceMonthly) return "device_monthly";
  if (Number(counts?.network_day ?? 0) >= SERVER_SCAN_LIMITS.networkDaily) return "network_daily";
  if (Number(counts?.network_month ?? 0) >= SERVER_SCAN_LIMITS.networkMonthly) return "network_monthly";
  if (Number(counts?.global_month ?? 0) >= SERVER_SCAN_LIMITS.globalMonthly) return "global_monthly";
  return "unavailable";
}

export async function reserveScanQuota(
  database: ScanQuotaDatabase,
  identity: { deviceHash: string; networkHash: string },
  now = new Date(),
): Promise<ScanQuotaResult> {
  const { day, month } = periodKeys(now);
  const timestamp = now.getTime();
  const dailyResetAt = nextUtcDay(now);
  const monthlyResetAt = nextUtcMonth(now);
  const countQuery = `SELECT
    SUM(CASE WHEN device_hash = ? AND day_key = ? THEN 1 ELSE 0 END) AS device_day,
    SUM(CASE WHEN device_hash = ? AND month_key = ? THEN 1 ELSE 0 END) AS device_month,
    SUM(CASE WHEN network_hash = ? AND day_key = ? THEN 1 ELSE 0 END) AS network_day,
    SUM(CASE WHEN network_hash = ? AND month_key = ? THEN 1 ELSE 0 END) AS network_month,
    SUM(CASE WHEN month_key = ? THEN 1 ELSE 0 END) AS global_month,
    SUM(CASE WHEN device_hash = ? AND created_at > ? THEN 1 ELSE 0 END) AS burst_ten,
    SUM(CASE WHEN device_hash = ? AND created_at > ? THEN 1 ELSE 0 END) AS burst_minute
   FROM receipt_scan_reservations`;
  const countBindings = [
    identity.deviceHash,
    day,
    identity.deviceHash,
    month,
    identity.networkHash,
    day,
    identity.networkHash,
    month,
    month,
    identity.deviceHash,
    timestamp - 10_000,
    identity.deviceHash,
    timestamp - 60_000,
  ];

  try {
    await database
      .prepare("DELETE FROM receipt_scan_reservations WHERE created_at < ?")
      .bind(timestamp - QUOTA_RETENTION_MS)
      .run();
    const reservation = await database
      .prepare(SCAN_RESERVATION_SQL)
      .bind(
        crypto.randomUUID(),
        identity.deviceHash,
        identity.networkHash,
        day,
        month,
        timestamp,
        identity.deviceHash,
        timestamp - 10_000,
        identity.deviceHash,
        timestamp - 60_000,
        identity.deviceHash,
        day,
        identity.deviceHash,
        month,
        identity.networkHash,
        day,
        identity.networkHash,
        month,
        month,
      )
      .run();

    const counts = await database.prepare(countQuery).bind(...countBindings).first<QuotaCounts>();
    if (Number(reservation.meta?.changes ?? 0) !== 1) {
      return deniedResult(limitReason(counts), timestamp, dailyResetAt, monthlyResetAt);
    }
    const remaining = Math.max(
      0,
      Math.min(
        SERVER_SCAN_LIMITS.deviceDaily - Number(counts?.device_day ?? 0),
        SERVER_SCAN_LIMITS.deviceMonthly - Number(counts?.device_month ?? 0),
        SERVER_SCAN_LIMITS.networkDaily - Number(counts?.network_day ?? 0),
        SERVER_SCAN_LIMITS.networkMonthly - Number(counts?.network_month ?? 0),
        SERVER_SCAN_LIMITS.globalMonthly - Number(counts?.global_month ?? 0),
      ),
    );
    return { allowed: true, remaining, dailyResetAt, monthlyResetAt };
  } catch {
    return deniedResult("unavailable", timestamp, dailyResetAt, monthlyResetAt);
  }
}

export type TurnstileVerification = {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
};

export const SCAN_RESERVATION_SQL = `INSERT INTO receipt_scan_reservations
  (id, device_hash, network_hash, day_key, month_key, created_at)
 SELECT ?, ?, ?, ?, ?, ?
 WHERE (SELECT COUNT(*) FROM receipt_scan_reservations WHERE device_hash = ? AND created_at > ?) < 1
   AND (SELECT COUNT(*) FROM receipt_scan_reservations WHERE device_hash = ? AND created_at > ?) < 3
   AND (SELECT COUNT(*) FROM receipt_scan_reservations WHERE device_hash = ? AND day_key = ?) < ${SERVER_SCAN_LIMITS.deviceDaily}
   AND (SELECT COUNT(*) FROM receipt_scan_reservations WHERE device_hash = ? AND month_key = ?) < ${SERVER_SCAN_LIMITS.deviceMonthly}
   AND (SELECT COUNT(*) FROM receipt_scan_reservations WHERE network_hash = ? AND day_key = ?) < ${SERVER_SCAN_LIMITS.networkDaily}
   AND (SELECT COUNT(*) FROM receipt_scan_reservations WHERE network_hash = ? AND month_key = ?) < ${SERVER_SCAN_LIMITS.networkMonthly}
   AND (SELECT COUNT(*) FROM receipt_scan_reservations WHERE month_key = ?) < ${SERVER_SCAN_LIMITS.globalMonthly}`;

export async function verifyTurnstileToken({
  token,
  secret,
  remoteIp,
  expectedHostname,
  signal,
}: {
  token: string;
  secret: string;
  remoteIp: string;
  expectedHostname: string;
  signal?: AbortSignal;
}) {
  if (!token || token.length > 2_048 || !secret) return false;
  const controller = new AbortController();
  const relayAbort = () => controller.abort(signal?.reason ?? "request_aborted");
  if (signal?.aborted) relayAbort();
  else signal?.addEventListener("abort", relayAbort, { once: true });
  const timeout = setTimeout(() => controller.abort("turnstile_timeout"), 8_000);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: remoteIp }),
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const result = (await response.json()) as TurnstileVerification;
    return (
      result.success === true &&
      result.action === "receipt_scan" &&
      result.hostname?.toLocaleLowerCase("en-US") === expectedHostname.toLocaleLowerCase("en-US")
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", relayAbort);
  }
}
