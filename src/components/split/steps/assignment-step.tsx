"use client";

import { ArrowLeft, ArrowRight, Check, Eraser, Minus, Plus, Sparkles, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { calculateSplit } from "@/domain/billing/calculate-split";
import type { ItemAssignment, Participant } from "@/domain/billing/types";
import type { EditableReceiptItem } from "@/domain/receipt/types";
import { formatRupiah } from "@/lib/currency";
import { trackProductEvent } from "@/lib/analytics";
import { avatarColor, initials } from "@/lib/utils";

export function AssignmentStep({
  items,
  participants,
  assignments,
  onChange,
  onBack,
  onContinue,
}: {
  items: EditableReceiptItem[];
  participants: Participant[];
  assignments: ItemAssignment[];
  onChange: (assignments: ItemAssignment[]) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [error, setError] = useState("");
  const [bulkParticipantId, setBulkParticipantId] = useState(participants[0]?.id ?? "");
  const completed = useMemo(
    () => items.filter((item) => (assignments.find((entry) => entry.itemId === item.id)?.participantIds.length ?? 0) > 0).length,
    [assignments, items],
  );
  const runningTotals = useMemo(() => {
    const validAssignments = assignments.filter((assignment) => assignment.participantIds.length > 0);
    const assignedIds = new Set(validAssignments.map((assignment) => assignment.itemId));
    const assignedItems = items.filter((item) => assignedIds.has(item.id));
    if (assignedItems.length === 0) return new Map(participants.map((participant) => [participant.id, 0]));
    const subtotal = assignedItems.reduce((sum, item) => sum + item.lineTotal, 0);
    try {
      const result = calculateSplit({
        items: assignedItems,
        participants,
        assignments: validAssignments,
        charges: { statedSubtotal: subtotal, tax: 0, serviceCharge: 0, discount: 0, rounding: 0, receiptTotal: subtotal },
      });
      return new Map(result.participants.map((allocation) => [allocation.participant.id, allocation.itemSubtotal]));
    } catch {
      return new Map(participants.map((participant) => [participant.id, 0]));
    }
  }, [assignments, items, participants]);

  function ownersFor(itemId: string) {
    return assignments.find((assignment) => assignment.itemId === itemId)?.participantIds ?? [];
  }

  function weightFor(itemId: string, participantId: string) {
    return assignments.find((assignment) => assignment.itemId === itemId)?.weights?.[participantId] ?? 1;
  }

  function setOwners(itemId: string, participantIds: string[]) {
    const existing = assignments.find((assignment) => assignment.itemId === itemId);
    const weights = Object.fromEntries(
      participantIds.map((participantId) => [participantId, existing?.weights?.[participantId] ?? 1]),
    );
    const next = existing
      ? assignments.map((assignment) =>
          assignment.itemId === itemId
            ? { itemId, participantIds, ...(participantIds.length > 0 ? { weights } : {}) }
            : assignment,
        )
      : [...assignments, { itemId, participantIds, ...(participantIds.length > 0 ? { weights } : {}) }];
    onChange(next);
    setError("");
  }

  function setWeight(itemId: string, participantId: string, weight: number) {
    const nextWeight = Math.max(1, Math.min(20, weight));
    onChange(assignments.map((assignment) => {
      if (assignment.itemId !== itemId) return assignment;
      return {
        ...assignment,
        weights: Object.fromEntries(
          assignment.participantIds.map((id) => [
            id,
            id === participantId ? nextWeight : assignment.weights?.[id] ?? 1,
          ]),
        ),
      };
    }));
    setError("");
  }

  function toggleOwner(itemId: string, participantId: string) {
    const owners = ownersFor(itemId);
    setOwners(
      itemId,
      owners.includes(participantId)
        ? owners.filter((id) => id !== participantId)
        : [...owners, participantId],
    );
  }

  function setEveryItem(participantIds: string[]) {
    onChange(items.map((item) => ({ itemId: item.id, participantIds })));
    setError("");
    trackProductEvent("assignment_bulk_used");
  }

  function fillUnassigned() {
    if (!bulkParticipantId) return;
    onChange(items.map((item) => {
      const existing = assignments.find((assignment) => assignment.itemId === item.id);
      if (existing?.participantIds.length) return existing;
      return { itemId: item.id, participantIds: [bulkParticipantId], weights: { [bulkParticipantId]: 1 } };
    }));
    setError("");
    trackProductEvent("assignment_bulk_used");
  }

  function continueFlow() {
    if (completed !== items.length) {
      setError(`Masih ada ${items.length - completed} item tanpa pemilik.`);
      return;
    }
    setError("");
    onContinue();
  }

  return (
    <section className="mx-auto max-w-[860px]">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-[650px]">
          <p className="text-sm font-extrabold tracking-[0.1em] text-brand uppercase">Bagikan item</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.045em] sm:text-4xl">
            Siapa memesan apa?
          </h1>
          <p className="mt-3 text-base leading-7 text-muted">
            Pilih satu orang atau lebih. Item bersama dibagi rata secara default, atau atur porsi 2:1 bila pesanan tidak sama.
          </p>
        </div>
        <div className="shrink-0 rounded-xl border border-line bg-surface px-4 py-3">
          <p className="text-xs font-bold text-muted">Kelengkapan</p>
          <p className="mt-1 font-extrabold text-ink">
            <span className="text-brand">{completed}</span> dari {items.length} item
          </p>
        </div>
      </div>

      <div className="mt-7 rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/8 text-brand"><Sparkles aria-hidden="true" size={19} /></span>
          <div>
            <h2 className="font-extrabold">Pembagian cepat</h2>
            <p className="mt-1 text-sm leading-6 text-muted">Gunakan aksi massal, lalu ubah item tertentu bila diperlukan.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button variant="secondary" size="small" onClick={() => setEveryItem(participants.map((participant) => participant.id))}>Bagi semua ke semua</Button>
          <Button variant="ghost" size="small" onClick={() => setEveryItem([])}><Eraser aria-hidden="true" size={16} /> Kosongkan semua</Button>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="bulk-participant">Pemilik untuk item kosong</label>
          <select id="bulk-participant" value={bulkParticipantId} onChange={(event) => setBulkParticipantId(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-sm font-bold outline-none focus:border-brand focus:ring-3 focus:ring-brand/15">
            {participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.name}</option>)}
          </select>
          <Button variant="secondary" size="small" onClick={fillUnassigned}>Isi item yang kosong</Button>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="border-b border-line px-4 py-3"><h2 className="text-sm font-extrabold">Subtotal sementara per orang</h2><p className="mt-1 text-xs text-muted">Diperbarui langsung dari item yang sudah dipilih; pajak dan biaya muncul pada hasil akhir.</p></div>
        <dl className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0">
          {participants.map((participant) => (
            <div key={participant.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:border-b sm:border-line">
              <dt className="min-w-0 truncate text-sm font-bold text-muted">{participant.name}</dt>
              <dd className="price shrink-0 font-extrabold text-brand-strong">{formatRupiah(runningTotals.get(participant.id) ?? 0)}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-8 space-y-4">
        {items.map((item, itemIndex) => {
          const owners = ownersFor(item.id);
          const allSelected = owners.length === participants.length;
          return (
            <article key={item.id} className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
              <div className="flex items-start justify-between gap-4 border-b border-dashed border-line p-4 sm:p-5">
                <div className="min-w-0">
                  <p className="text-xs font-extrabold tracking-[0.08em] text-muted uppercase">Item {itemIndex + 1}</p>
                  <h2 className="mt-1 truncate text-lg font-extrabold">{item.name}</h2>
                  <p className="mt-1 text-xs text-muted">{item.quantity} × {formatRupiah(item.unitPrice)}</p>
                </div>
                <p className="price shrink-0 text-lg font-extrabold">{formatRupiah(item.lineTotal)}</p>
              </div>

              <fieldset className="p-4 sm:p-5">
                <legend className="sr-only">Pemilik {item.name}</legend>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-extrabold text-muted">
                    {owners.length === 0 ? "Belum ada pemilik" : `${owners.length} orang dipilih`}
                  </p>
                  <button
                    type="button"
                    className="min-h-10 rounded-lg px-3 text-sm font-extrabold text-brand transition hover:bg-brand/8 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/20"
                    onClick={() => setOwners(item.id, allSelected ? [] : participants.map(({ id }) => id))}
                  >
                    {allSelected ? "Batalkan semua" : "Pilih semua"}
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {participants.map((participant) => {
                    const selected = owners.includes(participant.id);
                    const weight = weightFor(item.id, participant.id);
                    return (
                      <div
                        key={participant.id}
                        className={`overflow-hidden rounded-xl border transition focus-within:ring-3 focus-within:ring-brand/20 ${
                          selected
                            ? "border-brand bg-brand/7 text-brand-strong"
                            : "border-line bg-white text-ink hover:border-brand/50"
                        }`}
                      >
                        <label className="flex min-h-13 cursor-pointer items-center gap-3 px-3 py-2.5">
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={selected}
                            onChange={() => toggleOwner(item.id, participant.id)}
                          />
                          <span
                            className="grid size-9 shrink-0 place-items-center rounded-full text-xs font-extrabold text-ink"
                            style={{ backgroundColor: avatarColor(participant.id) }}
                            aria-hidden="true"
                          >
                            {initials(participant.name)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-extrabold">{participant.name}</span>
                          <span
                            className={`grid size-6 shrink-0 place-items-center rounded-md border ${selected ? "border-brand bg-brand text-white" : "border-line bg-white"}`}
                            aria-hidden="true"
                          >
                            {selected && <Check size={15} strokeWidth={3} />}
                          </span>
                        </label>
                        {selected && owners.length > 1 && (
                          <div className="flex items-center justify-between gap-2 border-t border-brand/15 px-3 py-2">
                            <span className="text-xs font-bold text-muted">Porsi</span>
                            <div className="flex items-center gap-1" role="group" aria-label={`Porsi ${participant.name} untuk ${item.name}`}>
                              <button
                                type="button"
                                className="grid size-9 place-items-center rounded-lg text-brand transition hover:bg-brand/10 disabled:opacity-35"
                                onClick={() => setWeight(item.id, participant.id, weight - 1)}
                                disabled={weight <= 1}
                                aria-label={`Kurangi porsi ${participant.name}`}
                              ><Minus aria-hidden="true" size={15} /></button>
                              <output className="price min-w-8 text-center text-sm font-extrabold" aria-live="polite">{weight}×</output>
                              <button
                                type="button"
                                className="grid size-9 place-items-center rounded-lg text-brand transition hover:bg-brand/10 disabled:opacity-35"
                                onClick={() => setWeight(item.id, participant.id, weight + 1)}
                                disabled={weight >= 20}
                                aria-label={`Tambah porsi ${participant.name}`}
                              ><Plus aria-hidden="true" size={15} /></button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            </article>
          );
        })}
      </div>

      {items.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-line bg-surface p-10 text-center">
          <UsersRound className="mx-auto text-brand" aria-hidden="true" size={30} />
          <p className="mt-3 font-extrabold">Belum ada item untuk dibagikan.</p>
          <Button variant="secondary" className="mt-4" onClick={onBack}>Kembali dan tambah item</Button>
        </div>
      )}

      {error && (
        <p className="mt-5 rounded-xl border border-danger/25 bg-red-50 p-4 text-sm font-bold text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/96 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-md lg:static lg:mt-8 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none">
        <div className="mx-auto flex max-w-[860px] gap-3 lg:justify-end">
          <Button variant="secondary" onClick={onBack} className="px-4" aria-label="Kembali">
            <ArrowLeft aria-hidden="true" size={18} />
            <span className="hidden sm:inline">Kembali</span>
          </Button>
          <Button onClick={continueFlow} className="min-w-0 flex-1 [flex-shrink:1] whitespace-normal px-3 lg:flex-none lg:min-w-52 lg:px-5">
            Lihat hasil
            <ArrowRight aria-hidden="true" size={18} />
          </Button>
        </div>
      </div>
    </section>
  );
}
