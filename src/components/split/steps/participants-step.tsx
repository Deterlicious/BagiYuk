"use client";

import { ArrowLeft, ArrowRight, Plus, Trash2, UserRoundPlus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ItemAssignment, Participant } from "@/domain/billing/types";
import { avatarColor, createId, initials } from "@/lib/utils";

export function ParticipantsStep({
  participants,
  assignments,
  onChange,
  onAssignmentsChange,
  onBack,
  onContinue,
}: {
  participants: Participant[];
  assignments: ItemAssignment[];
  onChange: (participants: Participant[]) => void;
  onAssignmentsChange: (assignments: ItemAssignment[]) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  function normalized(value: string) {
    return value.trim().toLocaleLowerCase("id-ID");
  }

  function addParticipant(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Tulis nama anggota terlebih dahulu.");
      return;
    }
    if (participants.some((participant) => normalized(participant.name) === normalized(trimmedName))) {
      setError("Nama itu sudah ada. Gunakan nama yang berbeda.");
      return;
    }
    onChange([...participants, { id: createId("person"), name: trimmedName }]);
    setName("");
    setError("");
  }

  function renameParticipant(id: string, nextName: string) {
    setError("");
    onChange(
      participants.map((participant) =>
        participant.id === id ? { ...participant, name: nextName } : participant,
      ),
    );
  }

  function removeParticipant(participant: Participant) {
    const isAssigned = assignments.some((assignment) =>
      assignment.participantIds.includes(participant.id),
    );
    if (isAssigned) {
      setError(`${participant.name} masih memiliki pesanan. Hapus pembagiannya dahulu di langkah Bagikan.`);
      return;
    }
    onChange(participants.filter((entry) => entry.id !== participant.id));
    onAssignmentsChange(
      assignments.map((assignment) => ({
        ...assignment,
        participantIds: assignment.participantIds.filter((id) => id !== participant.id),
      })),
    );
    setError("");
  }

  function continueFlow() {
    if (participants.length < 2) {
      setError("Tambahkan setidaknya dua anggota untuk membagi tagihan.");
      return;
    }
    if (participants.some((participant) => !participant.name.trim())) {
      setError("Nama anggota tidak boleh kosong.");
      return;
    }
    const names = participants.map((participant) => normalized(participant.name));
    if (new Set(names).size !== names.length) {
      setError("Setiap anggota perlu nama yang berbeda.");
      return;
    }
    setError("");
    onContinue();
  }

  return (
    <section className="mx-auto max-w-[760px]">
      <p className="text-sm font-extrabold tracking-[0.1em] text-brand uppercase">Tambah anggota</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.045em] sm:text-4xl">
        Siapa saja yang ikut makan?
      </h1>
      <p className="mt-3 text-base leading-7 text-muted">
        Tambahkan minimal dua orang. Nama hanya dipakai untuk hasil pembagian di perangkat ini.
      </p>

      <form onSubmit={addParticipant} className="mt-8 rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-6">
        <label htmlFor="new-participant" className="text-sm font-extrabold text-ink">
          Nama anggota
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="new-participant"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-base font-bold text-ink outline-none transition focus:border-brand focus:ring-3 focus:ring-brand/15"
            placeholder="Contoh: Ayu"
            autoComplete="off"
            maxLength={40}
          />
          <Button type="submit" className="px-4 sm:px-5" aria-label="Tambahkan">
            <Plus aria-hidden="true" size={19} />
            <span className="hidden sm:inline">Tambahkan</span>
          </Button>
        </div>
      </form>

      <div className="mt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-extrabold">Daftar anggota</h2>
          <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-extrabold text-muted">
            {participants.length} orang
          </span>
        </div>

        {participants.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface/70 px-5 py-10 text-center">
            <UserRoundPlus className="mx-auto text-brand" aria-hidden="true" size={30} />
            <p className="mt-3 font-extrabold">Belum ada anggota</p>
            <p className="mt-1 text-sm text-muted">Nama yang ditambahkan akan muncul di sini.</p>
          </div>
        ) : (
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {participants.map((participant, index) => (
              <div key={participant.id} className="grid grid-cols-[48px_minmax(0,1fr)_48px] items-center gap-3 p-3 sm:p-4">
                <span
                  className="grid size-11 place-items-center rounded-full text-sm font-extrabold text-ink"
                  style={{ backgroundColor: avatarColor(participant.id) }}
                  aria-hidden="true"
                >
                  {initials(participant.name)}
                </span>
                <div>
                  <label htmlFor={`participant-${participant.id}`} className="sr-only">
                    Nama anggota {index + 1}
                  </label>
                  <input
                    id={`participant-${participant.id}`}
                    value={participant.name}
                    onChange={(event) => renameParticipant(participant.id, event.target.value)}
                    className="min-h-11 w-full rounded-lg border border-transparent bg-transparent px-2 text-base font-extrabold text-ink outline-none transition hover:border-line hover:bg-white focus:border-brand focus:bg-white focus:ring-3 focus:ring-brand/15"
                    maxLength={40}
                  />
                </div>
                <button
                  type="button"
                  className="grid size-11 place-items-center rounded-xl text-muted transition hover:bg-red-50 hover:text-danger focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-danger/20"
                  aria-label={`Hapus ${participant.name || `anggota ${index + 1}`}`}
                  onClick={() => removeParticipant(participant)}
                >
                  <Trash2 aria-hidden="true" size={19} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-5 rounded-xl border border-danger/25 bg-red-50 p-4 text-sm leading-6 font-bold text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/96 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-md lg:static lg:mt-8 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none">
        <div className="mx-auto flex max-w-[760px] gap-3 lg:justify-end">
          <Button variant="secondary" onClick={onBack} className="px-4" aria-label="Kembali">
            <ArrowLeft aria-hidden="true" size={18} />
            <span className="hidden sm:inline">Kembali</span>
          </Button>
          <Button onClick={continueFlow} className="min-w-0 flex-1 [flex-shrink:1] whitespace-normal px-3 lg:flex-none lg:min-w-52 lg:px-5">
            Pilih pesanan
            <ArrowRight aria-hidden="true" size={18} />
          </Button>
        </div>
      </div>
    </section>
  );
}
