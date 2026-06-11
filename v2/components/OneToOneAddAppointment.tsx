"use client";

// 1:1 (one_to_one) booking sheet (WS4a). One dog at a time, in a duration block:
// pick dog + service → a suggested, adjustable length → an open block of that
// length at one of the org's locations → confirm. Conflict detection and the
// per-org location check are enforced server-side by createOneToOneBooking; this
// sheet surfaces the suggestion and the open blocks. No SMS/invite — 1:1
// reminders are WS4d. Mounted only for one_to_one orgs; Sam's AddAppointment is
// untouched.

import { useActionState, useState, useTransition } from "react";
import {
  createOneToOneBooking,
  getOneToOneAvailability,
  type OneToOneBookingState,
} from "@/lib/actions/oneToOneBooking";
import type { ServiceType } from "@/lib/booking";
import type { Client, Pet } from "@/lib/data/types";
import { inferSizeClass } from "@/lib/dayCapacity";
import { ONE_TO_ONE_SERVICE_TYPES } from "@/lib/oneToOneBooking";
import type { OrgLocation } from "@/lib/orgSettings";
import {
  oneToOneLoadStripText,
  suggestedDurationMinutes,
  type DurationDefaults,
  type OneToOneDaySummary,
} from "@/lib/scheduling/oneToOne";
import { todayISO } from "@/lib/dates";
import { Sheet } from "./Sheet";
import { SubmitDogOverlay } from "./SubmitDog";
import { Field } from "./FormPrimitives";

const SERVICE_LABELS: Record<ServiceType, string> = {
  full_groom: "Full groom",
  puppy_groom: "Puppy groom",
  bath_only: "Bath only",
  nail_trim: "Nail trim",
  other: "Other",
};

const fieldClass =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-ink-faint";

