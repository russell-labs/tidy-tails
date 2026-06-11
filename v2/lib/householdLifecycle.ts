import type { Appointment } from "./data/types";

/**
 * A household (client) may be hard-deleted only when it carries no appointment
 * history. Completed grooms are business records (v2/AGENTS.md), so a household
 * with any appointment is blocked from deletion — this is the analogue of
 * `canDeletePetProfile` for the whole household. The clean case this serves is
 * removing test / duplicate / wrong-entry households that never had a groom.
 */
export function canDeleteHousehold({
  appointments,
}: {
  appointments: Appointment[];
}): boolean {
  return appointments.length === 0;
}
