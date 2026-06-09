import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { AppointmentPaymentControls } from "@/components/AppointmentPaymentControls";
import { AppointmentWorkflowControls } from "@/components/AppointmentWorkflowControls";
import { EditAppointment } from "@/components/EditAppointment";
import { LogGroom } from "@/components/LogGroom";
import { ReadyPickupMessage } from "@/components/ReadyPickupMessage";
import { SchedulePetProfileLink } from "@/components/SchedulePetProfileLink";
import { ScheduleReminder } from "@/components/ScheduleReminder";
import { bookingLocationLabel } from "@/lib/booking";
import {
  appointmentWorkflowStage,
  parseAppointmentWorkflowMarker,
  stripAppointmentWorkflowMarker,
} from "@/lib/appointmentWorkflow";
import { dataMode, loadDataset } from "@/lib/data/repo";
import { formatDate, formatMoney, formatPhone, fullName } from "@/lib/format";
import {
  calculateAppointmentMoney,
  locationLabelFromSettings,
} from "@/lib/locationFinance";
import { loadOrgSettings } from "@/lib/orgSettings.server";
import { readOperatorSettings } from "@/lib/operatorSettings.server";
import {
  parsePaymentInfo,
  paymentLabel,
  paymentPillForAppointments,
  paymentSummaryForAppointments,
  stripPaymentInfo,
} from "@/lib/payments";
import { stripSalonPayoutOverride } from "@/lib/payoutOverride";
import { buildReminderTarget } from "@/lib/reminders";
import { scheduledAppointmentGroupFor, weekRangeForDate } from "@/lib/schedule";
import {
  isEditAppointmentWriteEnabled,
  isLogGroomWriteEnabled,
} from "@/lib/writeGate";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}): Promise<Metadata> {
  const { appointmentId } = await params;
  const { appointments, pets } = await loadDataset();
  const appointment = appointments.find((candidate) => candidate.id === appointmentId);
  const pet = appointment
    ? pets.find((candidate) => candidate.id === appointment.pet_id)
    : null;

  return {
    title: pet ? `${pet.name} appointment` : "Appointment",
  };
}

