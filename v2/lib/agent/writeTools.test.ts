import { beforeEach, describe, expect, it, vi } from "vitest";
import { appointment, client, pet } from "@/lib/actions/actionTestSupport";
import { DEFAULT_ORG_SETTINGS } from "@/lib/orgSettings";
import {
  AGENT_WRITE_TOOL_NAMES,
  AgentToolError,
  runAgentWriteTool,
} from "./writeTools";
import type {
  AddTipProposal,
  BookAppointmentProposal,
  LogGroomProposal,
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
  it("is exactly the three Phase 3 propose tools", () => {
    expect([...AGENT_WRITE_TOOL_NAMES].sort()).toEqual([
      "propose_add_tip",
      "propose_book_appointment",
      "propose_log_groom",
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
