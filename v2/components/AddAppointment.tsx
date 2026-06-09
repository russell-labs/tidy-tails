"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  checkBookingAvailability,
  type BookingAvailabilityState,
} from "@/lib/actions/availability";
import { createBooking, type BookingState } from "@/lib/actions/appointments";
import { getDayCapacity } from "@/lib/actions/dayCapacity";
import {
  availableBookingTimeSlots,
  BOOKING_LOCATIONS,
  bookedTimesForDate,
  chooseBookingMessageDraft,
  formatPetNames,
  renderBookingMessageTemplate,
  SERVICE_TYPES,
  validateBookingInput,
  type BookingLocation,
  type BookingErrors,
  type BookingMessageDraftKind,
  type ServiceType,
} from "@/lib/booking";
import { assessDayFit, type DayFitAssessment } from "@/lib/dayCapacity";
import {
  customerLocationLabelFromSettings,
  locationLabelFromSettings,
} from "@/lib/locationFinance";
import type {
  LocationSettingsMap,
  ScheduleCalibration,
} from "@/lib/operatorSettings";
import { lastKnownPrice, lastKnownService } from "@/lib/derive";
import { serviceCodeFromLabel, serviceLabel } from "@/lib/data/live";
import type { Appointment, Client, Pet } from "@/lib/data/types";
import { formatMoney, formatReviewDate, fullName } from "@/lib/format";
import { BookingTimeSlotPicker } from "./BookingTimeSlotPicker";
import { Sheet } from "./Sheet";
import { SubmitDogOverlay } from "./SubmitDog";
import { Field, ReviewRow } from "./FormPrimitives";

// M2 — "Add appointment" booking flow: form → review → result. The wedge
// becomes Call/Text → Identify → Add Booking. Fixture mode is a dry-run; live
// mode writes only when the server gate is enabled (see lib/actions).

const fieldClass =
  "w-full min-w-0 max-w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-ink-faint";

