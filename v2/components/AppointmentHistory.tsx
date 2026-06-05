import type { Appointment } from "@/lib/data/types";
import { collapseLoggedGroomDuplicates } from "@/lib/appointmentLedger";
import { sortByDateDesc } from "@/lib/derive";
import { formatDateShort, formatMoney } from "@/lib/format";
import type { LocationSettingsMap } from "@/lib/operatorSettings";
import { stripAppointmentWorkflowMarker } from "@/lib/appointmentWorkflow";
import { paymentPillForAppointments, stripPaymentInfo } from "@/lib/payments";
import { stripSalonPayoutOverride } from "@/lib/payoutOverride";
import { todayISO } from "@/lib/dates";
import { EditAppointment } from "./EditAppointment";

function Row({
  appointment,
  clientId,
  appointments,
  petName,
  customerPhone,
  mode,
  writesEnabled,
  locationSettings,
}: {
  appointment: Appointment;
  clientId: string;
  appointments: Appointment[];
  petName?: string;
  customerPhone?: string;
  mode: "fixtures" | "live";
  writesEnabled: boolean;
  locationSettings: LocationSettingsMap;
}) {
  const total = (appointment.price ?? 0) + (appointment.tip ?? 0);
  const paymentPill = paymentPillForAppointments([appointment]);
  const trigger = (
    <div className="flex items-start justify-between gap-3 px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">
          {formatDateShort(appointment.date)}
          {appointment.time_slot ? (
            <span className="font-normal text-ink-soft">
              {" "}
              · {appointment.time_slot}
            </span>
          ) : null}
          {petName ? (
            <span className="font-normal text-ink-soft"> · {petName}</span>
          ) : null}
        </p>
        {appointment.service ? (
          <p className="text-sm text-ink-soft">{appointment.service}</p>
        ) : (
          <p className="text-sm text-ink-faint">Service not recorded</p>
        )}
        {displayNotes(appointment.notes) ? (
          <p className="mt-1 text-sm leading-snug text-ink">
            {displayNotes(appointment.notes)}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {paymentPill ? (
            <span
              className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${
                paymentPill.status === "paid"
                  ? "bg-ok-soft text-ok"
                  : paymentPill.status === "waiting"
                    ? "bg-warn-soft text-warn"
                    : "bg-canvas text-ink-soft"
              }`}
            >
              {paymentPill.label}
            </span>
          ) : null}
          <span className="inline-flex rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-brand">
            Edit visit
          </span>
        </div>
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
    </div>
  );
  return (
    <li>
      <EditAppointment
        clientId={clientId}
        appointment={appointment}
        appointments={appointments}
        petName={petName}
        customerPhone={customerPhone}
        mode={mode}
        writesEnabled={writesEnabled}
        locationSettings={locationSettings}
        trigger={trigger}
      />
    </li>
  );
}

export function AppointmentHistory({
  appointments,
  clientId,
  petsById,
  customerPhone,
  mode,
  writesEnabled,
  locationSettings,
}: {
  appointments: Appointment[];
  clientId: string;
  petsById?: Record<string, string>;
  customerPhone?: string;
  mode: "fixtures" | "live";
  writesEnabled: boolean;
  locationSettings: LocationSettingsMap;
}) {
  if (appointments.length === 0) {
    return (
      <p className="text-sm text-ink-faint">No appointments recorded yet.</p>
    );
  }

  const visibleAppointments = collapseLoggedGroomDuplicates(appointments);
  const today = todayISO();
  const upcoming = visibleAppointments
    .filter((a) => a.status === "booked" && a.date >= today)
    .sort((a, b) => `${a.date} ${a.time_slot ?? ""}`.localeCompare(`${b.date} ${b.time_slot ?? ""}`));
  const history = sortByDateDesc(
    visibleAppointments.filter((a) => !(a.status === "booked" && a.date >= today)),
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
                customerPhone={customerPhone}
                mode={mode}
                writesEnabled={writesEnabled}
                locationSettings={locationSettings}
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
                customerPhone={customerPhone}
                mode={mode}
                writesEnabled={writesEnabled}
                locationSettings={locationSettings}
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
                  customerPhone={customerPhone}
                  mode={mode}
                  writesEnabled={writesEnabled}
                  locationSettings={locationSettings}
                />
              ))}
            </ul>
          </details>
        ) : null}
      </section>
    </div>
  );
}

function displayNotes(notes: string | null): string | null {
  return stripAppointmentWorkflowMarker(
    stripSalonPayoutOverride(stripPaymentInfo(notes)),
  );
}
