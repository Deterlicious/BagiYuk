"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { RotateCcw } from "lucide-react";
import { buttonStyles } from "./button";

export function ResetDialog({ onConfirm }: { onConfirm: () => void }) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger
        className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-bold text-muted transition hover:bg-black/5 hover:text-danger focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/25"
      >
        <RotateCcw aria-hidden="true" size={16} />
        Mulai ulang
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-ink/45 backdrop-blur-[2px] transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <AlertDialog.Viewport className="fixed inset-0 z-50 grid place-items-center px-5 py-10">
          <AlertDialog.Popup className="w-full max-w-[420px] rounded-2xl border border-line bg-surface p-6 shadow-[0_24px_70px_rgba(24,34,29,0.25)] transition-[opacity,transform] duration-200 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <AlertDialog.Title className="text-xl font-extrabold tracking-[-0.03em]">
              Mulai pembagian baru?
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm leading-6 text-muted">
              Item, anggota, dan pembagian yang tersimpan di perangkat ini akan dihapus.
            </AlertDialog.Description>
            <div className="mt-6 flex justify-end gap-3">
              <AlertDialog.Close className={buttonStyles({ variant: "secondary", size: "small" })}>
                Batal
              </AlertDialog.Close>
              <AlertDialog.Close
                className={buttonStyles({ variant: "danger", size: "small" })}
                onClick={onConfirm}
              >
                Ya, mulai ulang
              </AlertDialog.Close>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
