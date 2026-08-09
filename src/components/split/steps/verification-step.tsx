"use client";

import { AlertTriangle, ArrowLeft, ArrowRight, CopyPlus, Plus, ReceiptText, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/money-input";
import type { EditableReceipt, EditableReceiptItem, ReceiptChargeConfidence } from "@/domain/receipt/types";
import { formatRupiah } from "@/lib/currency";
import { cn, createId } from "@/lib/utils";

const confidenceThreshold = 0.75;

const chargeFields: Array<{
  key: keyof EditableReceipt["charges"];
  confidenceKey: keyof ReceiptChargeConfidence;
  label: string;
  help?: string;
  allowNegative?: boolean;
}> = [
  { key: "statedSubtotal", confidenceKey: "statedSubtotal", label: "Subtotal pada struk" },
  { key: "tax", confidenceKey: "tax", label: "Pajak" },
  { key: "serviceCharge", confidenceKey: "serviceCharge", label: "Biaya layanan" },
  { key: "discount", confidenceKey: "discount", label: "Diskon", help: "Masukkan sebagai nilai positif" },
  { key: "rounding", confidenceKey: "rounding", label: "Pembulatan", allowNegative: true },
  { key: "receiptTotal", confidenceKey: "receiptTotal", label: "Total pada struk" },
];

function safeProduct(left: number, right: number) {
  const product = BigInt(left) * BigInt(right);
  return product > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(product);
}

function FieldCheck({ confidence }: { confidence: number }) {
  if (confidence >= confidenceThreshold) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-warning/25 bg-amber-50 px-2 py-1 text-[0.68rem] font-extrabold text-warning">
      <AlertTriangle aria-hidden="true" size={12} />
      Periksa
    </span>
  );
}

