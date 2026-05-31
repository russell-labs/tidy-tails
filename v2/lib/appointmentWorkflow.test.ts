import { describe, expect, it } from "vitest";
import {
  appointmentWorkflowLabel,
  appointmentWorkflowStage,
  isScheduleSlateAppointment,
  parseAppointmentWorkflowMarker,
  stripAppointmentWorkflowMarker,
  withAppointmentWorkflowMarker,
} from "./appointmentWorkflow";

describe("appointment workflow markers", () => {
  it("stores and strips private in-progress markers from notes", () => {
    const notes = withAppointmentWorkflowMarker("Use short blade", "in_progress");

    expect(notes).toBe("Use short blade [workflow:in_progress]");
    expect(parseAppointmentWorkflowMarker(notes)).toBe("in_progress");
    expect(stripAppointmentWorkflowMarker(notes)).toBe("Use short blade");
  });

  it("replaces an existing workflow marker", () => {
    expect(
      withAppointmentWorkflowMarker(
        "Use short blade [workflow:in_progress]",
        "ready_pickup",
      ),
    ).toBe("Use short blade [workflow:ready_pickup]");
  });

  it("maps appointment rows to the workboard stage and pill label", () => {
    expect(
      appointmentWorkflowStage({ status: "booked", notes: null }),
    ).toBe("scheduled");
    expect(
      appointmentWorkflowStage({
        status: "booked",
        notes: "[workflow:ready_pickup]",
      }),
    ).toBe("active");
    expect(
      appointmentWorkflowLabel({
        status: "booked",
        notes: "[workflow:ready_pickup]",
      }),
    ).toBe("Ready");
    expect(
      appointmentWorkflowLabel({ status: "completed", notes: null }),
    ).toBe("Logged");
    expect(
      appointmentWorkflowStage({ status: "no_show", notes: null }),
    ).toBe("exception");
  });

  it("keeps only scheduled slate rows on the schedule", () => {
    expect(isScheduleSlateAppointment({ status: "booked", time_slot: null })).toBe(
      true,
    );
    expect(
      isScheduleSlateAppointment({ status: "completed", time_slot: "10:00am" }),
    ).toBe(true);
    expect(
      isScheduleSlateAppointment({ status: "completed", time_slot: null }),
    ).toBe(false);
    expect(
      isScheduleSlateAppointment({ status: "no_show", time_slot: "10:00am" }),
    ).toBe(true);
  });
});
