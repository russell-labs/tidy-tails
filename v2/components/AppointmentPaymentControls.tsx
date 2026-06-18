"use client";

import { useActionState } from "react";
import {
  markAppointmentPaid,
  type AppointmentPaymentState,
} from "@/lib/actions/appointmentPayment";
import { formatMoney } from "@/lib/format";
import type { PaymentPill, PaymentSummary } from "@/lib/payments";

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
  paymentSummary,
  groupPaymentSummary,
  groupLabel,
  disabled,
}: {
  clientId: string;
  appointmentId: string;
  payment: PaymentPill | null;
  groupPayment?: PaymentPill | null;
  paymentSummary: PaymentSummary;
  groupPaymentSummary?: PaymentSummary | null;
  groupLabel?: string;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    AppointmentPaymentState,
    FormData
  >(markAppointmentPaid, { status: "idle" });
  const effectivePayment = groupPayment ?? payment;
  const effectiveSummary = groupPaymentSummary ?? paymentSummary;
  const isPaid = effectivePayment?.status === "paid";
  const isGroup = Boolean(groupLabel);
  const defaultPaidAmount = effectiveSummary.paid ?? effectiveSummary.fee;

  return (
    <form action={formAction} className="rounded-xl border border-line bg-surface px-3.5 py-3 shadow-soft">
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
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg bg-canvas px-2.5 py-2">
          <p className="font-medium text-ink-faint">Groom</p>
          <p className="mt-0.5 font-bold text-ink">
            {formatMoney(effectiveSummary.fee)}
          </p>
        </div>
        <div className="rounded-lg bg-canvas px-2.5 py-2">
          <p className="font-medium text-ink-faint">Paid</p>
          <p className="mt-0.5 font-bold text-ink">
            {effectiveSummary.paid == null
              ? "Not set"
              : formatMoney(effectiveSummary.paid)}
          </p>
        </div>
        <div className="rounded-lg bg-canvas px-2.5 py-2">
          <p className="font-medium text-ink-faint">Tip</p>
          <p className="mt-0.5 font-bold text-ink">
            {effectiveSummary.tip == null
              ? "Not set"
              : formatMoney(effectiveSummary.tip)}
          </p>
        </div>
      </div>
      <label className="mt-3 flex flex-col gap-1.5">
        <span className="tt-eyebrow">
          Amount paid
        </span>
        <input
          name="paid_amount"
          type="number"
          inputMode="decimal"
          min={effectiveSummary.fee}
          step="0.01"
          defaultValue={defaultPaidAmount.toFixed(2)}
          disabled={disabled || pending}
          className="min-h-11 rounded-xl border border-line bg-surface px-3 text-base font-semibold text-ink disabled:opacity-55"
        />
      </label>
      <p className="mt-2 text-xs leading-relaxed text-ink-soft">
        {groupLabel
          ? `${isPaid ? "Update" : "Mark"} payment for ${groupLabel}. Tip is paid amount minus groom total.`
          : `${isPaid ? "Update" : "Mark"} this visit paid. Tip is paid amount minus groom fee.`}
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
