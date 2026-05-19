import { describe, expect, it } from "vitest";
import {
  buildEditAppointmentUpdate,
  validateEditAppointment,
} from "./editAppointment";

const TODAY = new Date("2026-05-18T12:00:00");

const valid = {
  client_id: "client-1",
  appointment_id: "appt-1",
  date: "2026-04-10",
  time_slot: "10:30am",
  service_type: "full_groom",
  location: "gina",
  fee: "60",
  tip: "10",
  notes: "#4, left ears and tail",
};

describe("validateEditAppointment", () => {
  it("normalizes editable visit details", () => {
    const result = validateEditAppointment(valid, TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      client_id: "client-1",
      appointment_id: "appt-1",
      date: "2026-04-10",
      time_slot: "10:30am",
      service_type: "full_groom",
      location: "gina",
      fee: 60,
      tip: 10,
      notes: "#4, left ears and tail",
    });
  });

  it("requires client id, appointment id, and a valid date", () => {
    const result = validateEditAppointment(
      { ...valid, client_id: "", appointment_id: "", date: "" },
      TODAY,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.client_id).toBeTruthy();
    expect(result.errors.appointment_id).toBeTruthy();
    expect(result.errors.date).toBeTruthy();
  });

  it("allows empty optional fields as null", () => {
    const result = validateEditAppointment(
      {
        ...valid,
        time_slot: "",
        service_type: "",
        location: "",
        fee: "",
        tip: "",
        notes: "",
      },
      TODAY,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.service_type).toBeNull();
    expect(result.value.location).toBeNull();
    expect(result.value.time_slot).toBeNull();
    expect(result.value.fee).toBeNull();
    expect(result.value.tip).toBeNull();
    expect(result.value.notes).toBeNull();
  });

  it("rejects invalid service, invalid location, negative fee, and negative tip", () => {
    const result = validateEditAppointment(
      { ...valid, service_type: "spa", location: "mobile", fee: "-1", tip: "-2" },
      TODAY,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.service_type).toBeTruthy();
    expect(result.errors.location).toBeTruthy();
    expect(result.errors.fee).toBeTruthy();
    expect(result.errors.tip).toBeTruthy();
  });
});

describe("buildEditAppointmentUpdate", () => {
  it("maps editable visit details to live appointment columns", () => {
    const result = validateEditAppointment(valid, TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(buildEditAppointmentUpdate(result.value)).toEqual({
      date: "2026-04-10",
      time_slot: "10:30am",
      service_type: "full_groom",
      location: "gina",
      fee: 60,
      tip: 10,
      notes: "#4, left ears and tail",
    });
  });
});
