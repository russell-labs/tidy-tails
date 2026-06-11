import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ScheduledAppointment } from "@/lib/schedule";
import { OneToOneOpenedDay } from "./OneToOneOpenedDay";

const workingDay = { startMinutes: 8 * 60, endMinutes: 18 * 60 }; // 600 min

function row(
  id: string,
  durationMinutes: number,
  size: string,
): ScheduledAppointment {
  return {
    appointment: {
      id,
      time_slot: "10:00am",
      duration_minutes: durationMinutes,
      service: "Full groom",
      location: "Gina's",
    },
    pet: { id: `p-${id}`, name: "Dog", size },
  } as unknown as ScheduledAppointment;
}

describe("OneToOneOpenedDay (TT-013 — time-based, not load-points)", () => {
  it("frames the day as minutes-booked-vs-working-day plus the large-dog count", () => {
    const html = renderToStaticMarkup(
      <OneToOneOpenedDay
        date="2026-06-20"
        rows={[row("a", 90, "large"), row("b", 30, "small")]}
        softTarget={7}
        bufferMinutes={0}
        workingDay={workingDay}
      />,
    );
    // The shared TT-013 vocabulary: "Xh of ~Yh booked · Z large", never "pts".
    expect(html).toContain("of ~10h booked · 1 large");
    expect(html).not.toContain("pts");
  });
});
