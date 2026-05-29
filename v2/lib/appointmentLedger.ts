import type { Appointment } from "./data/types";

function sameVisitKey(appointment: Pick<Appointment, "client_id" | "pet_id" | "date">): string {
  return `${appointment.client_id}::${appointment.pet_id}::${appointment.date}`;
}

export function collapseLoggedGroomDuplicates(
  appointments: Appointment[],
): Appointment[] {
  const completedVisitKeys = new Set(
    appointments
      .filter((appointment) => (appointment.status ?? "completed") === "completed")
      .map(sameVisitKey),
  );
  return appointments.filter(
    (appointment) =>
      !(
        appointment.status === "booked" &&
        completedVisitKeys.has(sameVisitKey(appointment))
      ),
  );
}
