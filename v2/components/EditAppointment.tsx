"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  checkBookingAvailability,
  type BookingAvailabilityState,
} from "@/lib/actions/availability";
import {
  deleteAppointment,
  editAppointment,
  markAppointmentNoShow,
  type DeleteAppointmentState,
  type EditAppointmentState,
  type NoShowAppointmentState,
} from "@/lib/actions/editAppointment";
import {
  availableBookingTimeSlots,
  BOOKING_LOCATIONS,
  bookedTimesForDate,
  SERVICE_TYPES,
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
  canMarkAppointmentNoShow,
  validateEditAppointment,
  type EditAppointmentErrors,
} from "@/lib/editAppointment";
import { formatMoney } from "@/lib/format";
import { todayISO } from "@/lib/dates";
import { serviceCodeFromLabel } from "@/lib/data/live";
import {
  customerLocationLabelFromSettings,
  locationLabelFromSettings,
} from "@/lib/locationFinance";
import type { LocationSettingsMap } from "@/lib/operatorSettings";
import type { OrgLocation } from "@/lib/orgSettings";
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
import { ChoiceButton, Field, ReviewRow, labelClass } from "./FormPrimitives";

const fieldClass =
  "w-full min-w-0 max-w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-ink-faint";
const GROUP_APPOINTMENT_VALUE = "__group__";

const SERVICE_LABELS: Record<ServiceType, string> = {
  full_groom: "Full groom",
  puppy_groom: "Puppy groom",
  bath_only: "Bath only",
  nail_trim: "Nail trim",
  other: "Other",
};

