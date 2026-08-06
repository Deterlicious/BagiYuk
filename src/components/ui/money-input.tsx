import type { InputHTMLAttributes } from "react";
import { formatInteger, parseIntegerInput } from "@/lib/currency";
import { cn } from "@/lib/utils";

export function MoneyInput({
  value,
  onValueChange,
  allowNegative = false,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number;
  onValueChange: (value: number) => void;
  allowNegative?: boolean;
}) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-bold text-muted">
        Rp
      </span>
      <input
        {...props}
        className="min-h-12 min-w-0 w-full rounded-xl border border-line bg-white py-2.5 pr-3 pl-10 text-right text-base font-bold tabular-nums text-ink outline-none transition focus:border-brand focus:ring-3 focus:ring-brand/15"
        inputMode="numeric"
        type="text"
        value={value === 0 ? "0" : formatInteger(value)}
        onChange={(event) => onValueChange(parseIntegerInput(event.target.value, allowNegative))}
        onFocus={(event) => event.currentTarget.select()}
      />
    </div>
  );
}
