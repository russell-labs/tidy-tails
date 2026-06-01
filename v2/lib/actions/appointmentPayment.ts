"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit.server";
import { dataMode, getClientRecord } from "@/lib/data/repo";
import type { Appointment } from "@/lib/data/types";
import { fullName } from "@/lib/format";
import {
  allocatePaidTotalAcrossAppointments,
  isPaymentMethod,
  withPaymentInfo,
  type PaymentMethod,
} from "@/lib/payments";
import { scheduledAppointmentGroupFor } from "@/lib/schedule";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { isEditAppointmentWriteEnabled } from "@/lib/writeGate";

export type AppointmentPaymentState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "demo" | "gated" | "saved";
      message: string;
      petLabel: string;
    };

function checked(value: FormDataEntryValue | null): boolean {
  return ["on", "true", "1", "yes"].includes(String(value ?? "").trim().toLowerCase());
}

function petLabelFor(
  appointments: Appointment[],
  pets: { id: string; name: string }[],
): string {
  return appointments
    .map(
      (appointment) =>
        pets.find((pet) => pet.id === appointment.pet_id)?.name ?? "the pet",
    )
    .join(" + ");
}

export async function markAppointmentPaid(
  _prev: AppointmentPaymentState,
  formData: FormData,
): Promise<AppointmentPaymentState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Your session ended. Sign in again." };

  const clientId = String(formData.get("client_id") ?? "").trim();
  const appointmentId = String(formData.get("appointment_id") ?? "").trim();
  const methodRaw = String(formData.get("payment_method") ?? "").trim();
  const paidAmountRaw = String(formData.get("paid_amount") ?? "").trim();
  const groupScope = checked(formData.get("payment_scope_group"));
  if (!clientId || !appointmentId || !isPaymentMethod(methodRaw)) {
    return { status: "error", message: "Missing payment details." };
  }
  const paidAmount = Number(paidAmountRaw);
  if (!paidAmountRaw || !Number.isFinite(paidAmount) || paidAmount < 0) {
    return { status: "error", message: "Enter the amount they paid." };
  }
  const paymentMethod = methodRaw as PaymentMethod;

  const record = await getClientRecord(clientId);
  const appointment = record?.appointments.find(
    (candidate) => candidate.id === appointmentId,
  );
  if (!record || !appointment) {
    return { status: "error", message: "That appointment could not be found." };
  }
  if (appointment.status === "cancelled" || appointment.status === "no_show") {
    return {
      status: "error",
      message: "That appointment is an exception. Use Edit visit for corrections.",
    };
  }

  const group = scheduledAppointmentGroupFor(record.appointments, appointment.id);
  const targets = groupScope && group.length > 1 ? group : [appointment];
  const petLabel = petLabelFor(targets, record.pets);
  const allocation = allocatePaidTotalAcrossAppointments(targets, paidAmount);
  if (!allocation.ok) {
    return { status: "error", message: allocation.message };
  }
  const allocationById = new Map(
    allocation.updates.map((update) => [update.id, update]),
  );

  if (dataMode() === "fixtures") {
    return {
      status: "demo",
      petLabel,
      message: `Demo only - marked ${petLabel} paid.`,
    };
  }
  if (!isEditAppointmentWriteEnabled()) {
    return {
      status: "gated",
      petLabel,
      message: "Payment updates are not switched on yet. Nothing was saved.",
    };
  }

  const supabase = await createServerSupabase();
  const writes = await Promise.all(
    targets.map((target) => {
      const allocated = allocationById.get(target.id);
      return supabase
        .from("appointments")
        .update({
          notes: withPaymentInfo(target.notes, {
            method: paymentMethod,
            status: "paid",
          }),
          tip: allocated?.tip ?? 0,
          net: allocated?.net ?? target.price ?? 0,
        })
        .eq("id", target.id)
        .eq("client_id", clientId);
    }),
  );
  if (writes.some((write) => write.error)) {
    return { status: "error", message: "That payment could not be saved." };
  }

  revalidatePath("/schedule");
  revalidatePath(`/clients/${clientId}`);
  for (const target of targets) {
    revalidatePath(`/clients/${clientId}/pets/${target.pet_id}`);
  }
  await recordAuditEvent({
    eventType: "appointment.updated",
    clientId,
    petId: appointment.pet_id,
    appointmentId,
    summary: `Marked ${petLabel} paid for ${fullName(
      record.client.first_name,
      record.client.last_name,
    )}.`,
    metadata: {
      appointmentIds: targets.map((target) => target.id),
      paymentMethod,
      paymentStatus: "paid",
      paidAmount,
      tip: allocation.updates.reduce((sum, update) => sum + update.tip, 0),
      date: appointment.date,
    },
  });

  return { status: "saved", petLabel, message: `Marked ${petLabel} paid.` };
}
