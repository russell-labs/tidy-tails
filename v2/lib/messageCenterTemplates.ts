import type { AuditEvent } from "./audit";
import { customerBookingLocationLabel } from "./booking";
import type { Appointment, Client, Pet } from "./data/types";
import { formatDate } from "./format";
import { customerLocationLabelFromSettings } from "./locationFinance";
import type { OperatorSettings } from "./operatorSettings";

export type MessageCenterTemplateKey =
  | "booking_confirmation"
  | "first_platform"
  | "appointment_reminder"
  | "rebook_follow_up"
  | "ready_pickup";

export type MessageCenterTemplateOption = {
  key: MessageCenterTemplateKey;
  label: string;
};

export const MESSAGE_CENTER_TEMPLATE_OPTIONS: MessageCenterTemplateOption[] = [
  { key: "booking_confirmation", label: "Booking confirmation" },
  { key: "first_platform", label: "First platform text" },
  { key: "appointment_reminder", label: "Appointment reminder" },
  { key: "rebook_follow_up", label: "Rebook follow-up" },
  { key: "ready_pickup", label: "Ready for pickup" },
];

const FIRST_PLATFORM_LAUNCH_DATE = new Date("2026-05-24T00:00:00Z");

export function renderMessageCenterTemplate({
  key,
  settings,
  client,
  pets,
  appointments,
}: {
  key: MessageCenterTemplateKey;
  settings: OperatorSettings;
  client: Pick<Client, "first_name">;
  pets: Pet[];
  appointments: Appointment[];
}): string {
  const template = templateForKey(key, settings);
  const appointment = pickTemplateAppointment(appointments);
  const pet =
    (appointment ? pets.find((item) => item.id === appointment.pet_id) : undefined) ??
    pets[0] ??
    null;

  return renderTemplate(template, {
    ownerFirstName: client.first_name,
    petName: pet?.name ?? null,
    appointmentDate: appointment?.date ?? null,
    appointmentTime: appointment?.time_slot ?? null,
    appointmentService: appointment?.service ?? null,
    appointmentLocation: appointment?.location ?? null,
    locationSettings: settings.locationSettings,
  });
}

export function buildFirstPlatformSentClientIds(events: AuditEvent[]): Set<string> {
  return new Set(
    events
      .filter(
        (event) =>
          event.event_type === "sms.sent" &&
          event.client_id &&
          event.metadata.templateKey === "first_platform",
      )
      .map((event) => event.client_id)
      .filter((value): value is string => typeof value === "string"),
  );
}

export function isExistingHouseholdForPlatformIntro(
  client: Pick<Client, "created_at">,
  appointments: Appointment[],
  launchDate = FIRST_PLATFORM_LAUNCH_DATE,
): boolean {
  const createdAt = Date.parse(client.created_at);
  if (Number.isFinite(createdAt) && createdAt < launchDate.getTime()) return true;
  return appointments.some((appointment) => {
    const appointmentDate = Date.parse(appointment.date);
    return Number.isFinite(appointmentDate) && appointmentDate < launchDate.getTime();
  });
}

export function getMessageTemplateAvailability({
  key,
  isExistingHousehold,
  firstPlatformAlreadySent,
}: {
  key: MessageCenterTemplateKey;
  isExistingHousehold: boolean;
  firstPlatformAlreadySent: boolean;
}): { disabled: false } | { disabled: true; reason: string } {
  if (key !== "first_platform") return { disabled: false };
  if (!isExistingHousehold) {
    return { disabled: true, reason: "Only for existing households." };
  }
  if (firstPlatformAlreadySent) {
    return { disabled: true, reason: "Already sent to this household." };
  }
  return { disabled: false };
}

function templateForKey(
  key: MessageCenterTemplateKey,
  settings: OperatorSettings,
): string {
  if (key === "booking_confirmation") return settings.bookingConfirmationTemplate;
  if (key === "first_platform") return settings.firstPlatformTextTemplate;
  if (key === "appointment_reminder") return settings.appointmentReminderTemplate;
  if (key === "rebook_follow_up") return settings.rebookReminderTemplate;
  return settings.readyPickupTemplate;
}

function pickTemplateAppointment(appointments: Appointment[]): Appointment | null {
  return [...appointments]
    .sort((a, b) => a.date.localeCompare(b.date))
    .find((appointment) => appointment.status !== "cancelled") ?? null;
}

function renderTemplate(
  template: string,
  vars: {
    ownerFirstName: string | null;
    petName: string | null;
    appointmentDate: string | null;
    appointmentTime: string | null;
    appointmentService: string | null;
    appointmentLocation: string | null;
    locationSettings: OperatorSettings["locationSettings"];
  },
): string {
  const location =
    customerLocationLabelFromSettings(
      vars.appointmentLocation,
      vars.locationSettings,
    ) ??
    customerBookingLocationLabel(vars.appointmentLocation) ??
    (vars.appointmentLocation?.trim() || "the grooming location");

  return template
    .replaceAll("[first name]", vars.ownerFirstName?.trim() || "there")
    .replaceAll("[pet name]", vars.petName?.trim() || "your dog")
    .replaceAll("[date]", vars.appointmentDate ? formatDate(vars.appointmentDate) : "soon")
    .replaceAll("[time]", vars.appointmentTime?.trim() || "the scheduled time")
    .replaceAll("[service]", vars.appointmentService?.trim() || "the service")
    .replaceAll("[location]", location)
    .trim();
}
