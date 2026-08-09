"use client";

import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { trackProductEvent } from "@/lib/analytics";

type InstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const INSTALL_SNOOZE_KEY = "bagiyuk:pwa-install-snoozed";
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1_000;

export function PwaRegister() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // The manual flow remains available even when registration is blocked.
      });
    }
  }, []);

  useEffect(() => {
    function handleInstallPrompt(event: Event) {
      event.preventDefault();
      const lastDismissed = Number(window.localStorage.getItem(INSTALL_SNOOZE_KEY) ?? 0);
      if (Date.now() - lastDismissed < SNOOZE_MS) return;
      setInstallPrompt(event as InstallPromptEvent);
      window.setTimeout(() => {
        setVisible(true);
        trackProductEvent("pwa_install_prompted");
      }, 12_000);
    }
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
  }, []);

  function dismiss() {
    window.localStorage.setItem(INSTALL_SNOOZE_KEY, String(Date.now()));
    setVisible(false);
  }

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      trackProductEvent("pwa_install_accepted");
    } else {
      window.localStorage.setItem(INSTALL_SNOOZE_KEY, String(Date.now()));
    }
    setVisible(false);
    setInstallPrompt(null);
  }

  if (!visible || !installPrompt) return null;
  return (
    <aside className="fixed right-4 bottom-4 left-4 z-40 mx-auto max-w-md rounded-2xl border border-brand/20 bg-surface p-4 shadow-[0_16px_45px_rgba(24,34,29,0.2)] sm:right-5 sm:left-auto" aria-label="Pasang aplikasi BagiYuk">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-white"><Download aria-hidden="true" size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold">Akses BagiYuk lebih cepat</p>
          <p className="mt-1 text-xs leading-5 text-muted">Pasang ke layar utama. Tidak perlu akun dan bisa dihapus kapan saja.</p>
        </div>
        <button type="button" className="grid size-10 place-items-center rounded-lg text-muted hover:bg-black/5" onClick={dismiss} aria-label="Nanti saja">
          <X aria-hidden="true" size={18} />
        </button>
      </div>
      <button type="button" className="mt-3 min-h-11 w-full rounded-xl bg-brand px-4 text-sm font-extrabold text-white shadow-[0_2px_0_var(--brand-strong)] hover:bg-brand-strong" onClick={() => void install()}>
        Pasang aplikasi
      </button>
    </aside>
  );
}
