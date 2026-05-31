"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  checkBookingAvailability,
  type BookingAvailabilityState,
} from "@/lib/actions/availability";
import {
  deleteAppointment,
  editAppointment,
  type DeleteAppointmentState,
  type EditAppointmentState,
} from "@/lib/actions/editAppointment";
import {
  availableBookingTimeSlots,
  BOOKING_LOCATIONS,
  bookedTimesForDate,
  SERVICE_TYPES,
  type BookingLocation,
  type ServiceType,
} from "@/lib/booking";
import type { Appointment } from "@/lib/data/types";
import {
  parseAppointmentWorkflowMarker,
  stripAppointmentWorkflowMarker,
  withAppointmentWorkflowMarker,
} from "@/lib/appointmentWorkflow";
import {
  appointmentDeleteKind,
  buildBookingUpdateTextMessage,
  buildCancellationTextMessage,
  validateEditAppointment,
  type EditAppointmentErrors,
} from "@/lib/editAppointment";
import { formatMoney } from "@/lib/format";
import { locationLabelFromSettings } from "@/lib/locationFinance";
import type { LocationSettingsMap } from "@/lib/operatorSettings";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  parsePaymentInfo,
  paymentLabel,
  stripPaymentInfo,
  type PaymentMethod,
  type PaymentStatus,
} from "@/lib/payments";
import {
  parseSalonPayoutOverride,
  stripSalonPayoutOverride,
} from "@/lib/payoutOverride";
import { BookingTimeSlotPicker } from "./BookingTimeSlotPicker";
import { Sheet } from "./Sheet";
import { SubmitDogOverlay } from "./SubmitDog";

const fieldClass =
  "w-full min-w-0 max-w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-ink-faint";
const labelClass = "text-sm font-medium text-ink-soft";

const SERVICE_LABELS: Record<ServiceType, string> = {
  full_groom: "Full groom",
  puppy_groom: "Puppy groom",
  bath_only: "Bath only",
  nail_trim: "Nail trim",
  other: "Other",
};

function serviceCodeFromLabel(label: string | null): ServiceType | "" {
  const found = SERVICE_TYPES.find((code) => SERVICE_LABELS[code] === label);
  return found ?? "";
}

export function EditAppointment({
  clientId,
  appointment,
  appointments = [appointment],
  petName,
  ownerFirstName,
  customerPhone,
  mode,
  writesEnabled,
  locationSettings,
  trigger,
}: {
  clientId: string;
  appointment: Appointment;
  appointments?: Appointment[];
  petName?: string;
  ownerFirstName?: string | null;
  customerPhone?: string;
  mode: "fixtures" | "live";
  writesEnabled: boolean;
  locationSettings: LocationSettingsMap;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  function close() {
    setOpen(false);
    setFormKey((k) => k + 1);
  }

  return (
    <>
      {trigger ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") setOpen(true);
          }}
          className="block w-full cursor-pointer text-left active:bg-brand-soft"
        >
          {trigger}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-brand active:bg-brand-soft"
        >
          Edit visit
        </button>
      )}
      <Sheet open={open} onClose={close} title="Edit visit">
        <EditAppointmentForm
          key={formKey}
          clientId={clientId}
          appointment={appointment}
          appointments={appointments}
          petName={petName}
          ownerFirstName={ownerFirstName}
          customerPhone={customerPhone}
          mode={mode}
          writesEnabled={writesEnabled}
          locationSettings={locationSettings}
          onDone={close}
        />
      </Sheet>
    </>
  );
}

