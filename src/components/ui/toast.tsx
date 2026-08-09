"use client";

import { AlertCircle, CheckCircle2, X } from "lucide-react";

export function Toast({ message, tone = "success", onDismiss }: { message: string; tone?: "success" | "error"; onDismiss: () => void }) {
  if (!message) return null;
  return (
    <div
      className={`fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 z-50 mx-auto flex max-w-md items-start gap-3 rounded-2xl border bg-surface p-4 text-sm shadow-[0_14px_40px_rgba(24,34,29,0.2)] sm:right-5 sm:bottom-5 sm:left-auto ${tone === "error" ? "border-danger/25" : "border-success/25"}`}
      role="status"
      aria-live="polite"
    >
      {tone === "error" ? <AlertCircle className="mt-0.5 shrink-0 text-danger" aria-hidden="true" size={19} /> : <CheckCircle2 className="mt-0.5 shrink-0 text-success" aria-hidden="true" size={19} />}
      <p className="min-w-0 flex-1 font-bold leading-6">{message}</p>
      <button
        type="button"
        className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-black/5 hover:text-ink"
        onClick={onDismiss}
        aria-label="Tutup notifikasi"
      >
        <X aria-hidden="true" size={17} />
      </button>
    </div>
  );
}
