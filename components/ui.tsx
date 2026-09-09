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

/** A keyboard key, for shortcut hints. */
export function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-surface px-1 font-sans text-[10px]">
      {children}
    </kbd>
  );
}

/** A round toggle used for filters and view options. */
export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-7 rounded-full border px-2.5 text-[11px] font-medium transition ${
        active
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-line text-muted hover:border-line-strong hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/** A segmented-control tab. Wrap a group in a `rounded-lg bg-surface-sunken p-0.5` box. */
export function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-xs font-medium transition ${
        active ? "bg-surface text-foreground card-shadow" : "text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export type SaveState = "idle" | "saving" | "saved" | "error";

/** The app-wide save indicator. Renders nothing while idle. */
export function SaveBadge({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const map = {
    saving: { text: "Saving…", color: "text-muted", dot: "bg-muted" },
    saved: { text: "Saved", color: "text-muted", dot: "bg-success" },
    error: { text: "Save failed", color: "text-danger", dot: "bg-danger" },
  } as const;
  const s = map[state];
  return (
    <span className={`mr-1 inline-flex items-center gap-1.5 text-[11px] ${s.color}`} role="status">
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.text}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className = "",
}: {
  icon?: React.ReactNode;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong px-6 py-14 text-center ${className}`}
    >
      {icon ? <span className="text-muted">{icon}</span> : null}
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {body ? <p className="max-w-sm text-[13px] text-muted">{body}</p> : null}
      {action}
    </div>
  );
}

export const inputClass =
  "h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-foreground outline-none transition placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20";
