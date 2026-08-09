export const productEvents = [
  "wizard_manual_started",
  "wizard_sample_started",
  "scan_started",
  "scan_succeeded",
  "scan_failed",
  "assignment_bulk_used",
  "result_copied",
  "result_shared",
  "participant_copied",
  "participant_shared",
  "result_image_downloaded",
  "pwa_install_prompted",
  "pwa_install_accepted",
] as const;

export type ProductEvent = (typeof productEvents)[number];

/**
 * Sends only a fixed event name. Receipt contents, names, values, and device
 * identifiers are deliberately outside this boundary.
 */
export function trackProductEvent(event: ProductEvent) {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({ event });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/analytics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    // Analytics must never interrupt the bill-splitting workflow.
  }
}
