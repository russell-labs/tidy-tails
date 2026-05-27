"use client";

import type { CalendarAwareBookingSlot } from "@/lib/googleCalendar";

const VISIBLE_SLOT_COUNT = 6;

export function BookingTimeSlotPicker({
  slots,
  selectedTime,
  onSelect,
}: {
  slots: CalendarAwareBookingSlot[];
  selectedTime: string;
  onSelect: (time: string) => void;
}) {
  const visibleSlots = slots.slice(0, VISIBLE_SLOT_COUNT);
  const hiddenSlots = slots.slice(VISIBLE_SLOT_COUNT);

  return (
    <div className="mb-2 flex flex-col gap-2">
      <SlotGrid slots={visibleSlots} selectedTime={selectedTime} onSelect={onSelect} />
      {hiddenSlots.length > 0 ? (
        <details className="rounded-lg border border-line bg-surface px-2.5 py-2">
          <summary className="cursor-pointer text-sm font-semibold text-brand">
            More morning times
          </summary>
          <div className="mt-2">
            <SlotGrid
              slots={hiddenSlots}
              selectedTime={selectedTime}
              onSelect={onSelect}
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function SlotGrid({
  slots,
  selectedTime,
  onSelect,
}: {
  slots: CalendarAwareBookingSlot[];
  selectedTime: string;
  onSelect: (time: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {slots.map((slot) => (
        <button
          key={slot.time}
          type="button"
          onClick={() => {
            if (!slot.available) return;
            onSelect(slot.time);
          }}
          disabled={!slot.available}
          aria-pressed={selectedTime === slot.time}
          className={`flex min-h-11 flex-col items-center justify-center rounded-lg border px-2.5 py-2 text-sm font-semibold ${
            selectedTime === slot.time
              ? "border-brand bg-brand text-white"
              : slot.available
                ? "border-line bg-surface text-ink"
                : "border-line bg-canvas text-ink-faint"
          }`}
        >
          <span className={slot.available ? "" : "line-through"}>
            {displaySlotTime(slot.time)}
          </span>
          {!slot.available ? (
            <span className="mt-0.5 text-[10px] font-medium leading-none no-underline">
              Busy
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function displaySlotTime(time: string): string {
  return time === "12:00pm" ? "12 noon" : time;
}
