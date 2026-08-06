"use client";

import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Clipboard, Pencil, Share2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ResetDialog } from "@/components/ui/reset-dialog";
import { calculateSplit } from "@/domain/billing/calculate-split";
import type { ItemAssignment, Participant } from "@/domain/billing/types";
import type { EditableReceipt } from "@/domain/receipt/types";
import { formatRupiah } from "@/lib/currency";
import { buildShareText, copyText } from "@/lib/share";
import { avatarColor, initials } from "@/lib/utils";

export function ResultsStep({
  receipt,
  participants,
  assignments,
  onBack,
  onEditReceipt,
  onReset,
}: {
  receipt: EditableReceipt;
  participants: Participant[];
  assignments: ItemAssignment[];
  onBack: () => void;
  onEditReceipt: () => void;
  onReset: () => void;
}) {
  const [message, setMessage] = useState("");
  const calculation = useMemo(() => {
    try {
      return {
        result: calculateSplit({
          items: receipt.items.map((item) => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
          })),
          participants,
          assignments,
          charges: receipt.charges,
        }),
        error: "",
      };
    } catch {
      return { result: null, error: "Hasil belum bisa dihitung. Periksa kembali item, anggota, dan pembagiannya." };
    }
  }, [assignments, participants, receipt]);

  if (!calculation.result) {
    return (
      <section className="mx-auto max-w-[720px] rounded-2xl border border-danger/25 bg-red-50 p-6 text-center">
        <AlertTriangle className="mx-auto text-danger" aria-hidden="true" size={32} />
        <h1 className="mt-3 text-xl font-extrabold">Hitungan perlu diperiksa</h1>
        <p className="mt-2 text-sm leading-6 text-danger">{calculation.error}</p>
        <Button variant="secondary" className="mt-5" onClick={onBack}>
          <ArrowLeft aria-hidden="true" size={18} />
          Kembali ke pembagian
        </Button>
      </section>
    );
  }

  const result = calculation.result;
  const shareText = buildShareText({
    merchantName: receipt.merchantName,
    result,
    hasFees: receipt.charges.tax > 0 || receipt.charges.serviceCharge > 0,
  });

  async function copyResult() {
    try {
      await copyText(shareText);
      setMessage("Ringkasan berhasil disalin.");
    } catch {
      setMessage("Belum bisa menyalin otomatis. Pilih dan salin ringkasan secara manual.");
    }
  }

  async function shareResult() {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Hasil BagiYuk", text: shareText });
        setMessage("Ringkasan siap dibagikan.");
      } else {
        await copyResult();
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("Bagikan tidak tersedia. Gunakan tombol salin ringkasan.");
    }
  }

  const reconciliation = result.reconciliation;

  return (
    <section className="mx-auto max-w-[900px]">
      <div className="text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand text-white shadow-[0_3px_0_var(--brand-strong)]">
          <Check aria-hidden="true" size={27} strokeWidth={3} />
        </span>
        <p className="mt-5 text-sm font-extrabold tracking-[0.1em] text-brand uppercase">Hasil pembagian</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.045em] sm:text-4xl">
          {receipt.merchantName || "Makan bareng"}
        </h1>
        <p className="mt-2 text-muted">{participants.length} orang · {receipt.items.length} item</p>
      </div>

      <div
        className={`mt-8 rounded-2xl border p-5 ${
          reconciliation.isMatched
            ? "border-success/25 bg-[#edf7f2]"
            : "border-warning/30 bg-amber-50"
        }`}
        role="status"
      >
        <div className="flex items-start gap-3">
          {reconciliation.isMatched ? (
            <CheckCircle2 className="mt-0.5 shrink-0 text-success" aria-hidden="true" size={22} />
          ) : (
            <AlertTriangle className="mt-0.5 shrink-0 text-warning" aria-hidden="true" size={22} />
          )}
          <div className="min-w-0 flex-1">
            <h2 className="font-extrabold">
              {reconciliation.isMatched ? "Total cocok sampai rupiah terakhir" : "Ada selisih yang perlu diperiksa"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              {reconciliation.isMatched
                ? "Jumlah semua anggota sama persis dengan total pada struk."
                : "Selisih tidak disembunyikan atau dibagikan otomatis. Koreksi item atau ringkasan struk."}
            </p>
          </div>
        </div>
        <dl className="mt-4 grid gap-3 border-t border-current/10 pt-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="font-bold text-muted">Total dialokasikan</dt>
            <dd className="price mt-1 font-extrabold">{formatRupiah(reconciliation.allocatedTotal)}</dd>
          </div>
          <div>
            <dt className="font-bold text-muted">Total pada struk</dt>
            <dd className="price mt-1 font-extrabold">{formatRupiah(reconciliation.receiptTotal)}</dd>
          </div>
          <div>
            <dt className="font-bold text-muted">Selisih</dt>
            <dd className={`price mt-1 font-extrabold ${reconciliation.difference === 0 ? "text-success" : "text-warning"}`}>
              {formatRupiah(reconciliation.difference)}
            </dd>
          </div>
        </dl>
        {reconciliation.subtotalDifference !== 0 && (
          <p className="mt-3 border-t border-current/10 pt-3 text-xs font-bold text-warning">
            Subtotal item berbeda {formatRupiah(reconciliation.subtotalDifference)} dari subtotal yang ditulis pada struk.
          </p>
        )}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {result.participants.map((allocation) => (
          <article key={allocation.participant.id} className="receipt-edge rounded-t-2xl border border-line bg-surface px-5 pt-5 pb-8 shadow-sm">
            <div className="flex items-center gap-3 border-b border-dashed border-line pb-4">
              <span
                className="grid size-11 place-items-center rounded-full text-sm font-extrabold"
                style={{ backgroundColor: avatarColor(allocation.participant.id) }}
                aria-hidden="true"
              >
                {initials(allocation.participant.name)}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-extrabold">{allocation.participant.name}</h2>
                <p className="text-xs text-muted">{allocation.items.length} bagian item</p>
              </div>
              <p className="price text-xl font-extrabold text-brand-strong">{formatRupiah(allocation.total)}</p>
            </div>

            <dl className="mt-4 space-y-2.5 text-sm">
              {allocation.items.map((item) => (
                <div key={item.itemId} className="flex items-baseline justify-between gap-3">
                  <dt className="min-w-0 truncate text-muted">{item.name}</dt>
                  <dd className="price shrink-0 font-bold">{formatRupiah(item.amount)}</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2.5">
                <dt className="font-bold text-muted">Subtotal item</dt>
                <dd className="price font-extrabold">{formatRupiah(allocation.itemSubtotal)}</dd>
              </div>
              {allocation.taxShare > 0 && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">Pajak</dt>
                  <dd className="price font-bold">{formatRupiah(allocation.taxShare)}</dd>
                </div>
              )}
              {allocation.serviceShare > 0 && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">Layanan</dt>
                  <dd className="price font-bold">{formatRupiah(allocation.serviceShare)}</dd>
                </div>
              )}
              {allocation.discountShare > 0 && (
                <div className="flex items-baseline justify-between gap-3 text-success">
                  <dt>Bagian diskon</dt>
                  <dd className="price font-bold">−{formatRupiah(allocation.discountShare)}</dd>
                </div>
              )}
              {allocation.roundingShare !== 0 && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">Pembulatan</dt>
                  <dd className="price font-bold">{formatRupiah(allocation.roundingShare)}</dd>
                </div>
              )}
            </dl>
          </article>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-extrabold">Ringkasan siap dikirim</h2>
            <p className="mt-1 text-xs text-muted">Format singkat untuk WhatsApp atau chat grup.</p>
          </div>
          <Clipboard className="shrink-0 text-brand" aria-hidden="true" size={21} />
        </div>
        <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-canvas p-4 font-sans text-sm leading-6 text-ink">
          {shareText}
        </pre>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Button onClick={shareResult}>
            <Share2 aria-hidden="true" size={18} />
            Bagikan hasil
          </Button>
          <Button variant="secondary" onClick={copyResult}>
            <Clipboard aria-hidden="true" size={18} />
            Salin ringkasan
          </Button>
        </div>
        <p className="mt-3 min-h-5 text-center text-sm font-bold text-success" aria-live="polite">
          {message}
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button variant="ghost" size="small" onClick={onBack}>
          <ArrowLeft aria-hidden="true" size={17} />
          Ubah pembagian
        </Button>
        <Button variant="ghost" size="small" onClick={onEditReceipt}>
          <Pencil aria-hidden="true" size={16} />
          Edit struk
        </Button>
        <ResetDialog onConfirm={onReset} />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/96 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-md sm:hidden">
        <Button className="w-full" onClick={shareResult}>
          <Share2 aria-hidden="true" size={18} />
          Bagikan hasil
        </Button>
      </div>
    </section>
  );
}
