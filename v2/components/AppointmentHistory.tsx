import type { Appointment } from "@/lib/data/types";
import { sortByDateDesc } from "@/lib/derive";
import { formatDateShort, formatMoney } from "@/lib/format";
import { EditAppointment } from "./EditAppointment";

function Row({
  appointment,
  clientId,
  appointments,
  petName,
  mode,
  writesEnabled,
}: {
  appointment: Appointment;
  clientId: string;
  appointments: Appointment[];
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
          appointments={appointments}
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

  const today = todayISO();
  const upcoming = appointments
    .filter((a) => a.status === "booked" && a.date >= today)
    .sort((a, b) => `${a.date} ${a.time_slot ?? ""}`.localeCompare(`${b.date} ${b.time_slot ?? ""}`));
  const history = sortByDateDesc(
    appointments.filter((a) => !(a.status === "booked" && a.date >= today)),
  );
  // Skip fee-less visits so the all-time total never reads low by treating an
  // unrecorded fee as $0.
  const total = history.reduce((sum, a) => sum + (a.price ?? 0) + (a.tip ?? 0), 0);
  const head = history.slice(0, 10);
  const rest = history.slice(10);

  return (
    <div className="flex flex-col gap-5">
      {upcoming.length > 0 ? (
        <section>
          <p className="mb-2 text-sm text-ink-soft">
            {upcoming.length} upcoming booking{upcoming.length === 1 ? "" : "s"}
          </p>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {upcoming.map((a) => (
              <Row
                key={a.id}
                appointment={a}
                appointments={appointments}
                clientId={clientId}
                petName={petsById?.[a.pet_id]}
                mode={mode}
                writesEnabled={writesEnabled}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <p className="mb-2 text-sm text-ink-soft">
          {history.length} past visit{history.length === 1 ? "" : "s"} ·{" "}
          <span className="font-semibold text-ink">{formatMoney(total)}</span>{" "}
          all-time
        </p>

        {head.length > 0 ? (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {head.map((a) => (
              <Row
                key={a.id}
                appointment={a}
                appointments={appointments}
                clientId={clientId}
                petName={petsById?.[a.pet_id]}
                mode={mode}
                writesEnabled={writesEnabled}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-faint">No past visits recorded yet.</p>
        )}

        {rest.length > 0 ? (
          <details className="group mt-2">
            <summary className="cursor-pointer list-none rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm font-semibold text-brand">
              <span className="group-open:hidden">
                Show all {history.length} past visits
              </span>
              <span className="hidden group-open:inline">Show fewer</span>
            </summary>
            <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {rest.map((a) => (
                <Row
                  key={a.id}
                  appointment={a}
                  appointments={appointments}
                  clientId={clientId}
                  petName={petsById?.[a.pet_id]}
                  mode={mode}
                  writesEnabled={writesEnabled}
                />
              ))}
            </ul>
          </details>
        ) : null}
      </section>
    </div>
  );
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