export function VerificationStep({
  receipt,
  onChange,
  onBack,
  onContinue,
}: {
  receipt: EditableReceipt;
  onChange: (receipt: EditableReceipt) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [error, setError] = useState("");
  const calculatedSubtotal = useMemo(
    () => receipt.items.reduce((sum, item) => sum + item.lineTotal, 0),
    [receipt.items],
  );
  const lowConfidenceCount = useMemo(() => {
    let count = receipt.merchantConfidence < confidenceThreshold ? 1 : 0;
    for (const item of receipt.items) {
      count += Object.values(item.confidence).filter((confidence) => confidence < confidenceThreshold).length;
    }
    count += Object.values(receipt.chargeConfidence).filter(
      (confidence) => confidence < confidenceThreshold,
    ).length;
    return count;
  }, [receipt]);
  const calculatedTotal =
    calculatedSubtotal +
    receipt.charges.tax +
    receipt.charges.serviceCharge -
    receipt.charges.discount +
    receipt.charges.rounding;

  function updateItem(id: string, changes: Partial<EditableReceiptItem>) {
    const nextItems = receipt.items.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item, ...changes, confidence: { ...item.confidence } };
      if ("name" in changes) next.confidence.name = 1;
      if ("quantity" in changes) next.confidence.quantity = 1;
      if ("unitPrice" in changes) next.confidence.unitPrice = 1;
      if ("lineTotal" in changes) next.confidence.lineTotal = 1;
      return next;
    });
    onChange({ ...receipt, items: nextItems });
  }

  function addItem(after?: EditableReceiptItem) {
    const item: EditableReceiptItem = after
      ? {
          ...after,
          id: createId("item"),
          name: `${after.name} (salinan)`,
          confidence: { name: 1, quantity: 1, unitPrice: 1, lineTotal: 1 },
        }
      : {
          id: createId("item"),
          name: "",
          quantity: 1,
          unitPrice: 0,
          lineTotal: 0,
          confidence: { name: 1, quantity: 1, unitPrice: 1, lineTotal: 1 },
        };
    onChange({ ...receipt, items: [...receipt.items, item] });
  }

  function removeItem(id: string) {
    onChange({ ...receipt, items: receipt.items.filter((item) => item.id !== id) });
  }

  function updateCharge(
    key: keyof EditableReceipt["charges"],
    confidenceKey: keyof ReceiptChargeConfidence,
    value: number,
  ) {
    onChange({
      ...receipt,
      charges: { ...receipt.charges, [key]: value },
      chargeConfidence: { ...receipt.chargeConfidence, [confidenceKey]: 1 },
    });
  }

  function syncTotals() {
    onChange({
      ...receipt,
      charges: {
        ...receipt.charges,
        statedSubtotal: calculatedSubtotal,
        receiptTotal: Math.max(0, calculatedTotal),
      },
      chargeConfidence: {
        ...receipt.chargeConfidence,
        statedSubtotal: 1,
        receiptTotal: 1,
      },
    });
  }

  function confirmLowConfidenceFields() {
    onChange({
      ...receipt,
      merchantConfidence: 1,
      items: receipt.items.map((item) => ({
        ...item,
        confidence: { name: 1, quantity: 1, unitPrice: 1, lineTotal: 1 },
      })),
      chargeConfidence: {
        statedSubtotal: 1,
        tax: 1,
        serviceCharge: 1,
        discount: 1,
        rounding: 1,
        receiptTotal: 1,
      },
    });
    setError("");
  }

  function continueFlow() {
    if (receipt.items.length === 0) {
      setError("Tambahkan setidaknya satu item sebelum melanjutkan.");
      return;
    }
    if (receipt.items.some((item) => !item.name.trim() || item.quantity < 1 || item.lineTotal <= 0)) {
      setError("Lengkapi nama, jumlah, dan total untuk setiap item.");
      return;
    }
    if (calculatedTotal < 0) {
      setError("Diskon atau pembulatan membuat total negatif. Periksa ringkasan struk.");
      return;
    }
    if (lowConfidenceCount > 0) {
      setError(`Masih ada ${lowConfidenceCount} bagian bertanda Periksa. Koreksi nilainya atau tandai bahwa semuanya sudah diperiksa.`);
      return;
    }
    setError("");
    onContinue();
  }

  return (
    <section>
      <div className="max-w-[720px]">
        <p className="text-sm font-extrabold tracking-[0.1em] text-brand uppercase">Periksa hasil</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.045em] sm:text-4xl">
          Pastikan item dan angka sudah benar.
        </h1>
        <p className="mt-3 text-base leading-7 text-muted">
          Semua hasil scan wajib diperiksa. Label <strong className="text-warning">Periksa</strong> menandai bagian yang kurang yakin terbaca.
        </p>
      </div>

      <div className={`mt-6 flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 ${lowConfidenceCount > 0 ? "border-warning/30 bg-amber-50" : "border-success/25 bg-[#edf7f2]"}`} role="status">
        <div className="flex items-start gap-3">
          {lowConfidenceCount > 0 ? <AlertTriangle className="mt-0.5 shrink-0 text-warning" aria-hidden="true" size={21} /> : <ReceiptText className="mt-0.5 shrink-0 text-success" aria-hidden="true" size={21} />}
          <div>
            <p className="font-extrabold">{lowConfidenceCount > 0 ? `${lowConfidenceCount} bagian perlu konfirmasi` : "Semua bagian sudah diperiksa"}</p>
            <p className="mt-1 text-sm leading-6 text-muted">{lowConfidenceCount > 0 ? "Periksa label berwarna kuning di bawah, lalu edit nilainya atau konfirmasi semuanya sekaligus." : "Kamu tetap dapat mengubah item dan ringkasan sebelum melanjutkan."}</p>
          </div>
        </div>
        {lowConfidenceCount > 0 && <Button variant="secondary" size="small" onClick={confirmLowConfidenceFields}>Tandai sudah diperiksa</Button>}
      </div>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
            <label htmlFor="merchant-name" className="flex items-center gap-2 text-sm font-extrabold text-ink">
              Nama tempat
              <FieldCheck confidence={receipt.merchantConfidence} />
            </label>
            <input
              id="merchant-name"
              value={receipt.merchantName}
              onChange={(event) =>
                onChange({ ...receipt, merchantName: event.target.value, merchantConfidence: 1 })
              }
              className={cn(
                "mt-2 min-h-12 w-full rounded-xl border bg-white px-3 text-base font-bold text-ink outline-none transition focus:border-brand focus:ring-3 focus:ring-brand/15",
                receipt.merchantConfidence < confidenceThreshold ? "border-warning bg-amber-50" : "border-line",
              )}
              placeholder="Contoh: Warung Sedap Sore"
            />
          </div>

          <div className="mt-5 space-y-4">
            {receipt.items.map((item, index) => {
              const hasLowConfidence = Object.values(item.confidence).some(
                (confidence) => confidence < confidenceThreshold,
              );
              const expectedLineTotal = safeProduct(item.quantity, item.unitPrice);
              return (
                <article key={item.id} className="rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5">
                  <div className="flex items-center justify-between gap-3 border-b border-dashed border-line pb-4">
                    <div className="flex items-center gap-2">
                      <span className="grid size-8 place-items-center rounded-lg bg-canvas text-xs font-extrabold text-muted">
                        {index + 1}
                      </span>
                      <h2 className="font-extrabold">Item struk</h2>
                      {hasLowConfidence && <FieldCheck confidence={0} />}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="small"
                        onClick={() => addItem(item)}
                        aria-label={`Duplikat ${item.name || `item ${index + 1}`}`}
                      >
                        <CopyPlus aria-hidden="true" size={16} />
                        <span className="hidden sm:inline">Duplikat</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="small"
                        className="text-danger hover:text-danger"
                        onClick={() => removeItem(item.id)}
                        aria-label={`Hapus ${item.name || `item ${index + 1}`}`}
                      >
                        <Trash2 aria-hidden="true" size={16} />
                        <span className="hidden sm:inline">Hapus</span>
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label htmlFor={`item-name-${item.id}`} className="flex min-h-6 items-center gap-2 text-sm font-bold text-muted">
                        Nama item <FieldCheck confidence={item.confidence.name} />
                      </label>
                      <input
                        id={`item-name-${item.id}`}
                        value={item.name}
                        onChange={(event) => updateItem(item.id, { name: event.target.value })}
                        className={cn(
                          "mt-2 min-h-12 w-full rounded-xl border bg-white px-3 text-base font-bold text-ink outline-none transition focus:border-brand focus:ring-3 focus:ring-brand/15",
                          item.confidence.name < confidenceThreshold ? "border-warning bg-amber-50" : "border-line",
                        )}
                        placeholder="Nama menu"
                      />
                    </div>
                    <div>
                      <label htmlFor={`item-quantity-${item.id}`} className="flex min-h-6 items-center gap-2 text-sm font-bold text-muted">
                        Jumlah <FieldCheck confidence={item.confidence.quantity} />
                      </label>
                      <input
                        id={`item-quantity-${item.id}`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={999}
                        value={item.quantity}
                        onChange={(event) => {
                          const quantity = Math.max(1, Math.min(999, Number(event.target.value) || 1));
                          updateItem(item.id, {
                            quantity,
                            lineTotal: safeProduct(quantity, item.unitPrice),
                          });
                        }}
                        className="mt-2 min-h-12 w-full rounded-xl border border-line bg-white px-3 text-base font-bold text-ink outline-none transition focus:border-brand focus:ring-3 focus:ring-brand/15"
                      />
                    </div>
                    <div>
                      <label htmlFor={`item-unit-${item.id}`} className="flex min-h-6 items-center gap-2 text-sm font-bold text-muted">
                        Harga satuan <FieldCheck confidence={item.confidence.unitPrice} />
                      </label>
                      <MoneyInput
                        id={`item-unit-${item.id}`}
                        className="mt-2"
                        value={item.unitPrice}
                        onValueChange={(unitPrice) =>
                          updateItem(item.id, {
                            unitPrice,
                            lineTotal: safeProduct(item.quantity, unitPrice),
                          })
                        }
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor={`item-total-${item.id}`} className="flex min-h-6 items-center gap-2 text-sm font-bold text-muted">
                        Total baris <FieldCheck confidence={item.confidence.lineTotal} />
                      </label>
                      <MoneyInput
                        id={`item-total-${item.id}`}
                        className="mt-2"
                        value={item.lineTotal}
                        onValueChange={(lineTotal) => updateItem(item.id, { lineTotal })}
                      />
                      {item.lineTotal !== expectedLineTotal && (
                        <p className="mt-2 text-xs leading-5 font-bold text-warning">
                          Berbeda dari {item.quantity} × {formatRupiah(item.unitPrice)} = {formatRupiah(expectedLineTotal)}. Perbedaan boleh dipertahankan jika memang tercetak begitu.
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <Button variant="secondary" className="mt-4 w-full border-dashed" onClick={() => addItem()}>
            <Plus aria-hidden="true" size={18} />
            Tambah item
          </Button>
        </div>

        <aside className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5 lg:sticky lg:top-28">
          <div className="flex items-center gap-3 border-b border-dashed border-line pb-4">
            <span className="grid size-10 place-items-center rounded-xl bg-brand/8 text-brand">
              <ReceiptText aria-hidden="true" size={20} />
            </span>
            <div>
              <h2 className="font-extrabold">Ringkasan struk</h2>
              <p className="text-xs text-muted">Semua nominal dalam rupiah</p>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {chargeFields.map((field) => (
              <div key={field.key} className="min-w-0">
                <label htmlFor={`charge-${field.key}`} className="flex min-h-6 items-center justify-between gap-2 text-sm font-bold text-muted">
                  <span>{field.label}</span>
                  <FieldCheck confidence={receipt.chargeConfidence[field.confidenceKey]} />
                </label>
                <MoneyInput
                  id={`charge-${field.key}`}
                  className="mt-2"
                  value={receipt.charges[field.key]}
                  allowNegative={field.allowNegative}
                  onValueChange={(value) => updateCharge(field.key, field.confidenceKey, value)}
                />
                {field.help && <p className="mt-1 text-xs text-muted">{field.help}</p>}
              </div>
            ))}
          </div>

          <div className="mt-5 border-t-2 border-ink pt-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-bold text-muted">Subtotal dari item</span>
              <strong className="price">{formatRupiah(calculatedSubtotal)}</strong>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-base">
              <span className="font-extrabold">Total hitungan</span>
              <strong className="price text-lg">{formatRupiah(calculatedTotal)}</strong>
            </div>
            {(receipt.charges.statedSubtotal !== calculatedSubtotal ||
              receipt.charges.receiptTotal !== calculatedTotal) && (
              <button
                type="button"
                className="mt-3 min-h-10 w-full rounded-lg bg-accent-soft px-3 text-sm font-extrabold text-[#843c2d] transition hover:bg-[#fbd9cc] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/25"
                onClick={syncTotals}
              >
                Samakan total dengan hitungan
              </button>
            )}
          </div>
        </aside>
      </div>

      {error && (
        <p className="mx-auto mt-5 max-w-[700px] rounded-xl border border-danger/25 bg-red-50 p-4 text-sm font-bold text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/96 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-md lg:static lg:mt-8 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none">
        <div className="mx-auto flex max-w-[1120px] gap-3 lg:justify-end">
          <Button variant="secondary" onClick={onBack} className="px-4" aria-label="Kembali">
            <ArrowLeft aria-hidden="true" size={18} />
            <span className="hidden sm:inline">Kembali</span>
          </Button>
          <Button onClick={continueFlow} className="min-w-0 flex-1 [flex-shrink:1] whitespace-normal px-3 lg:flex-none lg:min-w-52 lg:px-5">
            Lanjut ke anggota
            <ArrowRight aria-hidden="true" size={18} />
          </Button>
        </div>
      </div>
    </section>
  );
}
