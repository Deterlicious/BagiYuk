"use client";

import { useEffect, useRef } from "react";

type TurnstileApi = {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-bagiyuk-turnstile]");
    const script = existing ?? document.createElement("script");
    const check = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("turnstile_unavailable"));
    };
    script.addEventListener("load", check, { once: true });
    script.addEventListener("error", () => reject(new Error("turnstile_load_failed")), { once: true });
    if (!existing) {
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.bagiyukTurnstile = "true";
      document.head.appendChild(script);
    } else if (window.turnstile) {
      resolve(window.turnstile);
    }
  }).catch((error) => {
    scriptPromise = null;
    throw error;
  });
  return scriptPromise;
}

export function TurnstileWidget({
  siteKey,
  onToken,
  onUnavailable,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
  onUnavailable?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let widgetId: string | null = null;
    void loadTurnstile()
      .then((turnstile) => {
        if (disposed || !containerRef.current) return;
        widgetId = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action: "receipt_scan",
          theme: "light",
          size: "flexible",
          callback: (token: string) => onToken(token),
          "expired-callback": () => onToken(null),
          "timeout-callback": () => onToken(null),
          "error-callback": () => {
            onToken(null);
            onUnavailable?.();
          },
        });
      })
      .catch(() => onUnavailable?.());
    return () => {
      disposed = true;
      onToken(null);
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [onToken, onUnavailable, siteKey]);

  return <div ref={containerRef} className="min-h-[65px]" aria-label="Pemeriksaan keamanan pemindai pintar" />;
}
