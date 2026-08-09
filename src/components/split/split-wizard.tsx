"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, CircleHelp } from "lucide-react";
import { useEffect, useReducer, useState } from "react";
import { BrandMark } from "@/components/brand/brand-mark";
import { ResetDialog } from "@/components/ui/reset-dialog";
import type { ItemAssignment, Participant } from "@/domain/billing/types";
import type { EditableReceipt } from "@/domain/receipt/types";
import { trackProductEvent } from "@/lib/analytics";
import {
  createEmptyDraft,
  createEmptyReceipt,
  createSampleDraft,
  DRAFT_STORAGE_KEY,
  draftReducer,
  draftStateSchema,
  type WizardStep,
} from "@/features/splitter/draft";
import { AssignmentStep } from "./steps/assignment-step";
import { ParticipantsStep } from "./steps/participants-step";
import { ResultsStep } from "./steps/results-step";
import { VerificationStep } from "./steps/verification-step";

const stepLabels = ["Struk", "Periksa", "Anggota", "Bagikan", "Hasil"] as const;
const ReceiptInputStep = dynamic(
  () => import("./steps/receipt-input-step").then((module) => module.ReceiptInputStep),
  {
    ssr: false,
    loading: () => (
      <section className="py-12 text-center" aria-live="polite">
        <p className="text-sm font-bold text-muted">Menyiapkan pembaca struk…</p>
      </section>
    ),
  },
);

export function SplitWizard({
  initialSample,
  startFresh,
}: {
  initialSample: boolean;
  startFresh: boolean;
}) {
  const [state, dispatch] = useReducer(draftReducer, undefined, createEmptyDraft);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (initialSample) {
      trackProductEvent("wizard_sample_started");
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      dispatch({ type: "hydrate", draft: createSampleDraft() });
      window.history.replaceState({}, "", "/split/new");
      queueMicrotask(() => setHydrated(true));
      return;
    }

    if (startFresh) {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      dispatch({ type: "reset" });
      window.history.replaceState({}, "", "/split/new");
      queueMicrotask(() => setHydrated(true));
      return;
    }

    const stored = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = draftStateSchema.safeParse(JSON.parse(stored));
        if (parsed.success) dispatch({ type: "hydrate", draft: parsed.data });
      } catch {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      }
    }
    queueMicrotask(() => setHydrated(true));
  }, [initialSample, startFresh]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  function setStep(step: WizardStep) {
    dispatch({ type: "set-step", step });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setReceipt(receipt: EditableReceipt) {
    dispatch({ type: "set-receipt", receipt });
  }

  function setParticipants(participants: Participant[]) {
    dispatch({ type: "set-participants", participants });
  }

  function setAssignments(assignments: ItemAssignment[]) {
    dispatch({ type: "set-assignments", assignments });
  }

  function reset() {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    dispatch({ type: "reset" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startManual() {
    trackProductEvent("wizard_manual_started");
    const receipt = createEmptyReceipt();
    receipt.items = [
      {
        id: `item-${Date.now()}`,
        name: "",
        quantity: 1,
        unitPrice: 0,
        lineTotal: 0,
        confidence: { name: 1, quantity: 1, unitPrice: 1, lineTotal: 1 },
      },
    ];
    setReceipt(receipt);
    setStep(2);
  }

  if (!hydrated) {
    return (
      <main className="grid min-h-screen place-items-center px-5" aria-live="polite">
        <div className="text-center">
          <BrandMark />
          <p className="mt-4 text-sm font-bold text-muted">Menyiapkan pembagian…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-28 lg:pb-14">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1120px] items-center gap-3 px-4 py-3 sm:px-7 lg:px-10">
          <Link
            href="/"
            className="grid size-11 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-black/5 hover:text-ink focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/25"
            aria-label="Kembali ke beranda"
          >
            <ChevronLeft aria-hidden="true" size={22} />
          </Link>
          <span className="hidden sm:inline-flex">
            <BrandMark compact />
          </span>
          <div className="min-w-0 flex-1 sm:ml-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-extrabold tracking-[0.08em] text-brand uppercase">
                Langkah {state.step} dari 5
              </p>
              <p className="hidden truncate text-sm font-extrabold sm:block">{stepLabels[state.step - 1]}</p>
            </div>
            <div className="mt-2 grid grid-cols-5 gap-1" aria-label={`Langkah ${state.step} dari 5`}>
              {stepLabels.map((label, index) => (
                <span
                  key={label}
                  className={`h-1.5 rounded-full transition-colors ${index < state.step ? "bg-brand" : "bg-line"}`}
                />
              ))}
            </div>
          </div>
          <Link
            href="/bantuan"
            className="hidden min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-muted transition hover:bg-black/5 hover:text-ink sm:inline-flex"
          >
            <CircleHelp aria-hidden="true" size={18} /> Bantuan
          </Link>
          <ResetDialog onConfirm={reset} />
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1120px] px-4 pt-6 sm:px-7 sm:pt-9 lg:px-10">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={state.step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {state.step === 1 && (
              <ReceiptInputStep
                onManual={startManual}
                onSample={() => {
                  trackProductEvent("wizard_sample_started");
                  dispatch({ type: "hydrate", draft: createSampleDraft() });
                }}
                onParsed={(receipt) => {
                  setReceipt(receipt);
                  setStep(2);
                }}
              />
            )}
            {state.step === 2 && (
              <VerificationStep
                receipt={state.receipt}
                onChange={setReceipt}
                onBack={() => setStep(1)}
                onContinue={() => setStep(3)}
              />
            )}
            {state.step === 3 && (
              <ParticipantsStep
                participants={state.participants}
                assignments={state.assignments}
                onChange={setParticipants}
                onAssignmentsChange={setAssignments}
                onBack={() => setStep(2)}
                onContinue={() => setStep(4)}
              />
            )}
            {state.step === 4 && (
              <AssignmentStep
                items={state.receipt.items}
                participants={state.participants}
                assignments={state.assignments}
                onChange={setAssignments}
                onBack={() => setStep(3)}
                onContinue={() => setStep(5)}
              />
            )}
            {state.step === 5 && (
              <ResultsStep
                receipt={state.receipt}
                participants={state.participants}
                assignments={state.assignments}
                onBack={() => setStep(4)}
                onEditReceipt={() => setStep(2)}
                onReset={reset}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );
}