export function AddAppointment({
  client,
  pets,
  appointments,
  mode,
  writesEnabled,
  bookingConfirmationTemplate,
  firstPlatformTextTemplate,
  scheduleCalibration,
  locationSettings,
  hasPriorOutboundSms,
}: {
  client: Client;
  pets: Pet[];
  appointments: Appointment[];
  mode: "fixtures" | "live";
  writesEnabled: boolean;
  bookingConfirmationTemplate: string;
  firstPlatformTextTemplate: string;
  scheduleCalibration: ScheduleCalibration;
  locationSettings: LocationSettingsMap;
  hasPriorOutboundSms: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [knownPriorOutboundSms, setKnownPriorOutboundSms] =
    useState(hasPriorOutboundSms);
  // Remount the form on each close so a reopened sheet starts fresh.
  const [formKey, setFormKey] = useState(0);

  // No pet, nothing to book — the household needs a pet first.
  if (pets.length === 0) return null;

  function close({ markPriorOutboundSms = false } = {}) {
    if (markPriorOutboundSms) setKnownPriorOutboundSms(true);
    setOpen(false);
    setFormKey((k) => k + 1);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-3 py-3 text-base font-semibold text-white active:bg-brand-ink"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="12" y1="14" x2="12" y2="18" />
          <line x1="10" y1="16" x2="14" y2="16" />
        </svg>
        Add appointment
      </button>

      <Sheet open={open} onClose={close} title="Add appointment">
        <BookingForm
          key={formKey}
          client={client}
          pets={pets}
          appointments={appointments}
          mode={mode}
          writesEnabled={writesEnabled}
          bookingConfirmationTemplate={bookingConfirmationTemplate}
          firstPlatformTextTemplate={firstPlatformTextTemplate}
          scheduleCalibration={scheduleCalibration}
          locationSettings={locationSettings}
          hasPriorOutboundSms={knownPriorOutboundSms}
          onDone={close}
        />
      </Sheet>
    </>
  );
}

function BookingForm({
  client,
  pets,
  appointments,
  mode,
  writesEnabled,
  bookingConfirmationTemplate,
  firstPlatformTextTemplate,
  scheduleCalibration,
  locationSettings,
  hasPriorOutboundSms,
  onDone,
}: {
  client: Client;
  pets: Pet[];
  appointments: Appointment[];
  mode: "fixtures" | "live";
  writesEnabled: boolean;
  bookingConfirmationTemplate: string;
  firstPlatformTextTemplate: string;
  scheduleCalibration: ScheduleCalibration;
  locationSettings: LocationSettingsMap;
  hasPriorOutboundSms: boolean;
  onDone: (options?: { markPriorOutboundSms?: boolean }) => void;
}) {
  const [state, formAction, pending] = useActionState<BookingState, FormData>(
    createBooking,
    { status: "idle" },
  );
  // `step` is plain local state, never derived from `state` — a server result
  // must not lock navigation. A server-side error (expired session, ownership
  // refusal) surfaces as the banner below, which renders on either step, so the
  // operator sees it and can still go Back to edit and re-submit.
  const [step, setStep] = useState<"form" | "review">("form");
  const [errors, setErrors] = useState<BookingErrors>({});

  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([pets[0].id]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const initialPetServices = Object.fromEntries(
    pets.map((pet) => [pet.id, bookingDefaults(pet, appointments).serviceType]),
  );
  const initialPetFees = Object.fromEntries(
    pets.map((pet) => [pet.id, bookingDefaults(pet, appointments).fee]),
  );
  const [petServices, setPetServices] =
    useState<Record<string, ServiceType | "">>(initialPetServices);
  const [location, setLocation] = useState<BookingLocation | "">("");
  const [sendInvite, setSendInvite] = useState(Boolean(client.email));
  const [customerEmail, setCustomerEmail] = useState(client.email ?? "");
  const [sendBookingText, setSendBookingText] = useState(false);
  const [bookingMessage, setBookingMessage] = useState("");
  const recommendedDraft = chooseBookingMessageDraft({
    hasPriorAppointments: appointments.length > 0,
    hasPriorOutboundSms,
    bookingConfirmationTemplate,
    firstPlatformTextTemplate,
  });
  const [bookingMessageDraftKind, setBookingMessageDraftKind] =
    useState<BookingMessageDraftKind>(recommendedDraft.kind);
  // Texting requires recorded consent (WS0). The send controls below are
  // disabled until the client has consented — either already on file, or ticked
  // here. Reminder-phone only defaults on for an already-consented client, so a
  // non-consented client's text controls start off, matching the server gate.
  const consentOnFile = client.sms_consent === true;
  const [smsConsentChecked, setSmsConsentChecked] = useState(false);
  const hasTextConsent = consentOnFile || smsConsentChecked;
  const [saveReminderPhone, setSaveReminderPhone] = useState(
    Boolean(client.phone) && consentOnFile,
  );
  const [customerPhone, setCustomerPhone] = useState(client.phone);
  const [petFees, setPetFees] = useState<Record<string, string>>(initialPetFees);
  const [notes, setNotes] = useState("");
  const [salonPayoutOverride, setSalonPayoutOverride] = useState("");
  const [availabilityResult, setAvailabilityResult] = useState<{
    date: string;
    serviceType: ServiceType | "";
    result: BookingAvailabilityState;
  } | null>(null);
  const [availabilityPending, startAvailabilityTransition] = useTransition();
  // TT-001: the day-fit note + slot helpers must reflect the WHOLE day in the
  // operator's org, not just this household. `dayLoad` is the full day's
  // org-scoped appointments + referenced pets, fetched on date-select.
  const [dayLoad, setDayLoad] = useState<{
    date: string;
    appointments: Appointment[];
    pets: Pet[];
  } | null>(null);
  const [dayLoadFailedDate, setDayLoadFailedDate] = useState<string | null>(null);
  const [, startDayLoadTransition] = useTransition();

  const selectedPets = pets.filter((p) => selectedPetIds.includes(p.id));
  const primaryPet = selectedPets[0] ?? pets[0];
  const petNameList = formatPetNames(selectedPets.map((pet) => pet.name));
  const primaryServiceType = petServices[primaryPet.id] ?? "";
  const primaryFee = petFees[primaryPet.id] ?? "";
  const selectedServiceLabels = Array.from(
    new Set(
      selectedPets
        .map((pet) => petServices[pet.id])
        .filter((code): code is ServiceType => Boolean(code))
        .map((code) => serviceLabel(code) ?? "Grooming"),
    ),
  );
  const reviewService =
    selectedServiceLabels.length === 0
      ? "Not set"
      : selectedServiceLabels.length === 1
        ? selectedServiceLabels[0]
        : "Per dog";
  const totalFee = selectedPets.reduce((sum, pet) => {
    const value = Number(petFees[pet.id] ?? "");
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
  const ownerName = fullName(client.first_name, client.last_name);
  const availability =
    availabilityResult?.date === date &&
    availabilityResult.serviceType === primaryServiceType
      ? availabilityResult.result
      : null;
  // TT-001 day-fit base resolution. Three distinct states:
  //   • ready   → use the full day's org-scoped set (every household that day)
  //   • failed  → fall back to this household's rows so a transient fetch error
  //               never blocks the booking
  //   • loading → defer the note and show a loading treatment, never the stale
  //               household-only count (the "1 dog · looks open" bug we fix here)
  const dayLoadReady = Boolean(date) && dayLoad?.date === date;
  const dayLoadFailed = dayLoadFailedDate === date;
  const dayLoadLoading = Boolean(date) && !dayLoadReady && !dayLoadFailed;
  const baseAppointments = dayLoadReady ? dayLoad!.appointments : appointments;
  const basePets = dayLoadReady ? dayLoad!.pets : pets;

  const fallbackSlots = date
    ? availableBookingTimeSlots(baseAppointments, date).map((slot) =>
        slot.available
          ? ({ ...slot, source: "open" } as const)
          : ({
              ...slot,
              source: "tidy_tails",
              reason: "Already booked in Tidy Tails",
            } as const),
      )
    : [];
  const slots = availability
    ? availability.slots.length
      ? availability.slots
      : fallbackSlots
    : [];
  const bookedTimes = date ? bookedTimesForDate(baseAppointments, date) : [];
  const dayFit =
    date && !dayLoadLoading
      ? assessDayFit({
          date,
          appointments: baseAppointments,
          pets: basePets,
          candidatePets: selectedPets.map((pet) => ({
            pet,
            serviceType: petServices[pet.id] ?? primaryServiceType,
          })),
          serviceType: primaryServiceType,
          calibration: scheduleCalibration,
          location,
        })
      : null;
  const customerLocation = customerLocationLabelFromSettings(
    location,
    locationSettings,
  );
  const bookingMessageTemplate =
    bookingMessageDraftKind === "first_platform"
      ? firstPlatformTextTemplate
      : bookingConfirmationTemplate;
  const defaultBookingMessage = (template = bookingMessageTemplate) =>
    renderBookingMessageTemplate(template, {
      ownerFirstName: client.first_name,
      petName: petNameList,
      date: date ? formatReviewDate(date) : "the selected date",
      time: time || null,
      service: selectedServiceLabels.length === 1 ? selectedServiceLabels[0] : null,
      location: customerLocation,
    });
  const currentBookingMessage = sendBookingText
    ? bookingMessage.trim() || defaultBookingMessage()
    : "";

  function onDraftKindChange(kind: BookingMessageDraftKind) {
    setBookingMessageDraftKind(kind);
    const template =
      kind === "first_platform"
        ? firstPlatformTextTemplate
        : bookingConfirmationTemplate;
    setBookingMessage(defaultBookingMessage(template));
  }

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    startAvailabilityTransition(() => {
      void checkBookingAvailability({ date, service_type: primaryServiceType }).then(
        (result) => {
          if (!cancelled) {
            setAvailabilityResult({ date, serviceType: primaryServiceType, result });
          }
        },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [date, primaryServiceType]);

  // TT-001: on date-select, load that date's full org-scoped day for the
  // capacity note + slot helpers. On failure, fall back to household-only data.
  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    startDayLoadTransition(() => {
      void getDayCapacity(date).then(
        (result) => {
          if (!cancelled) {
            setDayLoad(result);
            setDayLoadFailedDate((prev) => (prev === date ? null : prev));
          }
        },
        () => {
          if (!cancelled) setDayLoadFailedDate(date);
        },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [date]);

  function togglePet(id: string, checked: boolean) {
    setSelectedPetIds((current) => {
      if (checked) return Array.from(new Set([...current, id]));
      const next = current.filter((petId) => petId !== id);
      return next.length > 0 ? next : current;
    });
  }

  function toReview() {
    const bookingMessageForReview = sendBookingText
      ? bookingMessage.trim() || defaultBookingMessage()
      : "";
    const v = validateBookingInput({
      client_id: client.id,
      pet_id: primaryPet.id,
      pet_ids: selectedPetIds.join(","),
      pet_services: JSON.stringify(petServices),
      pet_fees: JSON.stringify(petFees),
      date,
      time_slot: time,
      service_type: primaryServiceType,
      location,
      send_invite: sendInvite ? "on" : "",
      customer_email: customerEmail,
      send_booking_text: sendBookingText ? "on" : "",
      booking_message: bookingMessageForReview,
      save_reminder_phone: saveReminderPhone ? "on" : "",
      customer_phone: customerPhone,
      fee: primaryFee,
      notes,
      salon_payout_override: salonPayoutOverride,
    });
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors({});
    if (sendBookingText && !bookingMessage.trim()) {
      setBookingMessage(bookingMessageForReview);
    }
    setStep("review");
  }

  // Terminal: the action ran — a demo dry-run, gated (no write), or saved.
  if (
    state.status === "demo" ||
    state.status === "gated" ||
    state.status === "saved"
  ) {
    return <ResultScreen state={state} onDone={onDone} />;
  }

  // Field-level errors come from the client-side review check; a server error
  // surfaces as a banner. The server's own field errors are unreachable in the
  // happy path (the review step runs the same validator first), so a generic
  // banner covers the rare case rather than re-mapping them onto fields.
  const formError =
    state.status === "error"
      ? (state.formError ?? "Please check the booking details and try again.")
      : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <SubmitDogOverlay label="Saving booking" show={pending} />
      <SubmitDogOverlay
        label="Checking calendar"
        show={Boolean(date) && (availabilityPending || !availability) && !pending}
      />
      {/* Hidden fields carry the current values into the server action,
          regardless of which step is visible. */}
      <input type="hidden" name="client_id" value={client.id} />
      <input type="hidden" name="pet_id" value={primaryPet.id} />
      <input type="hidden" name="pet_ids" value={selectedPetIds.join(",")} />
      <input type="hidden" name="pet_services" value={JSON.stringify(petServices)} />
      <input type="hidden" name="pet_fees" value={JSON.stringify(petFees)} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="time_slot" value={time} />
      <input type="hidden" name="service_type" value={primaryServiceType} />
      <input type="hidden" name="location" value={location} />
      <input type="hidden" name="send_invite" value={sendInvite ? "on" : ""} />
      <input type="hidden" name="customer_email" value={customerEmail} />
      <input
        type="hidden"
        name="send_booking_text"
        value={sendBookingText ? "on" : ""}
      />
      <input type="hidden" name="booking_message" value={currentBookingMessage} />
      <input
        type="hidden"
        name="save_reminder_phone"
        value={saveReminderPhone ? "on" : ""}
      />
      <input
        type="hidden"
        name="sms_consent"
        value={smsConsentChecked ? "on" : ""}
      />
      <input type="hidden" name="customer_phone" value={customerPhone} />
      <input type="hidden" name="fee" value={primaryFee} />
      <input type="hidden" name="notes" value={notes} />
      <input
        type="hidden"
        name="salon_payout_override"
        value={salonPayoutOverride}
      />

      <ModeNote mode={mode} writesEnabled={writesEnabled} />

      {formError ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {formError}
        </p>
      ) : null}

      {step === "form" ? (
        <>
          {pets.length > 1 ? (
            <Field
              label="Pets"
              error={errors.pet_id}
              hint="Select every dog coming at this drop-off time."
            >
              <div className="grid gap-2">
                {pets.map((p) => {
                  const checked = selectedPetIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-3 text-sm ${
                        checked
                          ? "border-brand bg-brand-soft text-brand-ink"
                          : "border-line bg-surface text-ink"
                      }`}
                    >
                      <span className="font-semibold">{p.name}</span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => togglePet(p.id, event.target.checked)}
                        className="h-4 w-4 accent-brand"
                      />
                    </label>
                  );
                })}
              </div>
            </Field>
          ) : (
            <p className="text-sm text-ink-soft">
              Pet:{" "}
              <span className="font-semibold text-ink">{primaryPet.name}</span>
            </p>
          )}

          <Field label="Date" error={errors.date}>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={fieldClass}
            />
          </Field>

          <Field
            label="Drop-off time"
            error={errors.time_slot}
            hint={
              date
                ? "Tap an open drop-off slot or type a custom time. Pickup is end of business day unless Sam says otherwise."
                : "Choose a date first to see open drop-off slots."
            }
          >
            {date && availability ? (
              <BookingTimeSlotPicker
                slots={slots}
                selectedTime={time}
                onSelect={(slotTime) => {
                  setTime(slotTime);
                  setErrors((current) => ({
                    ...current,
                    time_slot: undefined,
                  }));
                }}
              />
            ) : null}
            {date ? (
              <p
                className={`mb-2 rounded-lg px-3 py-2 text-xs font-medium ${
                  availability?.status === "failed"
                    ? "bg-danger-soft text-danger-ink"
                    : availability?.status === "ready"
                      ? "bg-brand-soft text-brand-ink"
                      : "bg-canvas text-ink-soft"
                }`}
              >
                {availabilityPending
                  ? "Checking Tidy Tails and Google Calendar for drop-off openings…"
                  : availability?.message ??
                    "Checking the full production book for open drop-off times."}
              </p>
            ) : null}
            {bookedTimes.length > 0 ? (
              <p className="mb-2 rounded-lg bg-warn-soft px-3 py-2 text-xs font-medium text-warn">
                Already booked that day: {bookedTimes.join(", ")}
              </p>
            ) : null}
            <input
              type="text"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              placeholder="e.g. 10:00am"
              className={fieldClass}
            />
          </Field>

          <Field
            label="Service and fee"
            error={errors.service_type ?? errors.fee}
            hint="Each selected dog will get its own appointment row for reports."
          >
            <div className="grid gap-2">
              {selectedPets.map((pet) => (
                <div
                  key={pet.id}
                  className="grid gap-2 rounded-lg border border-line bg-surface px-3.5 py-3"
                >
                  <p className="text-sm font-semibold text-ink">{pet.name}</p>
                  <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
                    <select
                      value={petServices[pet.id] ?? ""}
                      onChange={(e) =>
                        setPetServices((current) => ({
                          ...current,
                          [pet.id]: e.target.value as ServiceType | "",
                        }))
                      }
                      className={fieldClass}
                    >
                      <option value="">Not set</option>
                      {SERVICE_TYPES.map((code) => (
                        <option key={code} value={code}>
                          {serviceLabel(code)}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={petFees[pet.id] ?? ""}
                      onChange={(e) =>
                        setPetFees((current) => ({
                          ...current,
                          [pet.id]: e.target.value,
                        }))
                      }
                      placeholder="0.00"
                      className={fieldClass}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Field>

          {dayLoadLoading ? (
            <DayFitLoading />
          ) : dayFit ? (
            <DayFitCard assessment={dayFit} />
          ) : null}

          <Field
            label="Location"
            error={errors.location}
            hint="Used in the calendar event and customer reminder copy."
          >
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value as BookingLocation | "")}
              className={fieldClass}
            >
              <option value="">Not set yet</option>
              {BOOKING_LOCATIONS.map((code) => (
                <option key={code} value={code}>
                  {locationLabelFromSettings(code, locationSettings)}
                </option>
              ))}
            </select>
          </Field>

          {location ? (
            <Field
              label="Salon payout override %"
              error={errors.salon_payout_override}
              hint="Optional. Use only when Gina or Annette keeps a different percent for this booking."
            >
              <input
                type="text"
                inputMode="decimal"
                value={salonPayoutOverride}
                onChange={(e) => setSalonPayoutOverride(e.target.value)}
                placeholder="Leave blank for location default"
                className={fieldClass}
              />
            </Field>
          ) : null}

          <label className="flex items-start gap-2 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={sendInvite}
              onChange={(e) => setSendInvite(e.target.checked)}
              className="mt-1 h-4 w-4 accent-brand"
            />
            <span>
              <span className="font-semibold text-ink">Email calendar invite</span>
              <span className="block text-xs leading-relaxed">
                {client.email
                  ? "Send a Google Calendar invite when Sam confirms the booking."
                  : "Add an owner email here; it saves to this household for next time."}
              </span>
            </span>
          </label>
          {sendInvite ? (
            <Field label="Owner email" error={errors.customer_email}>
              <input
                type="email"
                inputMode="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="owner@example.com"
                className={fieldClass}
              />
            </Field>
          ) : null}

          {consentOnFile ? (
            <p className="rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm text-ink-soft">
              <span className="font-semibold text-ink">
                Texting consent on file.
              </span>{" "}
              This client has agreed to receive reminders and confirmations by
              text.
            </p>
          ) : (
            <label className="flex items-start gap-2 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink-soft">
              <input
                type="checkbox"
                checked={smsConsentChecked}
                onChange={(e) => {
                  setSmsConsentChecked(e.target.checked);
                  if (!e.target.checked) {
                    setSendBookingText(false);
                    setSaveReminderPhone(false);
                  }
                }}
                className="mt-1 h-4 w-4 accent-brand"
              />
              <span>
                <span className="font-semibold text-ink">
                  This client agreed to receive texts
                </span>
                <span className="block text-xs leading-relaxed">
                  They agreed to receive appointment reminders and confirmations
                  by text. Reply STOP opts out. Required before any text can be
                  sent — it&rsquo;s saved to the household.
                </span>
              </span>
            </label>
          )}

          <label
            className={`flex items-start gap-2 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink-soft ${
              hasTextConsent ? "" : "opacity-50"
            }`}
          >
            <input
              type="checkbox"
              checked={sendBookingText}
              disabled={!hasTextConsent}
              onChange={(e) => setSendBookingText(e.target.checked)}
              className="mt-1 h-4 w-4 accent-brand"
            />
            <span>
              <span className="font-semibold text-ink">
                Text booking info now
              </span>
              <span className="block text-xs leading-relaxed">
                {hasTextConsent
                  ? "Send one SMS with the booking date, time, service, and location after Sam confirms. Sam can edit the exact text on the review step."
                  : "Capture texting consent above to enable."}
              </span>
            </span>
          </label>

          <label
            className={`flex items-start gap-2 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink-soft ${
              hasTextConsent ? "" : "opacity-50"
            }`}
          >
            <input
              type="checkbox"
              checked={saveReminderPhone}
              disabled={!hasTextConsent}
              onChange={(e) => setSaveReminderPhone(e.target.checked)}
              className="mt-1 h-4 w-4 accent-brand"
            />
            <span>
              <span className="font-semibold text-ink">
                Use this phone for reminders
              </span>
              <span className="block text-xs leading-relaxed">
                {hasTextConsent
                  ? "Keep this number on the household so Sam can send appointment reminders later. Nothing sends from this option."
                  : "Capture texting consent above to enable."}
              </span>
            </span>
          </label>

          {sendBookingText || saveReminderPhone ? (
            <Field label="Customer phone" error={errors.customer_phone}>
              <input
                type="tel"
                inputMode="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="705-555-0100"
                className={fieldClass}
              />
            </Field>
          ) : null}

          <Field label="Notes (optional)" error={errors.notes}>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything to remember"
              className={fieldClass}
            />
          </Field>

          <button
            type="button"
            onClick={toReview}
            className="rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white active:bg-brand-ink"
          >
            Review booking
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-ink">
            This will create {selectedPets.length} appointment
            {selectedPets.length === 1 ? "" : "s"} for{" "}
            <span className="font-semibold">{petNameList}</span> under{" "}
            <span className="font-semibold">{ownerName}</span>.
          </p>

          <dl className="flex flex-col gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm">
            <ReviewRow label="Pets" value={petNameList} />
            <ReviewRow label="Date" value={formatReviewDate(date)} />
            <ReviewRow label="Drop-off" value={time || "No time set"} />
            <ReviewRow label="Service" value={reviewService} />
            <ReviewRow
              label="Location"
              value={
                location
                  ? customerLocationLabelFromSettings(location, locationSettings) ??
                    locationLabelFromSettings(location, locationSettings) ??
                    "Not set"
                  : "Not set"
              }
            />
            <ReviewRow
              label="Invite"
              value={sendInvite ? customerEmail.trim() || "Email needed" : "No email invite"}
            />
            <ReviewRow
              label="Booking text"
              value={
                sendBookingText
                  ? customerPhone.trim() || "Phone needed"
                  : "No booking text"
              }
            />
            <ReviewRow
              label="Reminder phone"
              value={
                saveReminderPhone
                  ? customerPhone.trim() || "Phone needed"
                  : "No reminder phone"
              }
            />
            <ReviewRow
              label="Fee"
              value={totalFee > 0 ? formatMoney(totalFee) : "No fee set"}
            />
            {salonPayoutOverride.trim() ? (
              <ReviewRow
                label="Salon payout"
                value={`Salon keeps ${salonPayoutOverride.trim()}% for this booking`}
              />
            ) : null}
            {notes.trim() ? <ReviewRow label="Notes" value={notes} /> : null}
          </dl>

          {sendBookingText ? (
            <Field
              label="Booking text to send"
              error={errors.booking_message}
              hint={`${currentBookingMessage.length}/480 characters. This is what the customer will receive if Sam confirms.`}
            >
              <select
                value={bookingMessageDraftKind}
                onChange={(event) =>
                  onDraftKindChange(event.target.value as BookingMessageDraftKind)
                }
                className={`${fieldClass} mb-2`}
              >
                <option value="booking_confirmation">
                  Booking confirmation
                </option>
                <option value="first_platform">First platform text</option>
              </select>
              <textarea
                value={currentBookingMessage}
                onChange={(event) => setBookingMessage(event.target.value)}
                rows={5}
                className={`${fieldClass} resize-none leading-relaxed`}
              />
            </Field>
          ) : null}

          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setStep("form")}
              disabled={pending}
              className="flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-base font-semibold text-ink-soft active:bg-canvas disabled:opacity-50"
            >
              Back to edit
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white active:bg-brand-ink disabled:opacity-50"
            >
              Confirm & save
            </button>
          </div>
        </>
      )}
    </form>
  );
}

// TT-001: shown while the whole day's load is loading, so the operator never
// sees the stale household-only count flash before the real number arrives.
function DayFitLoading() {
  return (
    <section className="rounded-xl bg-canvas px-3.5 py-3 text-sm text-ink-soft">
      <p className="font-semibold">Checking the whole day…</p>
      <p className="mt-1 leading-relaxed">
        Counting every dog already booked that day.
      </p>
    </section>
  );
}

function DayFitCard({ assessment }: { assessment: DayFitAssessment }) {
  const tone =
    assessment.status === "not_recommended" || assessment.status === "heavy"
      ? "bg-warn-soft text-warn"
      : assessment.status === "possible"
        ? "bg-canvas text-ink-soft"
        : "bg-brand-soft text-brand-ink";
  const headline =
    assessment.status === "not_recommended"
      ? "This looks like too much for the day"
      : assessment.status === "heavy"
        ? "This would make a heavy day"
        : assessment.status === "possible"
          ? "This looks possible, but worth checking"
          : "This day looks open";

  return (
    <section className={`rounded-xl px-3.5 py-3 text-sm ${tone}`}>
      <p className="font-semibold">{headline}</p>
      <p className="mt-1 leading-relaxed">
        With this booking: {assessment.projectedDogs} dog
        {assessment.projectedDogs === 1 ? "" : "s"} projected ·{" "}
        {assessment.projectedLargeDogs} large ·{" "}
        {assessment.projectedLoadPoints.toFixed(2).replace(/\.00$/, "")} load
        points.
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed">
        {assessment.messages.slice(0, 3).map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </section>
  );
}

function ModeNote({
  mode,
  writesEnabled,
}: {
  mode: "fixtures" | "live";
  writesEnabled: boolean;
}) {
  if (mode === "live") {
    if (writesEnabled) {
      return (
        <p className="rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-ink">
          Production mode — confirming will save the selected appointment rows.
        </p>
      );
    }
    return (
      <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs font-medium text-warn">
        Booking is not turned on yet. You can review the appointment, but it
        will not be saved.
      </p>
    );
  }
  return (
    <p className="rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-ink">
      Demo mode — this is anonymized practice data. Confirming will not save
      anything.
    </p>
  );
}

function ResultScreen({
  state,
  onDone,
}: {
  state: Extract<BookingState, { status: "demo" | "gated" | "saved" }>;
  onDone: (options?: { markPriorOutboundSms?: boolean }) => void;
}) {
  const { summary } = state;
  const saved = state.status === "saved";
  const headline =
    state.status === "demo"
      ? "Demo only — nothing was saved"
      : state.status === "saved"
        ? "Saved — appointment booked"
        : "Not saved — live writes are switched off";
  const detail =
    state.status === "demo"
      ? "This is anonymized practice data, so the booking was not stored. The whole flow above is real — it starts saving once live writes are enabled."
      : state.status === "saved"
        ? `The appointment is now on ${summary.ownerName}'s file.`
        : state.message;

  return (
    <div className="flex flex-col gap-3.5">
      <div
        className={`flex gap-2.5 rounded-xl p-3.5 ${
          saved ? "bg-brand-soft text-brand-ink" : "bg-warn-soft text-warn"
        }`}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 shrink-0"
          aria-hidden="true"
        >
          {saved ? (
            <>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </>
          ) : (
            <>
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </>
          )}
        </svg>
        <div>
          <p className="text-sm font-semibold">{headline}</p>
          <p className="mt-0.5 text-xs leading-relaxed">{detail}</p>
        </div>
      </div>

      <p className="text-sm text-ink-soft">
        The booking reviewed was for{" "}
        <span className="font-semibold text-ink">{summary.petName}</span> under{" "}
        <span className="font-semibold text-ink">{summary.ownerName}</span>.
      </p>

      <dl className="flex flex-col gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm">
        <ReviewRow label="Date" value={formatReviewDate(summary.date)} />
        <ReviewRow label="Drop-off" value={summary.time ?? "No time set"} />
        <ReviewRow label="Service" value={summary.service ?? "Not set"} />
        <ReviewRow label="Location" value={summary.location ?? "Not set"} />
        <ReviewRow
          label="Invite"
          value={summary.customerInvite ?? "No email invite"}
        />
        <ReviewRow
          label="Booking text"
          value={summary.bookingText ?? "No booking text"}
        />
        <ReviewRow
          label="Reminder phone"
          value={summary.reminderPhone ?? "No reminder phone"}
        />
        <ReviewRow
          label="Fee"
          value={summary.fee != null ? formatMoney(summary.fee) : "No fee set"}
        />
      </dl>

      {saved && summary.calendar ? (
        <p
          className={`rounded-lg px-3 py-2 text-xs font-medium ${
            summary.calendar.status === "synced"
              ? "bg-brand-soft text-brand-ink"
              : "bg-warn-soft text-warn"
          }`}
        >
          {summary.calendar.message}
        </p>
      ) : null}

      {saved && summary.bookingTextSend ? (
        <p
          className={`rounded-lg px-3 py-2 text-xs font-medium ${
            summary.bookingTextSend.status === "sent" ||
            summary.bookingTextSend.status === "skipped"
              ? "bg-brand-soft text-brand-ink"
              : "bg-warn-soft text-warn"
          }`}
        >
          {summary.bookingTextSend.message}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() =>
          onDone({
            markPriorOutboundSms:
              state.status === "saved" &&
              summary.bookingTextSend?.status === "sent",
          })
        }
        className="rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white active:bg-brand-ink"
      >
        Done
      </button>
    </div>
  );
}


function bookingDefaults(
  pet: Pet,
  appointments: Appointment[],
): { serviceType: ServiceType | ""; fee: string } {
  const petAppointments = appointments.filter((a) => a.pet_id === pet.id);
  const recentPrice = lastKnownPrice(petAppointments);
  const recentService = lastKnownService(petAppointments);
  return {
    serviceType: serviceCodeFromLabel(recentService),
    fee:
      recentPrice != null
        ? String(recentPrice)
        : pet.typical_fee != null
          ? String(pet.typical_fee)
          : "",
  };
}
