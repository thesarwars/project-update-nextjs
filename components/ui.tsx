"use client";

import { forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-contrast hover:brightness-110 active:brightness-95 disabled:hover:brightness-100",
  secondary:
    "bg-surface text-foreground border border-line hover:border-line-strong hover:bg-surface-sunken",
  ghost: "text-muted hover:text-foreground hover:bg-surface-sunken",
  danger: "text-danger hover:bg-danger/10",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2 text-xs gap-1 rounded-md",
  md: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  lg: "h-10 px-4 text-sm gap-2 rounded-lg",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className = "", type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex select-none items-center justify-center font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    />
  );
});

interface IconButtonProps extends ButtonProps {
  label: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, className = "", size = "md", ...rest },
  ref,
) {
  const box = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-10 w-10" : "h-8 w-8";
  return (
    <Button
      ref={ref}
      size={size}
      aria-label={label}
      title={label}
      className={`!px-0 ${box} ${className}`}
      {...rest}
    />
  );
});

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-foreground outline-none transition placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20";
