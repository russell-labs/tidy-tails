"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  checkBookingAvailability,
  type BookingAvailabilityState,
} from "@/lib/actions/availability";
import { createBooking, type BookingState } from "@/lib/actions/appointments";
import {
  availableBookingTimeSlots,
  BOOKING_LOCATIONS,
  bookingLocationLabel,
  bookedTimesForDate,
  SERVICE_TYPES,
  validateBookingInput,
  type BookingLocation,
  type BookingErrors,
  type ServiceType,
} from "@/lib/booking";
import { lastKnownPrice, lastKnownService } from "@/lib/derive";
import { serviceLabel } from "@/lib/data/live";
import type { Appointment, Client, Pet } from "@/lib/data/types";
import { formatMoney, formatReviewDate, fullName } from "@/lib/format";
import { Sheet } from "./Sheet";
import { SubmitDog } from "./SubmitDog";

// M2 — "Add appointment" booking flow: form → review → result. The wedge
// becomes Call/Text → Identify → Add Booking. Nothing is persisted in this
// ship: fixture mode is a dry-run, live mode is gated (see lib/actions).

const fieldClass =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-ink-faint";
const labelClass = "text-sm font-medium text-ink-soft";

export function AddAppointment({
  client,
  pets,
  appointments,
  mode,
  writesEnabled,
}: {
  client: Client;
  pets: Pet[];
  appointments: Appointment[];
  mode: "fixtures" | "live";
  writesEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Remount the form on each close so a reopened sheet starts fresh.
  const [formKey, setFormKey] = useState(0);

  // No pet, nothing to book — the household needs a pet first.
  if (pets.length === 0) return null;

  function close() {
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
  onDone,
}: {
  client: Client;
  pets: Pet[];
  appointments: Appointment[];
  mode: "fixtures" | "live";
  writesEnabled: boolean;
  onDone: () => void;
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

  const [petId, setPetId] = useState(pets[0].id);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const initialDefaults = bookingDefaults(pets[0], appointments);
  const [serviceType, setServiceType] = useState(initialDefaults.serviceType);
  const [location, setLocation] = useState<BookingLocation | "">("");
  const [sendInvite, setSendInvite] = useState(Boolean(client.email));
  const [customerEmail, setCustomerEmail] = useState(client.email ?? "");
  const [sendSms, setSendSms] = useState(Boolean(client.phone));
  const [customerPhone, setCustomerPhone] = useState(client.phone);
  const [fee, setFee] = useState(initialDefaults.fee);
  const [notes, setNotes] = useState("");
  const [availabilityResult, setAvailabilityResult] = useState<{
    date: string;
    serviceType: ServiceType | "";
    result: BookingAvailabilityState;
  } | null>(null);
  const [availabilityPending, startAvailabilityTransition] = useTransition();

  const selectedPet = pets.find((p) => p.id === petId) ?? pets[0];
  const ownerName = fullName(client.first_name, client.last_name);
  const availability =
    availabilityResult?.date === date &&
    availabilityResult.serviceType === serviceType
      ? availabilityResult.result
      : null;
  const fallbackSlots = date
    ? availableBookingTimeSlots(appointments, date).map((slot) =>
        slot.available
          ? ({ ...slot, source: "open" } as const)
          : ({
              ...slot,
              source: "tidy_tails",
              reason: "Already booked in Tidy Tails",
            } as const),
      )
    : [];
  const slots = availability?.slots.length ? availability.slots : fallbackSlots;
  const bookedTimes = date ? bookedTimesForDate(appointments, date) : [];

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    startAvailabilityTransition(() => {
      void checkBookingAvailability({ date, service_type: serviceType }).then(
        (result) => {
          if (!cancelled) setAvailabilityResult({ date, serviceType, result });
        },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [date, serviceType]);

  function onPetChange(id: string) {
    setPetId(id);
    const p = pets.find((x) => x.id === id);
    if (!p) return;
    const defaults = bookingDefaults(p, appointments);
    setServiceType(defaults.serviceType);
    setFee(defaults.fee);
  }

  function toReview() {
    const v = validateBookingInput({
      client_id: client.id,
      pet_id: petId,
      date,
      time_slot: time,
      service_type: serviceType,
      location,
      send_invite: sendInvite ? "on" : "",
      customer_email: customerEmail,
      send_sms: sendSms ? "on" : "",
      customer_phone: customerPhone,
      fee,
      notes,
    });
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors({});
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
      {/* Hidden fields carry the current values into the server action,
          regardless of which step is visible. */}
      <input type="hidden" name="client_id" value={client.id} />
      <input type="hidden" name="pet_id" value={petId} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="time_slot" value={time} />
      <input type="hidden" name="service_type" value={serviceType} />
      <input type="hidden" name="location" value={location} />
      <input type="hidden" name="send_invite" value={sendInvite ? "on" : ""} />
      <input type="hidden" name="customer_email" value={customerEmail} />
      <input type="hidden" name="send_sms" value={sendSms ? "on" : ""} />
      <input type="hidden" name="customer_phone" value={customerPhone} />
      <input type="hidden" name="fee" value={fee} />
      <input type="hidden" name="notes" value={notes} />

      <ModeNote mode={mode} writesEnabled={writesEnabled} />

      {formError ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {formError}
        </p>
      ) : null}

      {step === "form" ? (
        <>
          {pets.length > 1 ? (
            <Field label="Pet" error={errors.pet_id}>
              <select
                value={petId}
                onChange={(e) => onPetChange(e.target.value)}
                className={fieldClass}
              >
                {pets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <p className="text-sm text-ink-soft">
              Pet:{" "}
              <span className="font-semibold text-ink">{selectedPet.name}</span>
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
            label="Time"
            error={errors.time_slot}
            hint={
              date
                ? "Tap an open slot or type a custom time."
                : "Choose a date first to see open slots."
            }
          >
            {date ? (
              <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {slots.map((slot) => (
                  <button
                    key={slot.time}
                    type="button"
                    onClick={() => {
                      if (!slot.available) return;
                      setTime(slot.time);
                      setErrors((current) => ({
                        ...current,
                        time_slot: undefined,
                      }));
                    }}
                    disabled={!slot.available}
                    aria-pressed={time === slot.time}
                    className={`rounded-lg border px-2.5 py-2 text-sm font-semibold ${
                      time === slot.time
                        ? "border-brand bg-brand text-white"
                        : slot.available
                          ? "border-line bg-surface text-ink active:bg-brand-soft"
                          : "border-line bg-canvas text-ink-faint line-through"
                    }`}
                  >
                    <span>{slot.time}</span>
                    {!slot.available ? (
                      <span className="ml-1 text-[10px] font-medium no-underline">
                        Busy
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
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
                  ? "Checking Tidy Tails and Google Calendar…"
                  : availability?.message ??
                    "Checking the full production book for open times."}
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
              placeholder="e.g. 10:00am or morning"
              className={fieldClass}
            />
          </Field>

          <Field label="Service" error={errors.service_type}>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value as ServiceType | "")}
              className={fieldClass}
            >
              <option value="">Not set</option>
              {SERVICE_TYPES.map((code) => (
                <option key={code} value={code}>
                  {serviceLabel(code)}
                </option>
              ))}
            </select>
          </Field>

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
                  {bookingLocationLabel(code)}
                </option>
              ))}
            </select>
          </Field>

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

          <label className="flex items-start gap-2 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={sendSms}
              onChange={(e) => setSendSms(e.target.checked)}
              className="mt-1 h-4 w-4 accent-brand"
            />
            <span>
              <span className="font-semibold text-ink">Text reminder</span>
              <span className="block text-xs leading-relaxed">
                Save the reminder phone now; Twilio will use it when SMS sending is on.
              </span>
            </span>
          </label>
          {sendSms ? (
            <Field label="Reminder phone" error={errors.customer_phone}>
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

          <Field label="Fee" error={errors.fee} hint="Prefilled from the pet's last charged fee when available.">
            <input
              type="text"
              inputMode="decimal"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="0.00"
              className={fieldClass}
            />
          </Field>

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
            This will create one appointment for{" "}
            <span className="font-semibold">{selectedPet.name}</span> under{" "}
            <span className="font-semibold">{ownerName}</span>.
          </p>

          <dl className="flex flex-col gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm">
            <ReviewRow label="Date" value={formatReviewDate(date)} />
            <ReviewRow label="Time" value={time || "No time set"} />
            <ReviewRow
              label="Service"
              value={serviceType ? serviceLabel(serviceType) ?? "Not set" : "Not set"}
            />
            <ReviewRow
              label="Location"
              value={location ? bookingLocationLabel(location) ?? "Not set" : "Not set"}
            />
            <ReviewRow
              label="Invite"
              value={sendInvite ? customerEmail.trim() || "Email needed" : "No email invite"}
            />
            <ReviewRow
              label="Text"
              value={sendSms ? customerPhone.trim() || "Phone needed" : "No text reminder"}
            />
            <ReviewRow
              label="Fee"
              value={fee.trim() ? formatMoney(Number(fee)) : "No fee set"}
            />
            {notes.trim() ? <ReviewRow label="Notes" value={notes} /> : null}
          </dl>

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
              {pending ? <SubmitDog label="Saving" /> : "Confirm & save"}
            </button>
          </div>
        </>
      )}
    </form>
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
          Production mode — confirming will save one appointment.
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
  onDone: () => void;
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
        <ReviewRow label="Time" value={summary.time ?? "No time set"} />
        <ReviewRow label="Service" value={summary.service ?? "Not set"} />
        <ReviewRow label="Location" value={summary.location ?? "Not set"} />
        <ReviewRow
          label="Invite"
          value={summary.customerInvite ?? "No email invite"}
        />
        <ReviewRow
          label="Text"
          value={summary.textReminder ?? "No text reminder"}
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

      <button
        type="button"
        onClick={onDone}
        className="rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white active:bg-brand-ink"
      >
        Done
      </button>
    </div>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={labelClass}>{label}</span>
      {children}
      {hint ? <span className="text-xs text-ink-faint">{hint}</span> : null}
      {error ? <span className="text-xs text-danger-ink">{error}</span> : null}
    </label>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
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

function serviceCodeFromLabel(label: string | null): ServiceType | "" {
  if (!label) return "";
  const match = SERVICE_TYPES.find((code) => serviceLabel(code) === label);
  return match ?? "";
}
