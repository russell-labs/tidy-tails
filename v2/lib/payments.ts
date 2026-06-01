export const PAYMENT_METHODS = ["cash", "interac", "other"] as const;
export const PAYMENT_STATUSES = ["paid", "waiting"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type PaymentInfo = {
  method: PaymentMethod | null;
  status: PaymentStatus | null;
};

export type PaymentPill = {
  status: "paid" | "waiting" | "partial";
  label: string;
};

export type PaymentSummary = {
  fee: number;
  paid: number | null;
  tip: number | null;
  isPaid: boolean;
};

export type PaidAllocationResult =
  | {
      ok: true;
      updates: Array<{ id: string; tip: number; net: number }>;
    }
  | { ok: false; message: string };

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  interac: "Interac",
  other: "Other",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  paid: "Paid",
  waiting: "Waiting on payment",
};

const PAYMENT_MARKER = /\s*\[payment:(cash|interac|other); payment_status:(paid|waiting)\]\s*/i;
const LEGACY_PAYMENT = /\bpayment\s*:\s*(cash|debit|interac|e-?transfer|etransfer|other)\b/i;

export function isPaymentMethod(value: string | null | undefined): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value ?? "");
}

export function isPaymentStatus(value: string | null | undefined): value is PaymentStatus {
  return (PAYMENT_STATUSES as readonly string[]).includes(value ?? "");
}

export function normalizePaymentMethod(value: string | null | undefined): PaymentMethod | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (raw === "debit" || raw === "e-transfer" || raw === "etransfer") return "interac";
  return isPaymentMethod(raw) ? raw : null;
}

export function parsePaymentInfo(notes: string | null | undefined): PaymentInfo {
  const value = notes ?? "";
  const marker = value.match(PAYMENT_MARKER);
  if (marker) {
    return {
      method: marker[1].toLowerCase() as PaymentMethod,
      status: marker[2].toLowerCase() as PaymentStatus,
    };
  }

  const legacy = value.match(LEGACY_PAYMENT);
  const method = normalizePaymentMethod(legacy?.[1]);
  return {
    method,
    status: method ? "paid" : null,
  };
}

export function stripPaymentInfo(notes: string | null | undefined): string | null {
  const stripped = (notes ?? "").replace(PAYMENT_MARKER, " ").replace(/\s+/g, " ").trim();
  return stripped === "" ? null : stripped;
}

export function withPaymentInfo(
  notes: string | null | undefined,
  payment: PaymentInfo,
): string | null {
  const cleanNotes = stripPaymentInfo(notes);
  if (!payment.status) return cleanNotes;
  const method = payment.method ?? "other";
  const marker = `[payment:${method}; payment_status:${payment.status}]`;
  return cleanNotes ? `${cleanNotes} ${marker}` : marker;
}

export function paymentLabel(payment: PaymentInfo): string {
  if (!payment.status) return "Not recorded";
  if (payment.status === "waiting") return PAYMENT_STATUS_LABELS.waiting;
  return payment.method
    ? `${PAYMENT_STATUS_LABELS.paid} - ${PAYMENT_METHOD_LABELS[payment.method]}`
    : PAYMENT_STATUS_LABELS.paid;
}

export function paymentMethodLabel(method: PaymentMethod | null): string {
  return method ? PAYMENT_METHOD_LABELS[method] : "Not recorded";
}

export function paymentPillForAppointments(
  appointments: Array<{ notes: string | null | undefined }>,
): PaymentPill | null {
  if (appointments.length === 0) return null;
  const statuses = appointments.map(
    (appointment) => parsePaymentInfo(appointment.notes).status,
  );
  if (statuses.includes("waiting")) {
    return { status: "waiting", label: "Waiting payment" };
  }
  if (statuses.every((status) => status === "paid")) {
    return { status: "paid", label: "Paid" };
  }
  if (statuses.some((status) => status === "paid")) {
    return { status: "partial", label: "Partial payment" };
  }
  return null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function paymentSummaryForAppointments(
  appointments: Array<{
    price: number | null | undefined;
    tip: number | null | undefined;
    notes: string | null | undefined;
  }>,
): PaymentSummary {
  const fee = roundMoney(
    appointments.reduce((sum, appointment) => sum + (appointment.price ?? 0), 0),
  );
  const isPaid =
    appointments.length > 0 &&
    appointments.every(
      (appointment) => parsePaymentInfo(appointment.notes).status === "paid",
    );
  if (!isPaid) {
    return {
      fee,
      paid: null,
      tip: null,
      isPaid: false,
    };
  }
  const tip = roundMoney(
    appointments.reduce((sum, appointment) => sum + (appointment.tip ?? 0), 0),
  );
  return {
    fee,
    paid: roundMoney(fee + tip),
    tip,
    isPaid: true,
  };
}

export function allocatePaidTotalAcrossAppointments(
  appointments: Array<{ id: string; price: number | null | undefined }>,
  paidTotal: number,
): PaidAllocationResult {
  if (!Number.isFinite(paidTotal) || paidTotal < 0) {
    return { ok: false, message: "Paid amount must be a valid number." };
  }
  const fee = roundMoney(
    appointments.reduce((sum, appointment) => sum + (appointment.price ?? 0), 0),
  );
  const paid = roundMoney(paidTotal);
  if (paid < fee) {
    return {
      ok: false,
      message: "Paid amount cannot be less than the groom fee.",
    };
  }
  const tip = roundMoney(paid - fee);
  return {
    ok: true,
    updates: appointments.map((appointment, index) => {
      const rowTip = index === 0 ? tip : 0;
      return {
        id: appointment.id,
        tip: rowTip,
        net: roundMoney((appointment.price ?? 0) + rowTip),
      };
    }),
  };
}
