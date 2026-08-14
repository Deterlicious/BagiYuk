"use client";

import Link from "next/link";
import { ArrowRight, Clock3, ReceiptText } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonStyles } from "@/components/ui/button";
import { DRAFT_STORAGE_KEY, draftStateSchema } from "@/features/splitter/draft";

const stepNames = ["Struk", "Periksa", "Anggota", "Bagikan", "Hasil"] as const;

type DraftSummary = {
  step: number;
  merchantName: string;
  itemCount: number;
  participantCount: number;
};

export function ResumeDraftCard() {
  const [summary, setSummary] = useState<DraftSummary | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return;
      const parsed = draftStateSchema.safeParse(JSON.parse(raw));
      if (!parsed.success || (parsed.data.step === 1 && parsed.data.receipt.items.length === 0)) return;
      const nextSummary = {
        step: parsed.data.step,
        merchantName: parsed.data.receipt.merchantName || "Pembagian tanpa nama",
        itemCount: parsed.data.receipt.items.length,
        participantCount: parsed.data.participants.length,
      };
      queueMicrotask(() => setSummary(nextSummary));
    } catch {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  }, []);

  if (!summary) return null;

  return (
    <section className="mx-auto w-full max-w-[1160px] px-5 pb-16 sm:px-8 lg:px-10" aria-label="Lanjutkan draft">
      <div className="flex flex-col gap-5 rounded-2xl border border-brand/20 bg-brand/5 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-white"><ReceiptText aria-hidden="true" size={21} /></span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-extrabold tracking-[0.08em] text-brand uppercase"><Clock3 aria-hidden="true" size={14} /> Draft di perangkat ini</p>
            <h2 className="mt-1 truncate text-lg font-extrabold">{summary.merchantName}</h2>
            <p className="mt-1 text-sm text-muted">Langkah {summary.step}: {stepNames[summary.step - 1]} · {summary.itemCount} item · {summary.participantCount} anggota</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/split/new" className={buttonStyles({ size: "small" })}>Lanjutkan <ArrowRight aria-hidden="true" size={17} /></Link>
          <Link href="/split/new?fresh=1" className={buttonStyles({ variant: "ghost", size: "small" })}>Mulai baru</Link>
        </div>
      </div>
    </section>
  );
}
