"use client";

import { useActionState } from "react";
import {
  markAppointmentPaid,
  type AppointmentPaymentState,
} from "@/lib/actions/appointmentPayment";
import type { PaymentPill } from "@/lib/payments";

const methods = [
  { value: "cash", label: "Cash" },
  { value: "interac", label: "Interac" },
  { value: "other", label: "Other" },
] as const;

function pillTone(payment: PaymentPill | null): string {
  if (payment?.status === "paid") return "bg-ok-soft text-ok";
  if (payment?.status === "waiting") return "bg-warn-soft text-warn";
  return "bg-canvas text-ink-soft";
}

export function AppointmentPaymentControls({
  clientId,
  appointmentId,
  payment,
  groupPayment,
  groupLabel,
  disabled,
}: {
  clientId: string;
  appointmentId: string;
  payment: PaymentPill | null;
  groupPayment?: PaymentPill | null;
  groupLabel?: string;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    AppointmentPaymentState,
    FormData
  >(markAppointmentPaid, { status: "idle" });
  const effectivePayment = groupPayment ?? payment;
  const isPaid = effectivePayment?.status === "paid";
  const isGroup = Boolean(groupLabel);

  return (
    <form action={formAction} className="rounded-xl border border-line bg-surface px-3.5 py-3">
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="appointment_id" value={appointmentId} />
      <input
        type="hidden"
        name="payment_scope_group"
        value={isGroup ? "on" : ""}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">Payment</p>
        {effectivePayment ? (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-bold ${pillTone(
              effectivePayment,
            )}`}
          >
            {effectivePayment.label}
          </span>
        ) : null}
      </div>
      {isPaid ? (
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          {groupLabel ? `${groupLabel} are marked paid.` : "This visit is marked paid."}
        </p>
      ) : (
        <>
          <p className="mt-2 text-xs leading-relaxed text-ink-soft">
            {groupLabel
              ? `Mark payment for ${groupLabel}.`
              : "Mark this visit paid."}
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {methods.map((method) => (
              <button
                key={method.value}
                type="submit"
                name="payment_method"
                value={method.value}
                disabled={disabled || pending}
                className="min-h-11 rounded-xl border border-line bg-surface px-2 text-sm font-semibold text-ink-soft active:bg-brand-soft disabled:opacity-55"
              >
                {method.label}
              </button>
            ))}
          </div>
        </>
      )}
      {state.status === "error" ? (
        <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {state.message}
        </p>
      ) : null}
      {state.status === "demo" || state.status === "gated" || state.status === "saved" ? (
        <p className="mt-2 rounded-lg bg-brand-soft px-3 py-2 text-sm font-medium text-brand-ink">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