export function EditAppointment({
  clientId,
  appointment,
  appointments = [appointment],
  petName,
  groupAppointmentIds = [appointment.id],
  groupPetNames = petName ? [petName] : [],
  ownerFirstName,
  customerPhone,
  mode,
  writesEnabled,
  locationSettings,
  operatorName,
  schedulingStyle = "batched",
  orgLocations = [],
  trigger,
}: {
  clientId: string;
  appointment: Appointment;
  appointments?: Appointment[];
  groupAppointmentIds?: string[];
  groupPetNames?: string[];
  petName?: string;
  ownerFirstName?: string | null;
  customerPhone?: string;
  mode: "fixtures" | "live";
  writesEnabled: boolean;
  locationSettings: LocationSettingsMap;
  operatorName: string;
  schedulingStyle?: "batched" | "one_to_one";
  orgLocations?: OrgLocation[];
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
          groupAppointmentIds={groupAppointmentIds}
          groupPetNames={groupPetNames}
          petName={petName}
          ownerFirstName={ownerFirstName}
          customerPhone={customerPhone}
          mode={mode}
          writesEnabled={writesEnabled}
          locationSettings={locationSettings}
          operatorName={operatorName}
          schedulingStyle={schedulingStyle}
          orgLocations={orgLocations}
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
  groupAppointmentIds,
  groupPetNames,
  petName,
  ownerFirstName,
  customerPhone,
  mode,
  writesEnabled,
  locationSettings,
  operatorName,
  schedulingStyle,
  orgLocations,
  onDone,
}: {
  clientId: string;
  appointment: Appointment;
  appointments: Appointment[];
  groupAppointmentIds: string[];
  groupPetNames: string[];
  petName?: string;
  ownerFirstName?: string | null;
  customerPhone?: string;
  mode: "fixtures" | "live";
  writesEnabled: boolean;
  locationSettings: LocationSettingsMap;
  operatorName: string;
  schedulingStyle: "batched" | "one_to_one";
  orgLocations: OrgLocation[];
  onDone: () => void;
}) {
  const isOneToOne = schedulingStyle === "one_to_one";
  const [state, formAction, pending] = useActionState<
    EditAppointmentState,
    FormData
  >(editAppointment, { status: "idle" });
  const [deleteState, deleteAction, deletePending] = useActionState<
    DeleteAppointmentState,
    FormData
  >(deleteAppointment, { status: "idle" });
  const [noShowState, noShowAction, noShowPending] = useActionState<
    NoShowAppointmentState,
    FormData
  >(markAppointmentNoShow, { status: "idle" });
  const [step, setStep] = useState<"form" | "review">("form");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmNoShow, setConfirmNoShow] = useState(false);
  const [errors, setErrors] = useState<EditAppointmentErrors>({});
  const cleanGroupAppointmentIds = Array.from(
    new Set(groupAppointmentIds.filter(Boolean)),
  );
  const canEditGroup = cleanGroupAppointmentIds.length > 1;
  const groupAppointments = cleanGroupAppointmentIds
    .map((id) => appointments.find((candidate) => candidate.id === id))
    .filter(Boolean) as Appointment[];
  const groupOptions = groupAppointments.map((groupAppointment, index) => ({
    id: groupAppointment.id,
    name: groupPetNames[index] ?? `Dog ${index + 1}`,
  }));
  const groupPetLabel =
    groupOptions.length > 1
      ? groupOptions.map((option) => option.name).join(" + ")
      : petName ?? "this pet";
  const [editTargetId, setEditTargetId] = useState(appointment.id);
  const editScope = editTargetId === GROUP_APPOINTMENT_VALUE ? "group" : "single";
  const targetAppointment =
    appointments.find((candidate) => candidate.id === editTargetId) ??
    appointment;
  const scopedAppointmentIds =
    editScope === "group" && canEditGroup
      ? cleanGroupAppointmentIds
      : [targetAppointment.id];
  const scopedAppointmentIdKey = scopedAppointmentIds.join("|");
  const scopedPetLabel =
    editScope === "group" && canEditGroup
      ? groupPetLabel
      : groupOptions.find((option) => option.id === targetAppointment.id)?.name ??
        petName ??
        "this pet";
  const [date, setDate] = useState(appointment.date);
  const [time, setTime] = useState(appointment.time_slot ?? "");
  const [serviceType, setServiceType] = useState(
    serviceCodeFromLabel(appointment.service),
  );
  const [location, setLocation] = useState<string>(
    isOneToOne
      ? appointment.location ?? ""
      : appointment.location === "gina" || appointment.location === "annette"
        ? appointment.location
        : "",
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
    status: targetAppointment.status,
    date: targetAppointment.date,
    today: todayISO(),
  });
  const canDeleteAppointment = deleteKind !== "disabled";
  // A no-show keeps the record and only applies to a single still-booked visit
  // (group scope edits shared fields, not per-dog attendance).
  const canMarkNoShow =
    editScope === "single" && canMarkAppointmentNoShow(targetAppointment.status);
  const [sendCancellationText, setSendCancellationText] = useState(false);
  const defaultCancellationMessage = (scope: "single" | "group" = editScope) =>
    buildCancellationTextMessage({
      ownerFirstName: null,
      petName:
        scope === "group" && canEditGroup && groupPetNames.length > 1
          ? groupPetLabel
          : scopedPetLabel,
      date: targetAppointment.date,
      time: targetAppointment.time_slot,
      operatorName,
    });
  const [cancellationMessage, setCancellationMessage] = useState(
    defaultCancellationMessage("single"),
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
  const comparableAppointments = appointments.filter(
    (a) => !scopedAppointmentIds.includes(a.id),
  );
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
    ? customerLocationLabelFromSettings(location, locationSettings)
    : null;
  const defaultBookingUpdateMessage = () =>
    buildBookingUpdateTextMessage({
      ownerFirstName: ownerFirstName ?? null,
      petName: scopedPetLabel,
      date,
      time: time.trim() || null,
      service: serviceLabel,
      location: customerLocation,
      operatorName,
    });
  const currentBookingUpdateMessage = sendBookingUpdateText
    ? bookingUpdateMessage.trim() || defaultBookingUpdateMessage()
    : "";

  useEffect(() => {
    // 1:1 visits don't use the batched morning-tile availability check.
    if (isOneToOne || !date) return;
    let cancelled = false;
    startAvailabilityTransition(() => {
      void checkBookingAvailability({
        date,
        service_type: serviceType as ServiceType | "",
        exclude_appointment_id: appointment.id,
        exclude_appointment_ids: scopedAppointmentIdKey
          ? scopedAppointmentIdKey.split("|")
          : [],
      }).then((result) => {
        if (!cancelled) setAvailabilityResult({ date, serviceType, result });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [appointment.id, date, serviceType, scopedAppointmentIdKey, isOneToOne]);

  function applyAppointmentFields(nextAppointment: Appointment) {
    setDate(nextAppointment.date);
    setTime(nextAppointment.time_slot ?? "");
    setServiceType(serviceCodeFromLabel(nextAppointment.service));
    setLocation(
      isOneToOne
        ? nextAppointment.location ?? ""
        : nextAppointment.location === "gina" || nextAppointment.location === "annette"
          ? nextAppointment.location
          : "",
    );
    setFee(nextAppointment.price != null ? String(nextAppointment.price) : "");
    setTip(nextAppointment.tip != null ? String(nextAppointment.tip) : "");
    const nextPayment = parsePaymentInfo(nextAppointment.notes);
    setPaymentMethod(nextPayment.method ?? "cash");
    setPaymentStatus(nextPayment.status ?? "paid");
    setNotes(
      stripAppointmentWorkflowMarker(
        stripSalonPayoutOverride(stripPaymentInfo(nextAppointment.notes)),
      ) ?? "",
    );
    setSalonPayoutOverride(
      parseSalonPayoutOverride(nextAppointment.notes)?.toString() ?? "",
    );
  }

  function onEditTargetChange(value: string) {
    setEditTargetId(value);
    setBookingUpdateMessage("");
    setConfirmDelete(false);
    setConfirmNoShow(false);
    setErrors({});
    if (value === GROUP_APPOINTMENT_VALUE) {
      setCancellationMessage(defaultCancellationMessage("group"));
      return;
    }
    const nextAppointment =
      appointments.find((candidate) => candidate.id === value) ?? appointment;
    applyAppointmentFields(nextAppointment);
    setCancellationMessage(
      buildCancellationTextMessage({
        ownerFirstName: null,
        petName:
          groupOptions.find((option) => option.id === nextAppointment.id)?.name ??
          petName ??
          "the pet",
        date: nextAppointment.date,
        time: nextAppointment.time_slot,
        operatorName,
      }),
    );
  }

  function toReview() {
    const validation = validateEditAppointment(
      {
        client_id: clientId,
        appointment_id:
          editScope === "group" ? groupAppointments[0]?.id ?? appointment.id : targetAppointment.id,
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
      },
      new Date(),
      { schedulingStyle, orgLocations: orgLocations.map((entry) => entry.name) },
    );
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
  if (
    noShowState.status === "demo" ||
    noShowState.status === "gated" ||
    noShowState.status === "saved"
  ) {
    return <NoShowResultScreen state={noShowState} onDone={onDone} />;
  }

  const formError =
    state.status === "error"
      ? (state.formError ?? "Please check the visit details and try again.")
      : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <SubmitDogOverlay
        label={
          noShowPending
            ? "Marking no-show"
            : deletePending
              ? "Deleting booking"
              : "Saving changes"
        }
        show={pending || deletePending || noShowPending}
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
      <input
        type="hidden"
        name="appointment_id"
        value={
          editScope === "group"
            ? groupAppointments[0]?.id ?? appointment.id
            : targetAppointment.id
        }
      />
      <input type="hidden" name="edit_scope" value={editScope} />
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
        value={
          withAppointmentWorkflowMarker(
            notes,
            parseAppointmentWorkflowMarker(targetAppointment.notes),
          ) ?? ""
        }
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
      {noShowState.status === "error" ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {noShowState.message}
        </p>
      ) : null}

      {step === "form" ? (
        <>
          <p className="text-sm text-ink-soft">
            Update visit details for{" "}
            <span className="font-semibold text-ink">{scopedPetLabel}</span>.
          </p>
          {canEditGroup ? (
            <Field label="Appointment">
              <select
                value={editTargetId}
                onChange={(event) => onEditTargetChange(event.target.value)}
                className={fieldClass}
              >
                {groupOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
                <option value={GROUP_APPOINTMENT_VALUE}>{groupPetLabel}</option>
              </select>
              {editScope === "group" ? (
                <p className="text-xs leading-relaxed text-ink-soft">
                  Date, drop-off time, location, and payment update together.
                  Groom notes, fee, tip, service, and payout stay separate.
                </p>
              ) : null}
            </Field>
          ) : null}
          <Field label="Date" error={errors.date}>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="Drop-off time" error={errors.time_slot}>
            {!isOneToOne && date && availability ? (
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
            {!isOneToOne && date ? (
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
            {!isOneToOne && bookedTimes.length > 0 ? (
              <p className="mb-2 rounded-lg bg-warn-soft px-3 py-2 text-xs font-medium text-warn">
                Already booked that day: {bookedTimes.join(", ")}
              </p>
            ) : null}
            {isOneToOne ? (
              <p className="mb-2 rounded-lg bg-canvas px-3 py-2 text-xs font-medium text-ink-soft">
                Start time for this block. The block keeps its current length; a
                new time is checked against the day for overlaps when you save.
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
          {editScope === "single" ? (
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
          ) : null}
          <Field label="Location" error={errors.location}>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={fieldClass}
            >
              <option value="">Not set</option>
              {isOneToOne
                ? orgLocations.map((entry) => (
                    <option key={entry.name} value={entry.name}>
                      {entry.name}
                    </option>
                  ))
                : BOOKING_LOCATIONS.map((code) => (
                    <option key={code} value={code}>
                      {locationLabelFromSettings(code, locationSettings)}
                    </option>
                  ))}
            </select>
          </Field>
          {!isOneToOne && editScope === "single" && location ? (
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
          {editScope === "single" ? (
            <>
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
              <Field label="Notes" error={errors.notes}>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Cut notes, changes, anything useful"
                  className={`${fieldClass} min-h-28 resize-none`}
                />
              </Field>
            </>
          ) : null}
          <fieldset className="flex flex-col gap-2">
            <legend className={labelClass}>
              {editScope === "group" ? "Payment for all selected dogs" : "Payment"}
            </legend>
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
                  You review the updated date, time, service, and location
                  before anything sends.
                  {editScope === "group" && canEditGroup
                    ? " This text is sent once for the household."
                    : ""}
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
                      ? `Delete ${scopedPetLabel}'s booking?`
                      : `Delete ${scopedPetLabel}'s past visit?`}
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
                                You can edit this before deleting.
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
                        ? editScope === "group" && canEditGroup
                          ? "Delete all"
                          : "Delete booking"
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
                    ? editScope === "group" && canEditGroup
                      ? `Delete all ${cleanGroupAppointmentIds.length} bookings`
                      : "Delete booking"
                    : "Delete past visit"}
                </button>
              )}
            </div>
          ) : null}
          {canMarkNoShow ? (
            <div className="rounded-xl border border-line bg-surface p-3">
              {confirmNoShow ? (
                <div className="flex flex-col gap-2.5">
                  <p className="text-sm font-semibold text-warn">
                    Mark {scopedPetLabel}&rsquo;s visit as a no-show?
                  </p>
                  <p className="text-xs leading-relaxed text-ink-soft">
                    This keeps the booking as a business record and marks it a
                    no-show. It is not deleted, and no cancellation text is sent.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmNoShow(false)}
                      disabled={noShowPending}
                      className="flex-1 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-soft"
                    >
                      Keep it booked
                    </button>
                    <button
                      type="submit"
                      formAction={noShowAction}
                      disabled={noShowPending}
                      className="flex-1 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-sm font-semibold text-warn disabled:opacity-50"
                    >
                      Mark no-show
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmNoShow(true)}
                  className="w-full rounded-lg border border-warn/40 px-3 py-2 text-sm font-semibold text-warn active:bg-warn-soft"
                >
                  Mark no-show
                </button>
              )}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p className="text-sm text-ink">Review this visit update.</p>
          <dl className="flex flex-col gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm">
            {canEditGroup ? (
              <ReviewRow
                label="Appointment"
                value={scopedPetLabel}
              />
            ) : null}
            <ReviewRow label="Date" value={date} />
            <ReviewRow label="Drop-off" value={time.trim() || "Not set"} />
            {editScope === "single" ? (
              <ReviewRow
                label="Service"
                value={
                  serviceType
                    ? (SERVICE_LABELS[serviceType as ServiceType] ?? "Not set")
                    : "Not set"
                }
              />
            ) : null}
            <ReviewRow
              label="Location"
              value={
                location
                  ? locationLabelFromSettings(location, locationSettings) ??
                    "Not set"
                  : "Not set"
              }
            />
            {editScope === "single" ? (
              <>
                <ReviewRow label="Fee" value={fee ? formatMoney(Number(fee)) : "Not set"} />
                <ReviewRow label="Tip" value={tip ? formatMoney(Number(tip)) : "Not set"} />
                {salonPayoutOverride.trim() ? (
                  <ReviewRow
                    label="Salon payout"
                    value={`Salon keeps ${salonPayoutOverride.trim()}% for this visit`}
                  />
                ) : null}
                <ReviewRow label="Notes" value={notes.trim() || "Not set"} />
              </>
            ) : null}
            <ReviewRow
              label="Payment"
              value={paymentLabel({
                method: paymentMethod,
                status: paymentStatus,
              })}
            />
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
                only after you confirm.
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

function NoShowResultScreen({
  state,
  onDone,
}: {
  state: Extract<NoShowAppointmentState, { status: "demo" | "gated" | "saved" }>;
  onDone: () => void;
}) {
  const saved = state.status === "saved";
  const headline =
    state.status === "saved"
      ? "Marked no-show - booking kept"
      : state.status === "demo"
        ? "Demo only - nothing was changed"
        : "Not changed - no-show marking is switched off";
  return (
    <div className="flex flex-col gap-3.5">
      <div
        className={`rounded-xl p-3.5 ${
          saved ? "bg-brand-soft text-brand-ink" : "bg-warn-soft text-warn"
        }`}
      >
        <p className="text-sm font-semibold">{headline}</p>
        <p className="mt-0.5 text-xs leading-relaxed">{state.message}</p>
      </div>
      <p className="text-sm text-ink-soft">
        The visit for{" "}
        <span className="font-semibold text-ink">{state.summary.petName}</span> under{" "}
        <span className="font-semibold text-ink">{state.summary.ownerName}</span> is
        kept on file as a no-show.
      </p>
      <dl className="flex flex-col gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm">
        <ReviewRow label="Date" value={state.summary.date} />
        <ReviewRow label="Drop-off" value={state.summary.time ?? "Not set"} />
        <ReviewRow label="Service" value={state.summary.service ?? "Not set"} />
      </dl>
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

