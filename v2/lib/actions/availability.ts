"use server";

import { serviceLabel } from "@/lib/data/live";
import { loadAppointments } from "@/lib/data/repo";
import {
  availableBookingTimeSlots,
  type ServiceType,
} from "@/lib/booking";
import {
  markGoogleCalendarBusySlots,
  type CalendarAwareBookingSlot,
} from "@/lib/googleCalendar";
import { readGoogleCalendarBusyBlocksForDate } from "@/lib/googleCalendar.server";

export type BookingAvailabilityState = {
  status: "idle" | "ready" | "not_connected" | "disabled" | "failed";
  message: string;
  slots: CalendarAwareBookingSlot[];
};

export async function checkBookingAvailability({
  date,
  service_type,
}: {
  date: string;
  service_type: ServiceType | "";
}): Promise<BookingAvailabilityState> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      status: "idle",
      message: "Choose a date to check availability.",
      slots: [],
    };
  }

  const appointments = await loadAppointments();
  const tidyTailsSlots = availableBookingTimeSlots(appointments, date);
  const google = await readGoogleCalendarBusyBlocksForDate(date);
  const service = service_type ? serviceLabel(service_type) : null;

  if (google.status === "ready") {
    return {
      status: "ready",
      message: google.message,
      slots: markGoogleCalendarBusySlots(
        tidyTailsSlots,
        date,
        service,
        google.busy,
      ),
    };
  }

  return {
    status: google.status,
    message: google.message,
    slots: tidyTailsSlots.map((slot) =>
      slot.available
        ? { ...slot, source: "open" }
        : {
            ...slot,
            source: "tidy_tails",
            reason: "Already booked in Tidy Tails",
          },
    ),
  };
}
