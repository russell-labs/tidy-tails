import type { Appointment } from "@/lib/data/types";
import { sortByDateDesc } from "@/lib/derive";
import { formatDateShort, formatMoney } from "@/lib/format";
import { EditAppointment } from "./EditAppointment";

function Row({
  appointment,
  clientId,
  petName,
  mode,
  writesEnabled,
}: {
  appointment: Appointment;
  clientId: string;
  petName?: string;
  mode: "fixtures" | "live";
  writesEnabled: boolean;
}) {
  const total = (appointment.price ?? 0) + (appointment.tip ?? 0);
  return (
    <li className="flex items-start justify-between gap-3 px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">
          {formatDateShort(appointment.date)}
          {petName ? (
            <span className="font-normal text-ink-soft"> · {petName}</span>
          ) : null}
        </p>
        {appointment.service ? (
          <p className="text-sm text-ink-soft">{appointment.service}</p>
        ) : (
          <p className="text-sm text-ink-faint">Service not recorded</p>
        )}
        {appointment.notes ? (
          <p className="mt-1 text-sm leading-snug text-ink">
            {appointment.notes}
          </p>
        ) : null}
        <EditAppointment
          clientId={clientId}
          appointment={appointment}
          petName={petName}
          mode={mode}
          writesEnabled={writesEnabled}
        />
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold text-ink">
          {appointment.price != null || appointment.tip != null
            ? formatMoney(total)
            : formatMoney(null)}
        </p>
        {appointment.tip ? (
          <p className="text-xs text-ink-faint">
            incl. {formatMoney(appointment.tip)} tip
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function AppointmentHistory({
  appointments,
  clientId,
  petsById,
  mode,
  writesEnabled,
}: {
  appointments: Appointment[];
  clientId: string;
  petsById?: Record<string, string>;
  mode: "fixtures" | "live";
  writesEnabled: boolean;
}) {
  if (appointments.length === 0) {
    return (
      <p className="text-sm text-ink-faint">No appointments recorded yet.</p>
    );
  }

  const sorted = sortByDateDesc(appointments);
  // Skip fee-less visits so the all-time total never reads low by treating an
  // unrecorded fee as $0.
  const total = sorted.reduce((sum, a) => sum + (a.price ?? 0) + (a.tip ?? 0), 0);
  const head = sorted.slice(0, 10);
  const rest = sorted.slice(10);

  return (
    <div>
      <p className="mb-2 text-sm text-ink-soft">
        {sorted.length} visit{sorted.length === 1 ? "" : "s"} ·{" "}
        <span className="font-semibold text-ink">{formatMoney(total)}</span>{" "}
        all-time
      </p>

      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {head.map((a) => (
          <Row
            key={a.id}
            appointment={a}
            clientId={clientId}
            petName={petsById?.[a.pet_id]}
            mode={mode}
            writesEnabled={writesEnabled}
          />
        ))}
      </ul>

      {rest.length > 0 ? (
        <details className="group mt-2">
          <summary className="cursor-pointer list-none rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm font-semibold text-brand">
            <span className="group-open:hidden">
              Show all {sorted.length} visits
            </span>
            <span className="hidden group-open:inline">Show fewer</span>
          </summary>
          <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {rest.map((a) => (
              <Row
                key={a.id}
                appointment={a}
                clientId={clientId}
                petName={petsById?.[a.pet_id]}
                mode={mode}
                writesEnabled={writesEnabled}
              />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
