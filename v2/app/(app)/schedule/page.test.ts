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
});
