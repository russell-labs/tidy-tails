import { describe, expect, it } from "vitest";
import type { Appointment, Client, Pet } from "./data/types";
import { FIXTURE_APPOINTMENTS } from "./data/fixtures";
import {
  appointmentGroupPets,
  appointmentsForDay,
  appointmentsForWeek,
  bookedFeesForDate,
  groupScheduledAppointments,
  scheduledAppointmentGroupFor,
  scheduleView,
  shiftDay,
  shiftWeek,
  weekRangeForDate,
} from "./schedule";

function appt(overrides: Partial<Appointment>): Appointment {
  return {
    id: "a1",
    client_id: "c1",
    pet_id: "p1",
    date: "2026-05-18",
    time_slot: "10:30am",
    service: "Full groom",
    price: 50,
    tip: null,
    notes: null,
    status: "booked",
    location: "gina",
    google_calendar_id: null,
    google_event_id: null,
    google_sync_status: null,
    google_sync_error: null,
    google_synced_at: null,
    created_at: "2026-05-18",
    ...overrides,
  };
}

const clients = [
  {
    id: "c1",
    first_name: "Mary",
    last_name: "Anca",
    phone: "705-330-1807",
    alt_contact: null,
    email: null,
    address: null,
    notes: null,
    sms_consent: false,
    sms_consent_at: null,
    created_at: "2026-01-01",
  },
] satisfies Client[];

const pets = [
  {
    id: "p1",
    client_id: "c1",
    name: "Whiskey",
    breed: "Yorkie",
    color: null,
    sex: null,
    date_of_birth: null,
    allergies: false,
    allergies_detail: null,
    grooming_notes: null,
    typical_fee: null,
    created_at: "2026-01-01",
  },
] satisfies Pet[];

const householdPets = [
  ...pets,
  {
    id: "p2",
    client_id: "c1",
    name: "Oliver",
    breed: "Mix",
    color: null,
    sex: null,
    date_of_birth: null,
    allergies: false,
    allergies_detail: null,
    grooming_notes: null,
    typical_fee: null,
    created_at: "2026-01-01",
  },
] satisfies Pet[];

