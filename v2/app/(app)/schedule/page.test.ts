import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("schedule appointment tiles", () => {
  it("link the appointment card to the appointment action page", () => {
    const source = readFileSync("app/(app)/schedule/page.tsx", "utf8");

    expect(source).toContain("appointmentHref(appointment.id)");
    expect(source).toContain("/schedule/appointments/");
    expect(source).not.toContain("`/clients/${client.id}?from=schedule");
  });

  it("links the dog name itself to the pet profile from the appointment action page", () => {
    const source = `${readFileSync("app/(app)/schedule/appointments/[appointmentId]/page.tsx", "utf8")}\n${readFileSync("components/SchedulePetProfileLink.tsx", "utf8")}`;

    expect(source).toContain("SchedulePetProfileLink");
    expect(source).toContain("href={`/clients/${clientId}/pets/${petId}`}");
  });

  it("exposes schedule workflow controls from the appointment action page", () => {
    const source = `${readFileSync("app/(app)/schedule/appointments/[appointmentId]/page.tsx", "utf8")}\n${readFileSync("components/AppointmentWorkflowControls.tsx", "utf8")}`;

    expect(source).toContain("AppointmentWorkflowControls");
    expect(source).toContain("Start groom");
    expect(source).toContain("Ready");
    expect(source).toContain("Not started");
  });

  it("passes the booked household dogs into LogGroom for same-household bookings", () => {
    const source = readFileSync(
      "app/(app)/schedule/appointments/[appointmentId]/page.tsx",
      "utf8",
    );

    // The picker only appears when LogGroom gets the group's dogs — a revert to
    // the single-pet `pets={[pet]}` would drop the dropdown for combined
    // bookings, so guard the wiring explicitly.
    expect(source).toContain(
      "pets={appointmentGroupPets(appointmentGroup, householdPets, pet)}",
    );
    expect(source).not.toContain("pets={[pet]}");
  });

  it("uses distinct workboard tones for active and logged schedule cards", () => {
    const source = readFileSync("app/(app)/schedule/page.tsx", "utf8");

    expect(source).toContain("workflowStage");
    expect(source).toContain("bg-warn-soft");
    expect(source).toContain("bg-ok-soft");
    expect(source).toContain("bg-danger-soft");
    expect(source).toContain("workflowLabel");
    expect(source).toContain("appointmentCardTone");
  });
});
