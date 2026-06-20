import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "success" | "danger";
type Size = "md" | "sm";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-navy text-white hover:opacity-90",
  secondary:
    "border border-slate-200 bg-white text-brand-navy hover:border-brand hover:bg-brand/5",
  ghost: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  success: "bg-emerald-600 text-white hover:opacity-90",
  danger: "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
};

// Two uniform tiers: md = standalone actions (headers, footers, CTAs);
// sm = dense inline-row actions. Every button in the portal uses one of these,
// so sizing never drifts.
const SIZES: Record<Size, string> = {
  md: "h-8 px-3 text-[13px] gap-1.5",
  sm: "h-7 px-2.5 text-xs gap-1",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export default function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