describe("week schedule helpers", () => {
  it("builds a Sunday-to-Saturday range for the selected week", () => {
    expect(weekRangeForDate("2026-05-19").start).toBe("2026-05-17");
    expect(weekRangeForDate("2026-05-19").end).toBe("2026-05-23");
  });

  it("shifts a week by seven-day increments", () => {
    expect(shiftWeek("2026-05-17", 1)).toBe("2026-05-24");
    expect(shiftWeek("2026-05-17", -1)).toBe("2026-05-10");
  });

  it("shifts a selected day by one-day increments", () => {
    expect(shiftDay("2026-05-21", 1)).toBe("2026-05-22");
    expect(shiftDay("2026-05-21", -1)).toBe("2026-05-20");
  });

  it("defaults to week view unless day view is requested", () => {
    expect(scheduleView("day")).toBe("day");
    expect(scheduleView("week")).toBe("week");
    expect(scheduleView(undefined)).toBe("week");
    expect(scheduleView("month")).toBe("week");
  });

  it("returns scheduled appointments for the selected week in date/time order", () => {
    const range = weekRangeForDate("2026-05-19");
    const rows = appointmentsForWeek({
      appointments: [
        appt({
          id: "completed-scheduled",
          status: "completed",
          date: "2026-05-18",
          time_slot: "10:00am",
          notes: "[payment:cash; payment_status:paid]",
        }),
        appt({
          id: "completed-history",
          status: "completed",
          date: "2026-05-18",
          time_slot: null,
        }),
        appt({ id: "later", date: "2026-05-19", time_slot: "1:30pm" }),
        appt({ id: "earlier", date: "2026-05-19", time_slot: "9:00am" }),
        appt({
          id: "active",
          date: "2026-05-19",
          time_slot: "12:00pm",
          notes: "[workflow:in_progress]",
        }),
        appt({ id: "outside", date: "2026-06-01" }),
      ],
      clients,
      pets,
      range,
    });

    expect(rows.map((row) => row.appointment.id)).toEqual([
      "completed-scheduled",
      "earlier",
      "active",
      "later",
    ]);
    expect(rows[0].client?.first_name).toBe("Mary");
    expect(rows[0].pet?.name).toBe("Whiskey");
    expect(rows[0].isLogged).toBe(true);
    expect(rows[0].paymentPill?.label).toBe("Paid");
    expect(rows[2].workflowStage).toBe("active");
    expect(rows[2].workflowLabel).toBe("In progress");
  });

  it("returns booked appointments for a selected day in time order", () => {
    const rows = appointmentsForDay({
      appointments: [
        appt({ id: "tomorrow", date: "2026-05-22", time_slot: "9:00am" }),
        appt({ id: "later", date: "2026-05-21", time_slot: "1:30pm" }),
        appt({ id: "earlier", date: "2026-05-21", time_slot: "9:00am" }),
      ],
      clients,
      pets,
      date: "2026-05-21",
    });

    expect(rows.map((row) => row.appointment.id)).toEqual(["earlier", "later"]);
  });

  it("shows the logged groom row after it supersedes a booked appointment that day", () => {
    const rows = appointmentsForDay({
      appointments: [
        appt({ id: "booked", date: "2026-05-21", status: "booked" }),
        appt({
          id: "logged",
          date: "2026-05-21",
          status: "completed",
          time_slot: null,
        }),
      ],
      clients,
      pets,
      date: "2026-05-21",
    });

    expect(rows.map((row) => row.appointment.id)).toEqual(["logged"]);
    expect(rows[0].appointment.status).toBe("completed");
    expect(rows[0].appointment.time_slot).toBe("10:30am");
    expect(rows[0].isLogged).toBe(true);
  });

  it("groups same-household dogs booked in the same time bubble", () => {
    const rows = appointmentsForDay({
      appointments: [
        appt({ id: "pepper", pet_id: "p1", date: "2026-05-21", time_slot: "10:00am", price: 70 }),
        appt({
          id: "oliver",
          pet_id: "p2",
          date: "2026-05-21",
          time_slot: "10 am",
          price: 55,
          notes: "[payment:cash; payment_status:waiting]",
        }),
        appt({ id: "later", pet_id: "p1", date: "2026-05-21", time_slot: "1:30pm", price: 80 }),
      ],
      clients,
      pets: householdPets,
      date: "2026-05-21",
    });

    const groups = groupScheduledAppointments(rows);

    expect(groups).toHaveLength(2);
    expect(groups[0].appointmentIds).toEqual(["pepper", "oliver"]);
    expect(groups[0].petNames).toEqual(["Whiskey", "Oliver"]);
    expect(groups[0].petCount).toBe(2);
    expect(groups[0].workflowStage).toBe("scheduled");
    expect(groups[0].workflowLabel).toBe("2 dogs");
    expect(groups[0].paymentPill?.label).toBe("Waiting payment");
    expect(groups[0].paymentSummary).toEqual({
      fee: 125,
      paid: null,
      tip: null,
      isPaid: false,
    });
    expect(groups[0].gross).toBe(125);
  });

  it("uses a yellow group state when one dog is logged and one is still open", () => {
    const rows = appointmentsForDay({
      appointments: [
        appt({ id: "pepper", pet_id: "p1", date: "2026-05-21", time_slot: "10:00am" }),
        appt({
          id: "oliver",
          pet_id: "p2",
          date: "2026-05-21",
          time_slot: "10:00am",
          status: "completed",
        }),
      ],
      clients,
      pets: householdPets,
      date: "2026-05-21",
    });

    const groups = groupScheduledAppointments(rows);

    expect(groups).toHaveLength(1);
    expect(groups[0].workflowStage).toBe("active");
    expect(groups[0].workflowLabel).toBe("Partly logged");
  });

  it("finds only the matching household time group for edit scope", () => {
    const group = scheduledAppointmentGroupFor([
      appt({ id: "target", pet_id: "p1", date: "2026-05-21", time_slot: "10:00am" }),
      appt({ id: "sibling", pet_id: "p2", date: "2026-05-21", time_slot: "10 am" }),
      appt({ id: "other-time", pet_id: "p2", date: "2026-05-21", time_slot: "1:00pm" }),
      appt({ id: "other-client", client_id: "c2", pet_id: "p9", date: "2026-05-21", time_slot: "10:00am" }),
    ], "target");

    expect(group.map((appointment) => appointment.id)).toEqual(["target", "sibling"]);
  });

  it("totals booked fees for a selected day", () => {
    expect(
      bookedFeesForDate([
        appt({ id: "one", date: "2026-05-21", price: 80 }),
        appt({ id: "two", pet_id: "p2", date: "2026-05-21", price: 45 }),
        appt({ id: "no-fee", pet_id: "p3", date: "2026-05-21", price: null }),
        appt({
          id: "completed",
          pet_id: "p9",
          date: "2026-05-21",
          status: "completed",
          price: 90,
        }),
        appt({ id: "logged", date: "2026-05-21", status: "completed", price: 80 }),
        appt({ id: "other-day", date: "2026-05-22", price: 100 }),
      ], "2026-05-21"),
    ).toBe(45);
  });
});

describe("appointmentGroupPets", () => {
  const [whiskey, oliver] = householdPets;

  it("returns the booked dogs with the opened appointment's pet first", () => {
    const group = [
      appt({ id: "a-whiskey", pet_id: "p1" }),
      appt({ id: "a-oliver", pet_id: "p2" }),
    ];
    expect(appointmentGroupPets(group, householdPets, oliver)).toEqual([
      oliver,
      whiskey,
    ]);
  });

  it("returns just the primary pet for a single-dog booking", () => {
    const group = [appt({ id: "a-whiskey", pet_id: "p1" })];
    expect(appointmentGroupPets(group, householdPets, whiskey)).toEqual([whiskey]);
  });

  it("dedupes repeated pets and drops pets missing from the household", () => {
    const group = [
      appt({ id: "a-whiskey", pet_id: "p1" }),
      appt({ id: "a-whiskey-dup", pet_id: "p1" }),
      appt({ id: "a-oliver", pet_id: "p2" }),
      appt({ id: "a-ghost", pet_id: "p9" }),
    ];
    expect(appointmentGroupPets(group, householdPets, whiskey)).toEqual([
      whiskey,
      oliver,
    ]);
  });
});

describe("fixture schedule coverage", () => {
  it("includes at least one future booked appointment for local QA", () => {
    const today = new Date("2026-05-27T12:00:00");
    const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    expect(
      FIXTURE_APPOINTMENTS.some(
        (appointment) =>
          appointment.status === "booked" && appointment.date >= todayISO,
      ),
    ).toBe(true);
  });
});
