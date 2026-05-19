export const PAYMENT_METHODS = ["cash", "interac", "other"] as const;
export const PAYMENT_STATUSES = ["paid", "waiting"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type PaymentInfo = {
  method: PaymentMethod | null;
  status: PaymentStatus | null;
};

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
