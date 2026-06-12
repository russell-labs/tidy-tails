"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ReactNode,
} from "react";

// Shared form primitives. These markup pieces and the label style constant were
// redefined identically in seven form components; centralizing them keeps one
// source of truth before the multi-persona expansion adds variants.
//
// Note: `fieldClass` is intentionally NOT centralized here. Unlike `labelClass`,
// the field/input class string genuinely differs across forms (e.g. some add
// `min-w-0 max-w-full`, the household form uses different padding, one drops the
// placeholder color), so a single constant would change rendered output. Each
// form keeps its own `fieldClass`.

export const labelClass = "text-sm font-medium text-ink-soft";

// `hint` is optional: callers that omit it render exactly as the no-hint copies
// did (the `{hint ? … : null}` slot produces no DOM node), so this single
// component is byte-identical to both prior variants.
export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  // M4: hint and error text are programmatically associated with the control
  // via aria-describedby (and aria-invalid on error). When the child is a
  // single element (the common case: an input/select/textarea), it is cloned
  // with the association; any other shape renders exactly as before.
  const baseId = useId();
  const hintId = hint ? `${baseId}-hint` : undefined;
  const errorId = error ? `${baseId}-error` : undefined;
  const describedBy =
    [hintId, errorId].filter(Boolean).join(" ") || undefined;

  let control = children;
  if (describedBy && Children.count(children) === 1 && isValidElement(children)) {
    const props = children.props as {
      "aria-describedby"?: string;
      "aria-invalid"?: boolean;
    };
    const merged = [props["aria-describedby"], describedBy]
      .filter(Boolean)
      .join(" ");
    control = cloneElement(children, {
      "aria-describedby": merged,
      "aria-invalid": error ? true : props["aria-invalid"],
    } as Partial<unknown>);
  }

  return (
    <label className="flex flex-col gap-1.5">
      <span className={labelClass}>{label}</span>
      {control}
      {hint ? (
        <span id={hintId} className="text-xs text-ink-faint">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className="text-xs text-danger-ink">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

export function ChoiceButton({
  active,
  disabled = false,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-11 rounded-lg border px-2 py-2 text-sm font-semibold ${
        active
          ? "border-brand bg-brand text-white"
          : "border-line bg-surface text-ink-soft active:bg-brand-soft"
      } disabled:bg-canvas disabled:text-ink-faint`}
    >
      {children}
    </button>
  );
}
