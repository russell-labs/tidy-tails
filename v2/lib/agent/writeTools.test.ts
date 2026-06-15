import { beforeEach, describe, expect, it, vi } from "vitest";
import { appointment, client, pet } from "@/lib/actions/actionTestSupport";
import { DEFAULT_ORG_SETTINGS } from "@/lib/orgSettings";
import {
  AGENT_WRITE_TOOL_NAMES,
  AgentToolError,
  runAgentWriteTool,
} from "./writeTools";
import type {
  AddHouseholdProposal,
  AddPetProposal,
  AddTipProposal,
  BookAppointmentProposal,
  DeleteHouseholdProposal,
  EditAppointmentProposal,
  EditHouseholdProposal,
  EditPetProposal,
  LogDailyIncomeProposal,
  LogGroomProposal,
  SendTextProposal,
} from "./proposals";

// The propose tools RESOLVE + VALIDATE entities through the org-scoped read
// loaders (mocked here) and return a proposal. They never write — the confirm
// action does. We assert the resolved proposal shape and that ambiguous / bad
// input is rejected so the model disambiguates rather than guessing.

vi.mock("@/lib/data/repo", async () => {
  const actual = await vi.importActual<typeof import("@/lib/data/repo")>(
    "@/lib/data/repo",
  );
  return { ...actual, loadDataset: vi.fn() };
});

vi.mock("@/lib/orgSettings.server", () => ({
  loadOrgSettings: vi.fn(),
}));

const { loadDataset } = await import("@/lib/data/repo");
const { loadOrgSettings } = await import("@/lib/orgSettings.server");
const loadDatasetMock = vi.mocked(loadDataset);
const loadOrgSettingsMock = vi.mocked(loadOrgSettings);

