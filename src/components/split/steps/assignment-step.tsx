"use client";

import { ArrowLeft, ArrowRight, Check, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ItemAssignment, Participant } from "@/domain/billing/types";
import type { EditableReceiptItem } from "@/domain/receipt/types";
import { formatRupiah } from "@/lib/currency";
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
  const completed = useMemo(
    () => items.filter((item) => (assignments.find((entry) => entry.itemId === item.id)?.participantIds.length ?? 0) > 0).length,
    [assignments, items],
  );

  function ownersFor(itemId: string) {
    return assignments.find((assignment) => assignment.itemId === itemId)?.participantIds ?? [];
  }

  function setOwners(itemId: string, participantIds: string[]) {
    const existing = assignments.find((assignment) => assignment.itemId === itemId);
    const next = existing
      ? assignments.map((assignment) =>
          assignment.itemId === itemId
            ? { itemId, participantIds }
            : assignment,
        )
      : [...assignments, { itemId, participantIds }];
    onChange(next);
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
            Pilih satu orang atau lebih. Item bersama dibagi rata sampai ke rupiah terakhir.
          </p>
        </div>
        <div className="shrink-0 rounded-xl border border-line bg-surface px-4 py-3">
          <p className="text-xs font-bold text-muted">Kelengkapan</p>
          <p className="mt-1 font-extrabold text-ink">
            <span className="text-brand">{completed}</span> dari {items.length} item
          </p>
        </div>
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
                    return (
                      <label
                        key={participant.id}
                        className={`flex min-h-13 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition focus-within:ring-3 focus-within:ring-brand/20 ${
                          selected
                            ? "border-brand bg-brand/7 text-brand-strong"
                            : "border-line bg-white text-ink hover:border-brand/50"
                        }`}
                      >
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