export function OneToOneAddAppointment({
  client,
  pets,
  mode,
  writesEnabled,
  locations,
  durationDefaults,
}: {
  client: Client;
  pets: Pet[];
  mode: "fixtures" | "live";
  writesEnabled: boolean;
  locations: OrgLocation[];
  durationDefaults: DurationDefaults | null;
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  function close() {
    setOpen(false);
    setFormKey((k) => k + 1);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-brand bg-brand-soft px-4 py-2.5 text-sm font-semibold text-brand-ink active:bg-brand-soft/70"
      >
        Add appointment
      </button>
      <Sheet open={open} onClose={close} title="Book an appointment" variant="fullscreen">
        <OneToOneForm
          key={formKey}
          client={client}
          pets={pets}
          mode={mode}
          writesEnabled={writesEnabled}
          locations={locations}
          durationDefaults={durationDefaults}
          onDone={close}
        />
      </Sheet>
    </>
  );
}

function OneToOneForm({
  client,
  pets,
  mode,
  writesEnabled,
  locations,
  durationDefaults,
  onDone,
}: {
  client: Client;
  pets: Pet[];
  mode: "fixtures" | "live";
  writesEnabled: boolean;
  locations: OrgLocation[];
  durationDefaults: DurationDefaults | null;
  onDone: () => void;
}) {
  const firstPet = pets[0];
  const [petId, setPetId] = useState(firstPet?.id ?? "");
  const [service, setService] = useState<ServiceType>("full_groom");
  const [date, setDate] = useState(todayISO());
  const [location, setLocation] = useState(locations[0]?.name ?? "");
  const [fee, setFee] = useState("");

  function suggestFor(nextPetId: string, nextService: ServiceType): number {
    const pet = pets.find((p) => p.id === nextPetId);
    const size = pet ? inferSizeClass(pet) : "medium";
    return suggestedDurationMinutes(nextService, size, durationDefaults ?? undefined);
  }

  const [duration, setDuration] = useState<string>(() =>
    String(suggestFor(firstPet?.id ?? "", "full_groom")),
  );
  const suggested = suggestFor(petId, service);

  // Open blocks fetched from the server (advisory; the action is the authority),
  // plus the day's existing load for the non-blocking strip (TT-013).
  const [slots, setSlots] = useState<string[] | null>(null);
  const [dayLoad, setDayLoad] = useState<OneToOneDaySummary | null>(null);
  const [slot, setSlot] = useState("");
  const [loadingSlots, startSlots] = useTransition();

  function resetSlots() {
    setSlots(null);
    setDayLoad(null);
    setSlot("");
  }

  function findTimes() {
    const minutes = Number(duration);
    if (!date || !Number.isFinite(minutes) || minutes <= 0) return;
    startSlots(async () => {
      const result = await getOneToOneAvailability(date, minutes);
      setSlots(result.slots);
      setDayLoad(result.dayLoad);
    });
  }

  const [state, formAction, pending] = useActionState<OneToOneBookingState, FormData>(
    createOneToOneBooking,
    { status: "idle" },
  );

  if (state.status === "demo" || state.status === "gated" || state.status === "saved") {
    return <ResultScreen state={state} onDone={onDone} />;
  }

  const formError = state.status === "error" ? state.formError : undefined;
  const fieldErrors = state.status === "error" ? state.errors : {};
  const canReview = Boolean(petId && service && date && location && slot && Number(duration) > 0);

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <SubmitDogOverlay label="Booking" show={pending} />
      <input type="hidden" name="client_id" value={client.id} />
      <input type="hidden" name="pet_id" value={petId} />
      <input type="hidden" name="service_type" value={service} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="location" value={location} />
      <input type="hidden" name="time_slot" value={slot} />
      <input type="hidden" name="duration_minutes" value={duration} />
      <input type="hidden" name="fee" value={fee} />

      <ModeNote mode={mode} writesEnabled={writesEnabled} />
      {formError ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{formError}</p>
      ) : null}

      <Field label="Dog" error={fieldErrors.pet_id}>
        <select
          value={petId}
          onChange={(e) => {
            setPetId(e.target.value);
            setDuration(String(suggestFor(e.target.value, service)));
            resetSlots();
          }}
          className={fieldClass}
        >
          {pets.map((pet) => (
            <option key={pet.id} value={pet.id}>
              {pet.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Service" error={fieldErrors.service_type}>
        <select
          value={service}
          onChange={(e) => {
            const next = e.target.value as ServiceType;
            setService(next);
            setDuration(String(suggestFor(petId, next)));
            resetSlots();
          }}
          className={fieldClass}
        >
          {ONE_TO_ONE_SERVICE_TYPES.map((code) => (
            <option key={code} value={code}>
              {SERVICE_LABELS[code]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Location" error={fieldErrors.location}>
        <select
          value={location}
          onChange={(e) => {
            setLocation(e.target.value);
            resetSlots();
          }}
          className={fieldClass}
        >
          {locations.map((loc) => (
            <option key={loc.name} value={loc.name}>
              {loc.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Date" error={fieldErrors.date}>
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            resetSlots();
          }}
          className={fieldClass}
        />
      </Field>

      <Field label="Length (minutes)" error={fieldErrors.duration_minutes}>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={5}
            max={600}
            step={5}
            value={duration}
            onChange={(e) => {
              setDuration(e.target.value);
              resetSlots();
            }}
            className={fieldClass}
          />
          {Number(duration) !== suggested ? (
            <button
              type="button"
              onClick={() => {
                setDuration(String(suggested));
                resetSlots();
              }}
              className="shrink-0 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-soft"
            >
              Use {suggested}m
            </button>
          ) : (
            <span className="shrink-0 text-xs text-ink-faint">suggested</span>
          )}
        </div>
      </Field>

      <div className="rounded-xl border border-line bg-canvas px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-ink">Open times</span>
          <button
            type="button"
            onClick={findTimes}
            disabled={loadingSlots}
            className="rounded-lg border border-brand bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand-ink disabled:opacity-60"
          >
            {loadingSlots ? "Finding…" : "Find open times"}
          </button>
        </div>
        {dayLoad ? <OneToOneDayLoadStrip dayLoad={dayLoad} /> : null}
        {slots == null ? (
          <p className="mt-2 text-xs text-ink-soft">
            Pick a date and length, then find open {duration}-minute blocks.
          </p>
        ) : slots.length === 0 ? (
          <p className="mt-2 text-xs text-ink-soft">
            No open {duration}-minute block on this day. Try another date or length.
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {slots.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSlot(t)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                  slot === t
                    ? "border-brand bg-brand text-white"
                    : "border-line bg-surface text-ink-soft active:bg-canvas"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      <Field label="Fee (optional)" error={fieldErrors.fee}>
        <input
          type="text"
          inputMode="decimal"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          placeholder="0.00"
          className={fieldClass}
        />
      </Field>

      <button
        type="submit"
        disabled={pending || !canReview}
        className="rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white active:bg-brand-ink disabled:opacity-50"
      >
        {pending ? "Booking…" : slot ? `Book ${slot}` : "Pick an open time"}
      </button>
    </form>
  );
}

// TT-013: a non-blocking, one-line read on the day's existing load (booked time
// vs the working-day window + large-dog count). It informs the booking — it
// never disables an open slot. Warns in the heaviness tone only when the day is
// getting full; otherwise a quiet advisory line.
export function OneToOneDayLoadStrip({
  dayLoad,
}: {
  dayLoad: OneToOneDaySummary;
}) {
  return (
    <p
      className={`mt-2 text-xs leading-relaxed ${
        dayLoad.gettingHeavy ? "font-medium text-warn" : "text-ink-soft"
      }`}
    >
      {oneToOneLoadStripText(dayLoad)}
    </p>
  );
}

function ModeNote({
  mode,
  writesEnabled,
}: {
  mode: "fixtures" | "live";
  writesEnabled: boolean;
}) {
  const text =
    mode === "fixtures"
      ? "Demo mode — confirming will not save anything."
      : writesEnabled
        ? "Production mode — confirming will book this appointment."
        : "Production mode — the server will confirm the write gate before saving.";
  return (
    <p
      className={`rounded-lg px-3 py-2 text-xs font-medium ${
        mode === "live" && !writesEnabled ? "bg-warn-soft text-warn" : "bg-brand-soft text-brand-ink"
      }`}
    >
      {text}
    </p>
  );
}

function ResultScreen({
  state,
  onDone,
}: {
  state: Extract<OneToOneBookingState, { status: "demo" | "gated" | "saved" }>;
  onDone: () => void;
}) {
  const saved = state.status === "saved";
  const headline = saved
    ? "Booked"
    : state.status === "demo"
      ? "Demo only — nothing was saved"
      : "Not saved — booking is switched off";
  return (
    <div className="flex flex-col gap-3.5">
      <div className={`rounded-xl p-3.5 ${saved ? "bg-brand-soft text-brand-ink" : "bg-warn-soft text-warn"}`}>
        <p className="text-sm font-semibold">{headline}</p>
        <p className="mt-0.5 text-xs leading-relaxed">
          {state.summary.petName} · {state.summary.date} at {state.summary.time} ·{" "}
          {state.summary.durationMinutes} min · {state.summary.location}
        </p>
      </div>
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
