"use client";

import { clsx } from "clsx";
import type { ReactNode } from "react";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return clsx(parts);
}

// ---------------------------------------------------------------------------
// Section — a titled card that groups related fields.
// ---------------------------------------------------------------------------
export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-line bg-paper shadow-sm",
        className
      )}
    >
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-3">
          <div>
            {title && (
              <h2 className="font-serif text-lg font-semibold text-deep">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 text-sm text-ink/60">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="space-y-4 px-5 py-4">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Field — label + optional hint wrapping a control.
// ---------------------------------------------------------------------------
export function Field({
  label,
  hint,
  required,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      {label && (
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink/70">
          {label}
          {required && <span className="text-gold"> *</span>}
        </span>
      )}
      {children}
      {hint && <span className="mt-1 block text-xs text-ink/50">{hint}</span>}
    </label>
  );
}

const controlClass =
  "rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink shadow-sm outline-none transition focus:border-deep focus:ring-2 focus:ring-deep/15 placeholder:text-ink/35";

// ---------------------------------------------------------------------------
// Text inputs
// ---------------------------------------------------------------------------
export function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  className,
  onBlur,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "url" | "date";
  className?: string;
  onBlur?: () => void;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className={cn(controlClass, className)}
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(controlClass, "leading-relaxed", className)}
    />
  );
}

export function NumberInput({
  value,
  onChange,
  placeholder,
  min,
  max,
  className,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  className?: string;
}) {
  return (
    <input
      type="number"
      value={value ?? ""}
      placeholder={placeholder}
      min={min}
      max={max}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") return onChange(undefined);
        const n = Number(raw);
        if (!Number.isFinite(n)) return onChange(undefined);
        const lo = min ?? -Infinity;
        const hi = max ?? Infinity;
        onChange(Math.min(hi, Math.max(lo, n)));
      }}
      className={cn(controlClass, className)}
    />
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-deep text-white hover:bg-deep-700 border-transparent",
  secondary: "bg-white text-deep hover:bg-cream border-line",
  ghost: "bg-transparent text-ink/70 hover:bg-cream border-transparent",
  danger: "bg-white text-red-700 hover:bg-red-50 border-red-200",
};

export function Button({
  children,
  onClick,
  variant = "secondary",
  type = "button",
  disabled,
  title,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  type?: "button" | "submit";
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50",
        buttonVariants[variant],
        className
      )}
    >
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  onClick,
  label,
  variant = "ghost",
  disabled,
}: {
  icon: ReactNode;
  onClick?: () => void;
  label: string;
  variant?: ButtonVariant;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg border shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40",
        buttonVariants[variant]
      )}
    >
      {icon}
    </button>
  );
}

// ---------------------------------------------------------------------------
// StringListEditor — add/remove/reorder a list of strings (single or multiline).
// Used for highlights, route cities and flight legs.
// ---------------------------------------------------------------------------
export function StringListEditor({
  items,
  onChange,
  placeholder,
  addLabel = "Add",
  multiline = false,
  prefix,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  multiline?: boolean;
  /** Optional per-row prefix, e.g. (i) => `(${String.fromCharCode(65 + i)})`. */
  prefix?: (index: number) => ReactNode;
}) {
  const setAt = (i: number, v: string) =>
    onChange(items.map((it, idx) => (idx === i ? v : it)));
  const removeAt = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          {prefix && (
            <span className="mt-2 w-6 shrink-0 text-xs font-semibold text-gold">
              {prefix(i)}
            </span>
          )}
          {multiline ? (
            <TextArea value={item} onChange={(v) => setAt(i, v)} placeholder={placeholder} rows={2} />
          ) : (
            <TextInput value={item} onChange={(v) => setAt(i, v)} placeholder={placeholder} />
          )}
          <div className="flex shrink-0 flex-col gap-1">
            <IconButton icon={<span aria-hidden>↑</span>} label="Move up" onClick={() => move(i, -1)} disabled={i === 0} />
            <IconButton icon={<span aria-hidden>↓</span>} label="Move down" onClick={() => move(i, 1)} disabled={i === items.length - 1} />
          </div>
          <IconButton icon={<span aria-hidden>✕</span>} label="Remove" variant="danger" onClick={() => removeAt(i)} />
        </div>
      ))}
      <Button variant="secondary" onClick={() => onChange([...items, ""])}>
        + {addLabel}
      </Button>
    </div>
  );
}