export default async function AppointmentActionPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  const { appointmentId } = await params;
  const { clients, pets, appointments } = await loadDataset();
  const appointment = appointments.find((candidate) => candidate.id === appointmentId);
  if (!appointment) notFound();

  const client = clients.find((candidate) => candidate.id === appointment.client_id);
  const pet = pets.find((candidate) => candidate.id === appointment.pet_id);
  if (!client || !pet) notFound();

  const settings = await readOperatorSettings();
  const orgSettings = await loadOrgSettings();
  const householdPets = pets.filter((candidate) => candidate.client_id === client.id);
  const householdAppointments = appointments.filter(
    (candidate) => candidate.client_id === client.id,
  );
  const appointmentGroup = scheduledAppointmentGroupFor(
    householdAppointments,
    appointment.id,
  );
  const appointmentGroupPetNames = appointmentGroup.map(
    (candidate) =>
      householdPets.find((householdPet) => householdPet.id === candidate.pet_id)
        ?.name ?? "Unknown pet",
  );
  const target = buildReminderTarget(householdAppointments, householdPets, {
    appointmentId: appointment.id,
  });
  const location =
    locationLabelFromSettings(appointment.location, settings.locationSettings) ??
    bookingLocationLabel(appointment.location);
  const money = calculateAppointmentMoney(appointment, settings.locationSettings);
  const payment = parsePaymentInfo(appointment.notes);
  const paymentPill = paymentPillForAppointments([appointment]);
  const groupPaymentPill =
    appointmentGroup.length > 1
      ? paymentPillForAppointments(appointmentGroup)
      : null;
  const paymentSummary = paymentSummaryForAppointments([appointment]);
  const groupPaymentSummary =
    appointmentGroup.length > 1
      ? paymentSummaryForAppointments(appointmentGroup)
      : null;
  const workflowStage = appointmentWorkflowStage(appointment);
  const workflowCurrent =
    parseAppointmentWorkflowMarker(appointment.notes) ?? "scheduled";
  const visibleNotes = stripAppointmentWorkflowMarker(
    stripSalonPayoutOverride(stripPaymentInfo(appointment.notes)),
  );
  const scheduleBack = `/schedule?view=day&day=${appointment.date}&week=${
    weekRangeForDate(appointment.date).start
  }`;

  return (
    <main className="px-4 py-4">
      <BackLink href={scheduleBack} label="Schedule" />

      <header className="mt-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Appointment
        </p>
        <h1 className="mt-1 text-2xl font-bold text-ink">
          <SchedulePetProfileLink
            clientId={client.id}
            petId={pet.id}
            petName={pet.name}
          />
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {fullName(client.first_name, client.last_name)} ·{" "}
          {formatPhone(client.phone)}
        </p>
      </header>

      <section className="mt-4 rounded-xl border border-line bg-surface px-3.5 py-3 shadow-sm">
        {appointmentGroup.length > 1 ? (
          <p className="mb-3 rounded-lg bg-brand-soft px-3 py-2 text-sm font-semibold text-brand-ink">
            Booked together: {appointmentGroupPetNames.join(" + ")}
          </p>
        ) : null}
        <dl className="grid grid-cols-1 gap-2 text-sm">
          <DetailRow label="Date" value={formatDate(appointment.date)} />
          <DetailRow
            label="Time"
            value={appointment.time_slot ?? "Time not set"}
          />
          <DetailRow
            label="Service"
            value={appointment.service ?? "Service not set"}
          />
          <DetailRow
            label="Gross"
            value={
              appointment.price != null ? formatMoney(appointment.price) : "No fee"
            }
          />
          {appointment.price != null ? (
            <DetailRow label="Sam net" value={formatMoney(money.samNet)} />
          ) : null}
          {appointment.price != null && money.payoutLabel ? (
            <DetailRow label="Salon payout" value={money.payoutLabel} />
          ) : null}
          <DetailRow label="Payment" value={paymentLabel(payment)} />
          {location ? <DetailRow label="Location" value={location} /> : null}
          {visibleNotes ? (
            <DetailRow label="Notes" value={visibleNotes} />
          ) : null}
        </dl>
      </section>

      <section className="mt-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Actions
        </h2>
        <div className="flex flex-col gap-2.5">
          <AppointmentWorkflowControls
            clientId={client.id}
            appointmentId={appointment.id}
            current={workflowCurrent}
            disabled={workflowStage === "completed" || workflowStage === "exception"}
          />

          <AppointmentPaymentControls
            clientId={client.id}
            appointmentId={appointment.id}
            payment={paymentPill}
            groupPayment={groupPaymentPill}
            paymentSummary={paymentSummary}
            groupPaymentSummary={groupPaymentSummary}
            groupLabel={
              appointmentGroup.length > 1
                ? appointmentGroupPetNames.join(" + ")
                : undefined
            }
            disabled={workflowStage === "exception"}
          />

          {target ? (
            <ScheduleReminder
              clientId={client.id}
              appointmentId={appointment.id}
              ownerFirstName={client.first_name}
              ownerName={fullName(client.first_name, client.last_name)}
              phone={client.phone}
              petName={target.petName}
              appointmentDate={target.appointmentDate}
              appointmentTime={target.appointmentTime}
              appointmentLocation={target.appointmentLocation}
              mode={dataMode()}
              reminderSettings={settings}
            />
          ) : null}

          {orgSettings.schedulingStyle === "one_to_one" ? (
            // The batched editor (morning tiles, gina/annette locations, day-fit)
            // does not fit 1:1 duration blocks; the 1:1 edit experience is a later
            // step (the editAppointment action also refuses 1:1). Degrade, don't
            // show the wrong form.
            <div className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink-soft">
              Editing 1:1 appointments is coming in a later step. For now, you can
              book new blocks from a client&rsquo;s page.
            </div>
          ) : (
            <EditAppointment
              clientId={client.id}
              appointment={appointment}
              appointments={householdAppointments}
              groupAppointmentIds={appointmentGroup.map((candidate) => candidate.id)}
              groupPetNames={appointmentGroupPetNames}
              petName={pet.name}
              ownerFirstName={client.first_name}
              customerPhone={client.phone}
              mode={dataMode()}
              writesEnabled={isEditAppointmentWriteEnabled()}
              locationSettings={settings.locationSettings}
              trigger={
                <ActionTile
                  title="Change or cancel appointment"
                  detail={
                    appointmentGroup.length > 1
                      ? "Update or cancel this dog, or all dogs booked in this time."
                      : "Update the date, time, service, fee, payment, notes, or cancel this booking."
                  }
                />
              }
            />
          )}

          <LogGroom
            client={client}
            pets={[pet]}
            appointments={householdAppointments}
            mode={dataMode()}
            writesEnabled={isLogGroomWriteEnabled()}
          />

          <ReadyPickupMessage
            client={client}
            pet={pet}
            mode={dataMode()}
            settings={settings}
          />
        </div>
      </section>
    </main>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

function ActionTile({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-brand bg-brand-soft px-3.5 py-3 text-brand-ink active:bg-brand-soft/70">
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-0.5 text-xs leading-relaxed opacity-85">{detail}</p>
    </div>
  );
}