const TODAY = "2026-06-13";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T09:00:00`));
  loadOrgSettingsMock.mockResolvedValue(DEFAULT_ORG_SETTINGS); // batched
});

function dataset(overrides: Parameters<typeof buildDataset>[0] = {}) {
  return buildDataset(overrides);
}
function buildDataset(overrides: {
  clients?: ReturnType<typeof client>[];
  pets?: ReturnType<typeof pet>[];
  appointments?: ReturnType<typeof appointment>[];
} = {}) {
  return {
    clients: overrides.clients ?? [client()],
    pets: overrides.pets ?? [pet()],
    appointments: overrides.appointments ?? [],
    vaccinations: [],
  };
}

describe("AGENT_WRITE_TOOL_NAMES", () => {
  it("is exactly the full Phase 3+4 propose-tool surface", () => {
    expect([...AGENT_WRITE_TOOL_NAMES].sort()).toEqual([
      "propose_add_household",
      "propose_add_pet",
      "propose_add_tip",
      "propose_book_appointment",
      "propose_delete_household",
      "propose_edit_appointment",
      "propose_edit_household",
      "propose_edit_pet",
      "propose_log_daily_income",
      "propose_log_groom",
      "propose_send_text",
    ]);
  });
});

describe("propose_book_appointment (batched)", () => {
  it("resolves owner, pet, service, and location into a booking proposal", async () => {
    loadDatasetMock.mockResolvedValue(dataset());
    const proposal = (await runAgentWriteTool("propose_book_appointment", {
      client_id: "client-1",
      pet_ids: ["pet-1"],
      date: "2026-07-11",
      time_slot: "10:00am",
      service_type: "full_groom",
      fee: 50,
      location: "gina",
    })) as BookAppointmentProposal;

    expect(proposal.kind).toBe("book_appointment");
    expect(proposal.clientId).toBe("client-1");
    expect(proposal.petIds).toEqual(["pet-1"]);
    expect(proposal.petNames).toBe("Kiwi");
    expect(proposal.ownerName).toBe("Mary Jones");
    expect(proposal.service).toBe("Full groom");
    expect(proposal.fee).toBe(50);
    expect(proposal.location).toBe("gina");
    expect(proposal.locationLabel).toContain("Gina");
    expect(proposal.durationMinutes).toBeNull();
  });

  it("rejects a pet that is not on the client's file (never proposes on a guess)", async () => {
    loadDatasetMock.mockResolvedValue(
      dataset({ pets: [pet({ id: "pet-1", client_id: "someone-else" })] }),
    );
    await expect(
      runAgentWriteTool("propose_book_appointment", {
        client_id: "client-1",
        pet_ids: ["pet-1"],
        date: "2026-07-11",
        time_slot: "10:00am",
        service_type: "full_groom",
      }),
    ).rejects.toBeInstanceOf(AgentToolError);
  });

  it("requires a location (it drives Sam's payout split) — asks rather than guessing", async () => {
    loadDatasetMock.mockResolvedValue(dataset());
    await expect(
      runAgentWriteTool("propose_book_appointment", {
        client_id: "client-1",
        pet_ids: ["pet-1"],
        date: "2026-07-11",
        time_slot: "10:00am",
        service_type: "full_groom",
        // no location
      }),
    ).rejects.toBeInstanceOf(AgentToolError);
  });

  it("rejects an unknown service type", async () => {
    loadDatasetMock.mockResolvedValue(dataset());
    await expect(
      runAgentWriteTool("propose_book_appointment", {
        client_id: "client-1",
        pet_ids: ["pet-1"],
        date: "2026-07-11",
        time_slot: "10:00am",
        service_type: "haircut",
      }),
    ).rejects.toBeInstanceOf(AgentToolError);
  });
});

describe("propose_book_appointment (one_to_one)", () => {
  beforeEach(() => {
    loadOrgSettingsMock.mockResolvedValue({
      ...DEFAULT_ORG_SETTINGS,
      schedulingStyle: "one_to_one",
      locations: [{ name: "Home Studio", address: "1 Bay St" }],
    });
  });

  it("requires a location and duration before proposing", async () => {
    loadDatasetMock.mockResolvedValue(dataset());
    await expect(
      runAgentWriteTool("propose_book_appointment", {
        client_id: "client-1",
        pet_ids: ["pet-1"],
        date: "2026-07-11",
        time_slot: "10:00am",
        service_type: "full_groom",
      }),
    ).rejects.toBeInstanceOf(AgentToolError);
  });

  it("proposes a 1:1 booking with the resolved org location and duration", async () => {
    loadDatasetMock.mockResolvedValue(dataset());
    const proposal = (await runAgentWriteTool("propose_book_appointment", {
      client_id: "client-1",
      pet_ids: ["pet-1"],
      date: "2026-07-11",
      time_slot: "10:00am",
      service_type: "full_groom",
      location: "Home Studio",
      duration_minutes: 90,
    })) as BookAppointmentProposal;
    expect(proposal.durationMinutes).toBe(90);
    expect(proposal.location).toBe("Home Studio");
    expect(proposal.locationLabel).toContain("Bay");
  });
});

describe("propose_add_tip", () => {
  const completed = appointment({
    id: "appt-done",
    pet_id: "pet-1",
    client_id: "client-1",
    date: "2026-06-10",
    status: "completed",
    price: 50,
    tip: 0,
    notes: "Good boy [payment:interac; payment_status:paid]",
  });

  it("resolves the most recent completed groom and computes the new total", async () => {
    loadDatasetMock.mockResolvedValue(dataset({ appointments: [completed] }));
    const proposal = (await runAgentWriteTool("propose_add_tip", {
      pet_id: "pet-1",
      added_tip: 5,
    })) as AddTipProposal;

    expect(proposal.kind).toBe("add_tip");
    expect(proposal.petName).toBe("Kiwi");
    expect(proposal.appointmentDate).toBe("2026-06-10");
    expect(proposal.fee).toBe(50);
    expect(proposal.currentTip).toBe(0);
    expect(proposal.addedTip).toBe(5);
    expect(proposal.newTip).toBe(5);
    expect(proposal.paidAmount).toBe(55); // fee + new total tip → markAppointmentPaid
    expect(proposal.paymentMethod).toBe("interac"); // parsed from the existing notes
  });

  it("refuses when there is no completed groom to tip", async () => {
    loadDatasetMock.mockResolvedValue(
      dataset({ appointments: [appointment({ status: "booked" })] }),
    );
    await expect(
      runAgentWriteTool("propose_add_tip", { pet_id: "pet-1", added_tip: 5 }),
    ).rejects.toBeInstanceOf(AgentToolError);
  });

  it("rejects a non-positive tip amount", async () => {
    loadDatasetMock.mockResolvedValue(dataset({ appointments: [completed] }));
    await expect(
      runAgentWriteTool("propose_add_tip", { pet_id: "pet-1", added_tip: 0 }),
    ).rejects.toBeInstanceOf(AgentToolError);
  });
});

describe("propose_log_groom", () => {
  it("resolves a complete groom-log proposal", async () => {
    loadDatasetMock.mockResolvedValue(dataset());
    const proposal = (await runAgentWriteTool("propose_log_groom", {
      client_id: "client-1",
      pet_id: "pet-1",
      date: "2026-06-12",
      service_type: "bath_only",
      fee: 35,
      tip: 10,
      payment_method: "cash",
      payment_status: "paid",
    })) as LogGroomProposal;

    expect(proposal.kind).toBe("log_groom");
    expect(proposal.petName).toBe("Kiwi");
    expect(proposal.service).toBe("Bath only");
    expect(proposal.fee).toBe(35);
    expect(proposal.tip).toBe(10);
    expect(proposal.paymentMethod).toBe("cash");
    expect(proposal.paymentStatus).toBe("paid");
  });

  it("refuses a future-dated groom (inherits the groom validator)", async () => {
    loadDatasetMock.mockResolvedValue(dataset());
    await expect(
      runAgentWriteTool("propose_log_groom", {
        client_id: "client-1",
        pet_id: "pet-1",
        date: "2027-01-01",
        service_type: "bath_only",
      }),
    ).rejects.toBeInstanceOf(AgentToolError);
  });
});

// ---------------------------------------------------------------------------
// Phase 4 — the complete write surface. Each propose tool RESOLVES + VALIDATES
// against the org-scoped loaders and returns a proposal; it never writes.
// ---------------------------------------------------------------------------

describe("propose_add_household", () => {
  it("resolves a new household + first pet into a proposal", async () => {
    loadDatasetMock.mockResolvedValue(dataset());
    const proposal = (await runAgentWriteTool("propose_add_household", {
      first_name: "Dana",
      last_name: "Reed",
      phone: "705-555-0190",
      email: "dana@example.com",
      pet_name: "Biscuit",
      breed: "Beagle",
      size: "medium",
      allergy_state: "no",
      vaccination_state: "yes",
      vaccination_detail: "Rabies current",
      typical_fee: 72,
    })) as AddHouseholdProposal;

    expect(proposal.kind).toBe("add_household");
    expect(proposal.ownerName).toBe("Dana Reed");
    expect(proposal.phone).toBe("705-555-0190");
    expect(proposal.pet.name).toBe("Biscuit");
    expect(proposal.pet.typicalFee).toBe(72);
  });

  it("refuses when there is no pet name (intake always carries a pet)", async () => {
    loadDatasetMock.mockResolvedValue(dataset());
    await expect(
      runAgentWriteTool("propose_add_household", {
        first_name: "Dana",
        last_name: "Reed",
        phone: "705-555-0190",
      }),
    ).rejects.toBeInstanceOf(AgentToolError);
  });
});

describe("propose_add_pet", () => {
  it("resolves a pet for an existing household", async () => {
    loadDatasetMock.mockResolvedValue(dataset());
    const proposal = (await runAgentWriteTool("propose_add_pet", {
      client_id: "client-1",
      name: "Maple",
      breed: "Poodle",
      size: "medium",
      allergy_state: "no",
      typical_fee: 82,
    })) as AddPetProposal;

    expect(proposal.kind).toBe("add_pet");
    expect(proposal.clientId).toBe("client-1");
    expect(proposal.ownerName).toBe("Mary Jones");
    expect(proposal.name).toBe("Maple");
  });

  it("refuses an unknown household", async () => {
    loadDatasetMock.mockResolvedValue(dataset());
    await expect(
      runAgentWriteTool("propose_add_pet", { client_id: "nope", name: "Maple", size: "medium", allergy_state: "no" }),
    ).rejects.toBeInstanceOf(AgentToolError);
  });
});

describe("propose_edit_household", () => {
  it("merges a phone change while preserving the rest, and lists the change", async () => {
    loadDatasetMock.mockResolvedValue(dataset());
    const proposal = (await runAgentWriteTool("propose_edit_household", {
      client_id: "client-1",
      phone: "705-555-7777",
    })) as EditHouseholdProposal;

    expect(proposal.kind).toBe("edit_household");
    expect(proposal.phone).toBe("705-555-7777");
    expect(proposal.firstName).toBe("Mary"); // unchanged, preserved
    expect(proposal.changes.join(" ")).toContain("705-555-7777");
  });

  it("refuses when nothing was asked to change", async () => {
    loadDatasetMock.mockResolvedValue(dataset());
    await expect(
      runAgentWriteTool("propose_edit_household", { client_id: "client-1" }),
    ).rejects.toBeInstanceOf(AgentToolError);
  });
});

describe("propose_edit_pet", () => {
  it("merges a grooming-note change while preserving the rest", async () => {
    loadDatasetMock.mockResolvedValue(dataset());
    const proposal = (await runAgentWriteTool("propose_edit_pet", {
      client_id: "client-1",
      pet_id: "pet-1",
      grooming_notes: "Use #5 blade",
    })) as EditPetProposal;

    expect(proposal.kind).toBe("edit_pet");
    expect(proposal.name).toBe("Kiwi"); // unchanged
    expect(proposal.groomingNotes).toBe("Use #5 blade");
    expect(proposal.changes.length).toBeGreaterThan(0);
  });
});

describe("propose_edit_appointment", () => {
  // The visit is identified by pet + CURRENT date (+ time), never an id — the
  // read tools don't expose ids. The proposal carries the re-resolution tuple
  // (petId + targetDate + targetTimeSlot) the confirm action re-runs server-side.
  const booked = appointment({
    id: "appt-future",
    pet_id: "pet-1",
    client_id: "client-1",
    date: "2026-07-20",
    time_slot: "10:30am",
    service: "Full groom",
    status: "booked",
    location: "gina",
    price: 70,
  });

  it("reschedules (changes the date) on the batched surface", async () => {
    loadDatasetMock.mockResolvedValue(dataset({ appointments: [booked] }));
    const proposal = (await runAgentWriteTool("propose_edit_appointment", {
      client_id: "client-1",
      pet_id: "pet-1",
      date: "2026-07-20", // current date — identifies the visit
      mode: "change",
      new_date: "2026-07-21", // reschedule target
    })) as EditAppointmentProposal;

    expect(proposal.kind).toBe("edit_appointment");
    if (proposal.mode !== "reschedule_change") throw new Error("expected reschedule_change");
    expect(proposal.date).toBe("2026-07-21"); // the NEW date written
    expect(proposal.targetDate).toBe("2026-07-20"); // re-resolution tuple = current date
    expect(proposal.targetTimeSlot).toBe("10:30am");
    expect(proposal.petId).toBe("pet-1");
    expect(proposal.service).toBe("Full groom"); // preserved
    expect(proposal.changes).toContain("date → 2026-07-21");
  });

  it("changes a field WITHOUT moving the visit (keeps the current date when no new_date)", async () => {
    loadDatasetMock.mockResolvedValue(dataset({ appointments: [booked] }));
    const proposal = (await runAgentWriteTool("propose_edit_appointment", {
      client_id: "client-1",
      pet_id: "pet-1",
      date: "2026-07-20",
      mode: "change",
      service_type: "bath_only",
    })) as EditAppointmentProposal;
    if (proposal.mode !== "reschedule_change") throw new Error("expected reschedule_change");
    expect(proposal.date).toBe("2026-07-20"); // unchanged — identifier date kept
    expect(proposal.targetDate).toBe("2026-07-20");
    expect(proposal.serviceType).toBe("bath_only");
    expect(proposal.changes).toContain("service → Bath only");
  });

  it("cancels a booking", async () => {
    loadDatasetMock.mockResolvedValue(dataset({ appointments: [booked] }));
    const proposal = (await runAgentWriteTool("propose_edit_appointment", {
      client_id: "client-1",
      pet_id: "pet-1",
      date: "2026-07-20",
      mode: "cancel",
    })) as EditAppointmentProposal;
    expect(proposal.mode).toBe("cancel");
    if (proposal.mode !== "cancel") throw new Error("expected cancel");
    expect(proposal.targetDate).toBe("2026-07-20");
    expect(proposal.petId).toBe("pet-1");
  });

  it("marks a booked visit as a no-show (keeps the record)", async () => {
    loadDatasetMock.mockResolvedValue(dataset({ appointments: [booked] }));
    const proposal = (await runAgentWriteTool("propose_edit_appointment", {
      client_id: "client-1",
      pet_id: "pet-1",
      date: "2026-07-20",
      mode: "no_show",
    })) as EditAppointmentProposal;
    expect(proposal.kind).toBe("edit_appointment");
    expect(proposal.mode).toBe("no_show");
    if (proposal.mode !== "no_show") throw new Error("expected no_show");
    expect(proposal.targetDate).toBe("2026-07-20");
    expect(proposal.targetTimeSlot).toBe("10:30am");
    expect(proposal.date).toBe("2026-07-20");
  });

  it("refuses when no visit matches the pet + date (never guesses)", async () => {
    loadDatasetMock.mockResolvedValue(dataset({ appointments: [booked] }));
    await expect(
      runAgentWriteTool("propose_edit_appointment", {
        client_id: "client-1",
        pet_id: "pet-1",
        date: "2026-08-01", // no visit that day
        mode: "cancel",
      }),
    ).rejects.toBeInstanceOf(AgentToolError);
  });

  it("disambiguates a same-day duplicate (asks which time) instead of acting on a guess", async () => {
    const morning = appointment({
      id: "appt-am",
      pet_id: "pet-1",
      client_id: "client-1",
      date: "2026-07-20",
      time_slot: "10:00am",
      service: "Full groom",
      status: "booked",
    });
    const afternoon = appointment({
      id: "appt-pm",
      pet_id: "pet-1",
      client_id: "client-1",
      date: "2026-07-20",
      time_slot: "2:00pm",
      service: "Bath only",
      status: "booked",
    });
    loadDatasetMock.mockResolvedValue(dataset({ appointments: [morning, afternoon] }));
    // No time → ambiguous, must refuse.
    await expect(
      runAgentWriteTool("propose_edit_appointment", {
        client_id: "client-1",
        pet_id: "pet-1",
        date: "2026-07-20",
        mode: "cancel",
      }),
    ).rejects.toBeInstanceOf(AgentToolError);

    // With the disambiguating time → resolves the RIGHT visit's tuple.
    const proposal = (await runAgentWriteTool("propose_edit_appointment", {
      client_id: "client-1",
      pet_id: "pet-1",
      date: "2026-07-20",
      time_slot: "2:00pm",
      mode: "cancel",
    })) as EditAppointmentProposal;
    if (proposal.mode !== "cancel") throw new Error("expected cancel");
    expect(proposal.targetTimeSlot).toBe("2:00pm");
    expect(proposal.service).toBe("Bath only");
  });

  it("refuses a no-show on a non-booked visit (mirrors the action guard)", async () => {
    const completed = appointment({
      id: "appt-done",
      pet_id: "pet-1",
      client_id: "client-1",
      date: "2026-06-01",
      status: "completed",
    });
    loadDatasetMock.mockResolvedValue(dataset({ appointments: [completed] }));
    await expect(
      runAgentWriteTool("propose_edit_appointment", {
        client_id: "client-1",
        pet_id: "pet-1",
        date: "2026-06-01",
        mode: "no_show",
      }),
    ).rejects.toBeInstanceOf(AgentToolError);
  });

  it("reschedules a 1:1 visit, preserving the org's own location", async () => {
    const oneToOneVisit = appointment({
      id: "appt-1to1",
      pet_id: "pet-1",
      client_id: "client-1",
      date: "2026-07-20",
      time_slot: "10:00am",
      service: "Full groom",
      status: "booked",
      location: "Home Studio",
      duration_minutes: 90,
      price: 70,
    });
    loadOrgSettingsMock.mockResolvedValue({
      ...DEFAULT_ORG_SETTINGS,
      schedulingStyle: "one_to_one",
      locations: [{ name: "Home Studio", address: "1 Bay St" }],
    });
    loadDatasetMock.mockResolvedValue(dataset({ appointments: [oneToOneVisit] }));
    const proposal = (await runAgentWriteTool("propose_edit_appointment", {
      client_id: "client-1",
      pet_id: "pet-1",
      date: "2026-07-20",
      mode: "change",
      new_date: "2026-07-21",
    })) as EditAppointmentProposal;
    expect(proposal.kind).toBe("edit_appointment");
    if (proposal.mode !== "reschedule_change") throw new Error("expected reschedule_change");
    expect(proposal.date).toBe("2026-07-21");
    expect(proposal.location).toBe("Home Studio"); // org location preserved, not blanked
  });

  it("refuses a 1:1 edit when the location is not one of the org's locations", async () => {
    const oneToOneVisit = appointment({
      id: "appt-1to1",
      pet_id: "pet-1",
      client_id: "client-1",
      date: "2026-07-20",
      status: "booked",
      service: "Full groom",
      location: "Old Studio", // no longer an org location
      duration_minutes: 90,
    });
    loadOrgSettingsMock.mockResolvedValue({
      ...DEFAULT_ORG_SETTINGS,
      schedulingStyle: "one_to_one",
      locations: [{ name: "Home Studio", address: "1 Bay St" }],
    });
    loadDatasetMock.mockResolvedValue(dataset({ appointments: [oneToOneVisit] }));
    await expect(
      runAgentWriteTool("propose_edit_appointment", {
        client_id: "client-1",
        pet_id: "pet-1",
        date: "2026-07-20",
        mode: "change",
        location: "Old Studio",
      }),
    ).rejects.toBeInstanceOf(AgentToolError);
  });
});

describe("propose_delete_household", () => {
  it("proposes deleting a household with no appointment history", async () => {
    loadDatasetMock.mockResolvedValue(dataset({ appointments: [] }));
    const proposal = (await runAgentWriteTool("propose_delete_household", {
      client_id: "client-1",
    })) as DeleteHouseholdProposal;
    expect(proposal.kind).toBe("delete_household");
    expect(proposal.ownerName).toBe("Mary Jones");
    expect(proposal.hasHistory).toBe(false);
  });

  it("refuses when the household has appointment history (mirrors the action guard)", async () => {
    loadDatasetMock.mockResolvedValue(
      dataset({ appointments: [appointment({ client_id: "client-1" })] }),
    );
    await expect(
      runAgentWriteTool("propose_delete_household", { client_id: "client-1" }),
    ).rejects.toBeInstanceOf(AgentToolError);
  });
});

describe("propose_log_daily_income", () => {
  it("proposes a payout override incl. paid-by-salon keep-100%", async () => {
    loadDatasetMock.mockResolvedValue(dataset());
    const proposal = (await runAgentWriteTool("propose_log_daily_income", {
      date: "2026-07-12",
      location: "gina",
      final_payout: 240,
      paid_by_salon: true,
    })) as LogDailyIncomeProposal;

    expect(proposal.kind).toBe("log_daily_income");
    expect(proposal.finalPayout).toBe(240);
    expect(proposal.paidBySalon).toBe(true);
    expect(proposal.location).toBe("gina");
  });
});

describe("propose_send_text", () => {
  it("drafts a reminder, resolving the appointment by pet + date (no appointment id needed)", async () => {
    const booked = appointment({
      id: "appt-r",
      client_id: "client-1",
      pet_id: "pet-1",
      date: "2026-07-20",
      time_slot: "10:30am",
      status: "booked",
    });
    loadDatasetMock.mockResolvedValue(dataset({ appointments: [booked] }));
    const proposal = (await runAgentWriteTool("propose_send_text", {
      mode: "reminder",
      client_id: "client-1",
      pet_id: "pet-1",
      date: "2026-07-20",
      message: "Hi Mary, reminder Kiwi is booked for Monday at 10:30am.",
    })) as SendTextProposal;

    expect(proposal.kind).toBe("send_text");
    if (proposal.mode !== "reminder") throw new Error("expected reminder");
    // Carries the re-resolution tuple (pet + the visit's CURRENT date/time), NOT an
    // appointment id — the read tools never expose ids, so the model can't supply one.
    expect(proposal.petId).toBe("pet-1");
    expect(proposal.targetDate).toBe("2026-07-20");
    expect(proposal.targetTimeSlot).toBe("10:30am");
    expect(proposal).not.toHaveProperty("appointmentId");
    expect(proposal.toNumber).toContain("705");
    expect(proposal.message).toContain("Kiwi");
  });

  it("refuses a reminder when the pet has no visit on that date (asks, never guesses)", async () => {
    loadDatasetMock.mockResolvedValue(dataset({ appointments: [] }));
    await expect(
      runAgentWriteTool("propose_send_text", {
        mode: "reminder",
        client_id: "client-1",
        pet_id: "pet-1",
        date: "2026-07-20",
        message: "Reminder for Kiwi.",
      }),
    ).rejects.toBeInstanceOf(AgentToolError);
  });

  it("refuses a same-day duplicate a time can't disambiguate (lists the times)", async () => {
    const am = appointment({ id: "appt-am", pet_id: "pet-1", date: "2026-07-20", time_slot: "9:00am", status: "booked" });
    const pm = appointment({ id: "appt-pm", pet_id: "pet-1", date: "2026-07-20", time_slot: "2:00pm", status: "booked" });
    loadDatasetMock.mockResolvedValue(dataset({ appointments: [am, pm] }));
    await expect(
      runAgentWriteTool("propose_send_text", {
        mode: "reminder",
        client_id: "client-1",
        pet_id: "pet-1",
        date: "2026-07-20",
        message: "Reminder for Kiwi.",
      }),
    ).rejects.toThrow(/9:00am|2:00pm/);
  });

  it("disambiguates a same-day duplicate when the visit time is given", async () => {
    const am = appointment({ id: "appt-am", pet_id: "pet-1", date: "2026-07-20", time_slot: "9:00am", status: "booked" });
    const pm = appointment({ id: "appt-pm", pet_id: "pet-1", date: "2026-07-20", time_slot: "2:00pm", status: "booked" });
    loadDatasetMock.mockResolvedValue(dataset({ appointments: [am, pm] }));
    const proposal = (await runAgentWriteTool("propose_send_text", {
      mode: "reminder",
      client_id: "client-1",
      pet_id: "pet-1",
      date: "2026-07-20",
      time_slot: "2:00pm",
      message: "Reminder for Kiwi.",
    })) as SendTextProposal;
    if (proposal.mode !== "reminder") throw new Error("expected reminder");
    expect(proposal.targetTimeSlot).toBe("2:00pm");
  });

  it("drafts a reply to a specific inbound message WITHOUT loading any customer text here", async () => {
    const proposal = (await runAgentWriteTool("propose_send_text", {
      mode: "reply",
      sms_id: "sms-1",
      message: "Yes, 2pm works — see you then!",
      recipient_label: "Mary Jones",
    })) as SendTextProposal;

    expect(proposal.kind).toBe("send_text");
    if (proposal.mode !== "reply") throw new Error("expected reply");
    expect(proposal.smsId).toBe("sms-1");
    expect(proposal.message).toContain("2pm");
    // The propose tool must not touch the dataset for a reply (no customer text here).
    expect(loadDatasetMock).not.toHaveBeenCalled();
  });

  it("refuses an empty draft (nothing to send)", async () => {
    await expect(
      runAgentWriteTool("propose_send_text", { mode: "reply", sms_id: "sms-1", message: "   " }),
    ).rejects.toBeInstanceOf(AgentToolError);
  });
});