function EditAppointmentForm({
  clientId,
  appointment,
  appointments,
  petName,
  ownerFirstName,
  customerPhone,
  mode,
  writesEnabled,
  locationSettings,
  onDone,
}: {
  clientId: string;
  appointment: Appointment;
  appointments: Appointment[];
  petName?: string;
  ownerFirstName?: string | null;
  customerPhone?: string;
  mode: "fixtures" | "live";
  writesEnabled: boolean;
  locationSettings: LocationSettingsMap;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<
    EditAppointmentState,
    FormData
  >(editAppointment, { status: "idle" });
  const [deleteState, deleteAction, deletePending] = useActionState<
    DeleteAppointmentState,
    FormData
  >(deleteAppointment, { status: "idle" });
  const [step, setStep] = useState<"form" | "review">("form");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errors, setErrors] = useState<EditAppointmentErrors>({});
  const [date, setDate] = useState(appointment.date);
  const [time, setTime] = useState(appointment.time_slot ?? "");
  const [serviceType, setServiceType] = useState(
    serviceCodeFromLabel(appointment.service),
  );
  const [location, setLocation] = useState<BookingLocation | "">(
    (appointment.location === "gina" || appointment.location === "annette"
      ? appointment.location
      : "") as BookingLocation | "",
  );
  const [fee, setFee] = useState(
    appointment.price != null ? String(appointment.price) : "",
  );
  const [tip, setTip] = useState(
    appointment.tip != null ? String(appointment.tip) : "",
  );
  const initialPayment = parsePaymentInfo(appointment.notes);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    initialPayment.method ?? "cash",
  );
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(
    initialPayment.status ?? "paid",
  );
  const workflowMarker = parseAppointmentWorkflowMarker(appointment.notes);
  const [notes, setNotes] = useState(
    stripAppointmentWorkflowMarker(
      stripSalonPayoutOverride(stripPaymentInfo(appointment.notes)),
    ) ?? "",
  );
  const [salonPayoutOverride, setSalonPayoutOverride] = useState(
    parseSalonPayoutOverride(appointment.notes)?.toString() ?? "",
  );
  const [sendBookingUpdateText, setSendBookingUpdateText] = useState(false);
  const [bookingUpdateMessage, setBookingUpdateMessage] = useState("");
  const deleteKind = appointmentDeleteKind({
    status: appointment.status,
    date: appointment.date,
    today: todayISO(),
  });
  const canDeleteAppointment = deleteKind !== "disabled";
  const [sendCancellationText, setSendCancellationText] = useState(false);
  const [cancellationMessage, setCancellationMessage] = useState(
    buildCancellationTextMessage({
      ownerFirstName: null,
      petName: petName ?? "the pet",
      date: appointment.date,
      time: appointment.time_slot,
    }),
  );
  const [availabilityResult, setAvailabilityResult] = useState<{
    date: string;
    serviceType: ServiceType | "";
    result: BookingAvailabilityState;
  } | null>(null);
  const [availabilityPending, startAvailabilityTransition] = useTransition();

  const availability =
    availabilityResult?.date === date &&
    availabilityResult.serviceType === serviceType
      ? availabilityResult.result
      : null;
  const comparableAppointments = appointments.filter((a) => a.id !== appointment.id);
  const fallbackSlots = date
    ? availableBookingTimeSlots(comparableAppointments, date).map((slot) =>
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
  const bookedTimes = date ? bookedTimesForDate(comparableAppointments, date) : [];
  const serviceLabel =
    serviceType ? (SERVICE_LABELS[serviceType as ServiceType] ?? null) : null;
  const customerLocation = location
    ? locationLabelFromSettings(location, locationSettings)
    : null;
  const defaultBookingUpdateMessage = () =>
    buildBookingUpdateTextMessage({
      ownerFirstName: ownerFirstName ?? null,
      petName: petName ?? "the pet",
      date,
      time: time.trim() || null,
      service: serviceLabel,
      location: customerLocation,
    });
  const currentBookingUpdateMessage = sendBookingUpdateText
    ? bookingUpdateMessage.trim() || defaultBookingUpdateMessage()
    : "";

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    startAvailabilityTransition(() => {
      void checkBookingAvailability({
        date,
        service_type: serviceType as ServiceType | "",
        exclude_appointment_id: appointment.id,
      }).then((result) => {
        if (!cancelled) setAvailabilityResult({ date, serviceType, result });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [appointment.id, date, serviceType]);

  function toReview() {
    const validation = validateEditAppointment({
      client_id: clientId,
      appointment_id: appointment.id,
      date,
      time_slot: time,
      service_type: serviceType,
      location,
      fee,
      tip,
      payment_method: paymentMethod,
      payment_status: paymentStatus,
      notes,
      salon_payout_override: salonPayoutOverride,
    });
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    setErrors({});
    setStep("review");
  }

  if (
    state.status === "demo" ||
    state.status === "gated" ||
    state.status === "saved"
  ) {
    return <ResultScreen state={state} onDone={onDone} />;
  }
  if (
    deleteState.status === "demo" ||
    deleteState.status === "gated" ||
    deleteState.status === "deleted"
  ) {
    return <DeleteResultScreen state={deleteState} onDone={onDone} />;
  }

  const formError =
    state.status === "error"
      ? (state.formError ?? "Please check the visit details and try again.")
      : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <SubmitDogOverlay
        label={deletePending ? "Deleting booking" : "Saving changes"}
        show={pending || deletePending}
      />
      <SubmitDogOverlay
        label="Checking calendar"
        show={
          Boolean(date) &&
          (availabilityPending || !availability) &&
          !pending &&
          !deletePending
        }
      />
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="appointment_id" value={appointment.id} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="time_slot" value={time} />
      <input type="hidden" name="service_type" value={serviceType} />
      <input type="hidden" name="location" value={location} />
      <input type="hidden" name="fee" value={fee} />
      <input type="hidden" name="tip" value={tip} />
      <input type="hidden" name="payment_method" value={paymentMethod} />
      <input type="hidden" name="payment_status" value={paymentStatus} />
      <input
        type="hidden"
        name="notes"
        value={withAppointmentWorkflowMarker(notes, workflowMarker) ?? ""}
      />
      <input
        type="hidden"
        name="salon_payout_override"
        value={salonPayoutOverride}
      />
      <input
        type="hidden"
        name="send_booking_update_text"
        value={sendBookingUpdateText ? "on" : ""}
      />
      <input
        type="hidden"
        name="booking_update_message"
        value={currentBookingUpdateMessage}
      />
      <input
        type="hidden"
        name="send_cancellation_text"
        value={sendCancellationText ? "on" : ""}
      />
      <input type="hidden" name="cancellation_message" value={cancellationMessage} />

      <ModeNote mode={mode} writesEnabled={writesEnabled} />

      {formError ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {formError}
        </p>
      ) : null}
      {deleteState.status === "error" ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {deleteState.message}
        </p>
      ) : null}

      {step === "form" ? (
        <>
          <p className="text-sm text-ink-soft">
            Update visit details for{" "}
            <span className="font-semibold text-ink">{petName ?? "this pet"}</span>.
          </p>
          <Field label="Date" error={errors.date}>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="Drop-off time" error={errors.time_slot}>
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
                  ? "Checking Tidy Tails and Google Calendar for drop-off openings..."
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
              placeholder="e.g. 10:30am"
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
                  {SERVICE_LABELS[code]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Location" error={errors.location}>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value as BookingLocation | "")}
              className={fieldClass}
            >
              <option value="">Not set</option>
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
            >
              <span className="text-xs leading-relaxed text-ink-soft">
                Optional. Use only when Gina or Annette keeps a different percent for this visit.
              </span>
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
          <Field label="Fee" error={errors.fee}>
            <input
              type="text"
              inputMode="decimal"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="0.00"
              className={fieldClass}
            />
          </Field>
          <Field label="Tip" error={errors.tip}>
            <input
              type="text"
              inputMode="decimal"
              value={tip}
              onChange={(e) => setTip(e.target.value)}
              placeholder="0.00"
              className={fieldClass}
            />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className={labelClass}>Payment</legend>
            <div className="grid grid-cols-2 gap-2">
              <ChoiceButton
                active={paymentStatus === "paid"}
                onClick={() => setPaymentStatus("paid")}
              >
                Paid
              </ChoiceButton>
              <ChoiceButton
                active={paymentStatus === "waiting"}
                onClick={() => setPaymentStatus("waiting")}
              >
                Waiting
              </ChoiceButton>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHODS.map((method) => (
                <ChoiceButton
                  key={method}
                  active={paymentMethod === method}
                  onClick={() => setPaymentMethod(method)}
                  disabled={paymentStatus === "waiting"}
                >
                  {PAYMENT_METHOD_LABELS[method]}
                </ChoiceButton>
              ))}
            </div>
          </fieldset>
          <Field label="Notes" error={errors.notes}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Cut notes, changes, anything useful"
              className={`${fieldClass} min-h-28 resize-none`}
            />
          </Field>
          {customerPhone ? (
            <label className="flex items-start gap-2 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink-soft">
              <input
                type="checkbox"
                checked={sendBookingUpdateText}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSendBookingUpdateText(checked);
                  if (checked && !bookingUpdateMessage.trim()) {
                    setBookingUpdateMessage(defaultBookingUpdateMessage());
                  }
                }}
                className="mt-1 h-4 w-4 accent-brand"
              />
              <span>
                <span className="font-semibold text-ink">
                  Text updated booking to owner
                </span>
                <span className="block text-xs leading-relaxed">
                  Sam reviews the updated date, time, service, and location
                  before anything sends.
                </span>
              </span>
            </label>
          ) : null}
          <button
            type="button"
            onClick={toReview}
            className="rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white active:bg-brand-ink"
          >
            Review changes
          </button>
          {canDeleteAppointment ? (
            <div className="rounded-xl border border-line bg-surface p-3">
              {confirmDelete ? (
                <div className="flex flex-col gap-2.5">
                  <p className="text-sm font-semibold text-danger-ink">
                    {deleteKind === "future_booking"
                      ? "Delete this booking?"
                      : "Delete this past visit?"}
                  </p>
                  <p className="text-xs leading-relaxed text-ink-soft">
                    {deleteKind === "future_booking"
                      ? "This removes it from Tidy Tails, removes the linked Google Calendar event when one exists, and can text the owner a cancellation note."
                      : "This permanently removes the groom from Tidy Tails history and reports. Use this only for a mistaken duplicate or wrong entry."}
                  </p>
                  {deleteKind === "future_booking" ? (
                    <div className="rounded-lg border border-line bg-canvas px-3 py-2">
                      {customerPhone ? (
                        <>
                          <label className="flex items-start gap-2 text-sm text-ink-soft">
                            <input
                              type="checkbox"
                              checked={sendCancellationText}
                              onChange={(event) =>
                                setSendCancellationText(event.target.checked)
                              }
                              className="mt-1 h-4 w-4 accent-brand"
                            />
                            <span>
                              <span className="font-semibold text-ink">
                                Text cancellation to owner
                              </span>
                              <span className="block text-xs">
                                Sam can edit this before deleting.
                              </span>
                            </span>
                          </label>
                          {sendCancellationText ? (
                            <textarea
                              value={cancellationMessage}
                              onChange={(event) =>
                                setCancellationMessage(event.target.value)
                              }
                              rows={4}
                              className={`${fieldClass} mt-2 resize-none text-sm leading-relaxed`}
                            />
                          ) : null}
                        </>
                      ) : (
                        <p className="text-xs leading-relaxed text-warn">
                          No household phone is on file, so no cancellation text
                          can be sent.
                        </p>
                      )}
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      disabled={deletePending}
                      className="flex-1 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-soft"
                    >
                      Keep it
                    </button>
                    <button
                      type="submit"
                      formAction={deleteAction}
                      disabled={deletePending}
                      className="flex-1 rounded-lg bg-danger-ink px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {deleteKind === "future_booking"
                        ? "Delete booking"
                        : "Delete visit"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="w-full rounded-lg border border-danger-ink px-3 py-2 text-sm font-semibold text-danger-ink active:bg-danger-soft"
                >
                  {deleteKind === "future_booking"
                    ? "Delete booking"
                    : "Delete past visit"}
                </button>
              )}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p className="text-sm text-ink">Review this visit update.</p>
          <dl className="flex flex-col gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm">
            <ReviewRow label="Date" value={date} />
            <ReviewRow label="Drop-off" value={time.trim() || "Not set"} />
            <ReviewRow
              label="Service"
              value={
                serviceType
                  ? (SERVICE_LABELS[serviceType as ServiceType] ?? "Not set")
                  : "Not set"
              }
            />
            <ReviewRow
              label="Location"
              value={
                location
                  ? locationLabelFromSettings(location, locationSettings) ??
                    "Not set"
                  : "Not set"
              }
            />
            <ReviewRow label="Fee" value={fee ? formatMoney(Number(fee)) : "Not set"} />
            <ReviewRow label="Tip" value={tip ? formatMoney(Number(tip)) : "Not set"} />
            {salonPayoutOverride.trim() ? (
              <ReviewRow
                label="Salon payout"
                value={`Salon keeps ${salonPayoutOverride.trim()}% for this visit`}
              />
            ) : null}
            <ReviewRow
              label="Payment"
              value={paymentLabel({
                method: paymentMethod,
                status: paymentStatus,
              })}
            />
            <ReviewRow label="Notes" value={notes.trim() || "Not set"} />
          </dl>
          {sendBookingUpdateText ? (
            <Field label="Booking update text to send">
              <textarea
                value={currentBookingUpdateMessage}
                onChange={(event) => setBookingUpdateMessage(event.target.value)}
                rows={5}
                className={`${fieldClass} resize-none text-sm leading-relaxed`}
              />
              <span className="text-xs text-ink-faint">
                {currentBookingUpdateMessage.length}/480 characters. This sends
                only after Sam confirms.
              </span>
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

function ModeNote({
  mode,
  writesEnabled,
}: {
  mode: "fixtures" | "live";
  writesEnabled: boolean;
}) {
  if (mode === "fixtures") {
    return (
      <p className="rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-ink">
        Demo mode - confirming will not save anything.
      </p>
    );
  }
  return (
    <p
      className={`rounded-lg px-3 py-2 text-xs font-medium ${
        writesEnabled ? "bg-brand-soft text-brand-ink" : "bg-warn-soft text-warn"
      }`}
    >
      {writesEnabled
        ? "Production mode - confirming will update this visit."
        : "Production mode - the server will confirm the write gate before saving."}
    </p>
  );
}

function ResultScreen({
  state,
  onDone,
}: {
  state: Extract<EditAppointmentState, { status: "demo" | "gated" | "saved" }>;
  onDone: () => void;
}) {
  const headline =
    state.status === "saved"
      ? "Saved - visit updated"
      : state.status === "demo"
        ? "Demo only - nothing was saved"
        : "Not saved - visit editing is switched off";
  const tone =
    state.status === "saved"
      ? "bg-brand-soft text-brand-ink"
      : "bg-warn-soft text-warn";
  return (
    <div className="flex flex-col gap-3.5">
      <div className={`rounded-xl p-3.5 ${tone}`}>
        <p className="text-sm font-semibold">{headline}</p>
        <p className="mt-0.5 text-xs leading-relaxed">
          {state.status === "saved"
            ? `${state.summary.petName} · ${state.summary.date}`
            : "Nothing was written."}
        </p>
      </div>
      {state.status === "saved" && state.summary.calendar ? (
        <p
          className={`rounded-lg px-3 py-2 text-xs font-medium ${
            state.summary.calendar.status === "synced"
              ? "bg-brand-soft text-brand-ink"
              : "bg-warn-soft text-warn"
          }`}
        >
          {state.summary.calendar.message}
        </p>
      ) : null}
      {"bookingUpdateText" in state && state.bookingUpdateText ? (
        <p
          className={`rounded-lg px-3 py-2 text-xs font-medium ${
            state.bookingUpdateText.status === "sent" ||
            state.bookingUpdateText.status === "skipped"
              ? "bg-brand-soft text-brand-ink"
              : "bg-warn-soft text-warn"
          }`}
        >
          {state.bookingUpdateText.message}
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

function DeleteResultScreen({
  state,
  onDone,
}: {
  state: Extract<DeleteAppointmentState, { status: "demo" | "gated" | "deleted" }>;
  onDone: () => void;
}) {
  const deleted = state.status === "deleted";
  const headline =
    state.status === "deleted"
      ? "Deleted - booking removed"
      : state.status === "demo"
        ? "Demo only - nothing was deleted"
        : "Not deleted - booking deletion is switched off";
  return (
    <div className="flex flex-col gap-3.5">
      <div
        className={`rounded-xl p-3.5 ${
          deleted ? "bg-brand-soft text-brand-ink" : "bg-warn-soft text-warn"
        }`}
      >
        <p className="text-sm font-semibold">{headline}</p>
        <p className="mt-0.5 text-xs leading-relaxed">
          {state.message ?? "Nothing was written."}
        </p>
      </div>
      <p className="text-sm text-ink-soft">
        The booking was for{" "}
        <span className="font-semibold text-ink">{state.summary.petName}</span> under{" "}
        <span className="font-semibold text-ink">{state.summary.ownerName}</span>.
      </p>
      <dl className="flex flex-col gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm">
        <ReviewRow label="Date" value={state.summary.date} />
        <ReviewRow label="Drop-off" value={state.summary.time ?? "Not set"} />
        <ReviewRow label="Service" value={state.summary.service ?? "Not set"} />
        <ReviewRow label="Location" value={state.summary.location ?? "Not set"} />
        <ReviewRow
          label="Fee"
          value={
            state.summary.fee != null
              ? formatMoney(state.summary.fee)
              : "Not set"
          }
        />
        <ReviewRow
          label="Payment"
          value={paymentLabel({
            method: state.summary.paymentMethod,
            status: state.summary.paymentStatus,
          })}
        />
      </dl>
      {state.calendar ? (
        <p
          className={`rounded-lg px-3 py-2 text-xs font-medium ${
            state.calendar.status === "synced" ||
            state.calendar.status === "skipped"
              ? "bg-brand-soft text-brand-ink"
              : "bg-warn-soft text-warn"
          }`}
        >
          {state.calendar.message}
        </p>
      ) : null}
      {state.cancellationText ? (
        <p
          className={`rounded-lg px-3 py-2 text-xs font-medium ${
            state.cancellationText.status === "sent" ||
            state.cancellationText.status === "skipped"
              ? "bg-brand-soft text-brand-ink"
              : "bg-warn-soft text-warn"
          }`}
        >
          {state.cancellationText.message}
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
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={labelClass}>{label}</span>
      {children}
      {error ? <span className="text-xs text-danger-ink">{error}</span> : null}
    </label>
  );
}

function ChoiceButton({
  active,
  disabled = false,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-11 rounded-lg border px-2 py-2 text-sm font-semibold ${
        active
          ? "border-brand bg-brand text-white"
          : "border-line bg-surface text-ink-soft active:bg-brand-soft"
      } disabled:bg-canvas disabled:text-ink-faint`}
    >
      {children}
    </button>
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

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
