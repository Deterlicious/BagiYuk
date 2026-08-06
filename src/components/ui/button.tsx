import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "default" | "small" | "icon";

export function buttonStyles({
  variant = "primary",
  size = "default",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-bold transition-[background-color,color,border-color,transform,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/25 disabled:pointer-events-none disabled:opacity-45 active:translate-y-px",
    size === "default" && "min-h-12 px-5 py-3 text-[0.95rem]",
    size === "small" && "min-h-10 px-3 py-2 text-sm",
    size === "icon" && "size-12 p-0",
    variant === "primary" &&
      "border border-brand-strong bg-brand text-white shadow-[0_2px_0_var(--brand-strong)] hover:bg-brand-strong",
    variant === "secondary" &&
      "border border-line bg-surface-strong text-ink shadow-[0_1px_0_rgba(24,34,29,0.05)] hover:border-brand hover:text-brand-strong",
    variant === "ghost" && "border border-transparent bg-transparent text-muted hover:bg-black/5 hover:text-ink",
    variant === "danger" && "border border-danger/25 bg-white text-danger hover:bg-red-50",
    className,
  );
}

export function Button({
  className,
  variant = "primary",
  size = "default",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      className={buttonStyles({ variant, size, className })}
      type={type}
      {...props}
    />
  );
}
