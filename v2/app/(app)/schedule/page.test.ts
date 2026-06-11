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

describe("schedule day-fit card branches by scheduling style (TT-013)", () => {
  const source = readFileSync("app/(app)/schedule/page.tsx", "utf8");

  it("renders the time-based 1:1 week card for one_to_one orgs", () => {
    expect(source).toContain("OneToOneDaySummaryCard");
    expect(source).toContain("oneToOneLoadSummaryText");
    // The week grid chooses the 1:1 card only when isOneToOne.
    expect(source).toMatch(/isOneToOne \? \([\s\S]{0,600}OneToOneDaySummaryCard/);
  });

  it("keeps the batched load-point card unchanged for batched orgs (Sam)", () => {
    // The pts/gross/net day-fit metric stays for the batched path.
    expect(source).toContain("daySummaryMetrics");
    expect(source).toContain("pts");
    expect(source).toContain("DaySummaryCard");
  });

  it("does not put load-points on the 1:1 week card", () => {
    const start = source.indexOf("function OneToOneDaySummaryCard");
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, start + 1200);
    expect(body).not.toContain("daySummaryMetrics");
    expect(body).not.toContain(" pts");
    expect(body).not.toContain("Gross");
  });

  it("suppresses the per-appointment load-point line for 1:1 in the week list", () => {
    // The "Appointments this week" list prints "N dogs · X pts" — load-point
    // vocabulary that doesn't belong on a 1:1 day. Hide it for one_to_one,
    // unchanged for batched (Sam).
    expect(source).toContain("hideLoadPoints");
    expect(source).toMatch(
      /Appointments this week[\s\S]{0,300}hideLoadPoints=\{isOneToOne\}/,
    );
    expect(source).toContain("!hideLoadPoints && profilePoints > 0");
  });
});
