import { ReceiptText } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-extrabold tracking-[-0.03em] text-ink", className)}>
      <span className="relative grid size-10 place-items-center rounded-xl border border-brand-strong bg-brand text-white shadow-[0_2px_0_var(--brand-strong)]">
        <ReceiptText aria-hidden="true" size={21} strokeWidth={2.3} />
        <span className="absolute -right-1 -bottom-1 size-3 rounded-full border-2 border-canvas bg-accent" />
      </span>
      {!compact && <span className="text-xl">BagiYuk</span>}
    </span>
  );
}
