import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appointment,
  client,
  pet,
} from "@/lib/actions/actionTestSupport";
import { DEFAULT_OPERATOR_SETTINGS } from "@/lib/operatorSettings";
import { DEFAULT_ORG_SETTINGS } from "@/lib/orgSettings";
import {
  AGENT_READ_TOOL_NAMES,
  AgentToolError,
  runAgentTool,
} from "./tools";

// The read tools are thin wrappers over the org-scoped loaders. We mock those
// loaders (the RLS boundary lives below them, exercised by the SQL isolation
// gate) and assert each tool shapes the data the way the agent will see it.

vi.mock("@/lib/data/repo", async () => {
  const actual = await vi.importActual<typeof import("@/lib/data/repo")>(
    "@/lib/data/repo",
  );
  return {
    ...actual,
    loadDataset: vi.fn(),
    loadDayCloseoutOverrides: vi.fn(async () => []),
  };
});

vi.mock("@/lib/operatorSettings.server", () => ({
  readOperatorSettings: vi.fn(async () => DEFAULT_OPERATOR_SETTINGS),
}));

vi.mock("@/lib/orgSettings.server", () => ({
  loadOrgSettings: vi.fn(),
}));

const { loadDataset } = await import("@/lib/data/repo");
const loadDatasetMock = vi.mocked(loadDataset);
const { loadOrgSettings } = await import("@/lib/orgSettings.server");
const loadOrgSettingsMock = vi.mocked(loadOrgSettings);

const TODAY = "2026-06-13";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // Pin "today" so date-defaulting tools are deterministic (todayISO uses local).
  vi.setSystemTime(new Date(`${TODAY}T09:00:00`));
  loadOrgSettingsMock.mockResolvedValue(DEFAULT_ORG_SETTINGS); // batched default
});

function dataset(overrides: {
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

describe("get_schedule", () => {
  it("returns the day's appointments enriched with owner and pet", async () => {
    loadDatasetMock.mockResolvedValue(
      dataset({
        appointments: [
          appointment({ date: TODAY, time_slot: "10:30am", service: "Full groom", price: 70 }),
        ],
      }),
    );

    const result = (await runAgentTool("get_schedule", { date: TODAY })) as {
      totalAppointments: number;
      days: { date: string; appointments: { owner: string; pet: string; service: string }[] }[];
    };

    expect(result.totalAppointments).toBe(1);
    expect(result.days[0].date).toBe(TODAY);
    expect(result.days[0].appointments[0]).toMatchObject({
      owner: "Mary Jones",
      pet: "Kiwi",
      service: "Full groom",
      fee: 70,
    });
  });

  it("defaults to today when no date is given", async () => {
    loadDatasetMock.mockResolvedValue(dataset());
    const result = (await runAgentTool("get_schedule", {})) as {
      range: { from: string; to: string };
    };
    expect(result.range.from).toBe(TODAY);
  });

  it("rejects a non-ISO date", async () => {
    loadDatasetMock.mockResolvedValue(dataset());
    await expect(runAgentTool("get_schedule", { date: "Friday" })).rejects.toBeInstanceOf(
      AgentToolError,
    );
  });

  it("collapses a logged-groom duplicate to one row (matches the Schedule screen)", async () => {
    // A completed groom + its leftover booked row for the same visit (same
    // client/pet/date) must read as one appointment, not two.
    const base = {
      client_id: "client-1",
      pet_id: "pet-1",
      date: TODAY,
      location: "gina",
      price: 70,
      time_slot: "9:00am",
    };
    loadDatasetMock.mockResolvedValue(
      dataset({
        appointments: [
          appointment({ ...base, id: "done", status: "completed" }),
          appointment({ ...base, id: "book", status: "booked" }),
        ],
      }),
    );
    const result = (await runAgentTool("get_schedule", { date: TODAY })) as {
      totalAppointments: number;
    };
    expect(result.totalAppointments).toBe(1);
  });

  it("rejects a half-specified range", async () => {
    loadDatasetMock.mockResolvedValue(dataset());
    await expect(
      runAgentTool("get_schedule", { start_date: "2026-06-13" }),
    ).rejects.toBeInstanceOf(AgentToolError);
  });
});

describe("find_household", () => {
  it("returns ranked matches and surfaces ambiguity (two dogs named Coco)", async () => {
    loadDatasetMock.mockResolvedValue(
      dataset({
        clients: [
          client({ id: "c1", first_name: "Rosanne", last_name: "Adams" }),
          client({ id: "c2", first_name: "Theo", last_name: "Bell" }),
        ],
        pets: [
          pet({ id: "p1", client_id: "c1", name: "Coco" }),
          pet({ id: "p2", client_id: "c2", name: "Coco" }),
        ],
      }),
    );

    const result = (await runAgentTool("find_household", { query: "Coco" })) as {
      matchCount: number;
      households: { householdId: string; owner: string }[];
    };

    // Two distinct households match — the agent must disambiguate, not guess.
    expect(result.matchCount).toBe(2);
    expect(result.households.map((h) => h.householdId).sort()).toEqual(["c1", "c2"]);
  });

  it("rejects an empty query", async () => {
    loadDatasetMock.mockResolvedValue(dataset());
    await expect(runAgentTool("find_household", { query: "  " })).rejects.toBeInstanceOf(
      AgentToolError,
    );
  });
});

describe("get_pet_history", () => {
  it("returns the pet's profile, owner, and visits newest-first", async () => {
    loadDatasetMock.mockResolvedValue(
      dataset({
        appointments: [
          appointment({ id: "a1", date: "2026-01-10", service: "Bath" }),
          appointment({ id: "a2", date: "2026-05-10", service: "Full groom" }),
        ],
      }),
    );

    const result = (await runAgentTool("get_pet_history", { pet_id: "pet-1" })) as {
      pet: { name: string };
      owner: { name: string };
      visits: { date: string; service: string }[];
    };

    expect(result.pet.name).toBe("Kiwi");
    expect(result.owner.name).toBe("Mary Jones");
    expect(result.visits.map((v) => v.date)).toEqual(["2026-05-10", "2026-01-10"]);
  });

  it("rejects an unknown pet id", async () => {
    loadDatasetMock.mockResolvedValue(dataset());
    await expect(
      runAgentTool("get_pet_history", { pet_id: "nope" }),
    ).rejects.toBeInstanceOf(AgentToolError);
  });
});

describe("get_day_income", () => {
  it("totals a day's money via the shared closeout calculation", async () => {
    loadDatasetMock.mockResolvedValue(
      dataset({
        appointments: [
          appointment({ date: TODAY, price: 70, status: "completed", location: "gina" }),
        ],
      }),
    );

    const result = (await runAgentTool("get_day_income", { date: TODAY })) as {
      date: string;
      gross: number;
      operatorNet: number;
    };

    expect(result.date).toBe(TODAY);
    expect(typeof result.gross).toBe("number");
    expect(typeof result.operatorNet).toBe("number");
  });

  it("does not double-count a logged-groom duplicate (matches Reports gross)", async () => {
    const base = {
      client_id: "client-1",
      pet_id: "pet-1",
      date: TODAY,
      location: "gina",
      price: 70,
    };
    // Day with only the completed visit.
    loadDatasetMock.mockResolvedValueOnce(
      dataset({ appointments: [appointment({ ...base, id: "done", status: "completed" })] }),
    );
    const single = (await runAgentTool("get_day_income", { date: TODAY })) as {
      gross: number;
    };
    // Same day with the leftover booked duplicate of that visit added.
    loadDatasetMock.mockResolvedValueOnce(
      dataset({
        appointments: [
          appointment({ ...base, id: "done", status: "completed" }),
          appointment({ ...base, id: "book", status: "booked" }),
        ],
      }),
    );
    const withDuplicate = (await runAgentTool("get_day_income", { date: TODAY })) as {
      gross: number;
    };

    expect(single.gross).toBeGreaterThan(0);
    expect(withDuplicate.gross).toBe(single.gross);
  });
});

describe("list_lapsed_clients", () => {
  it("lists clients with no recent visit, using the operator threshold by default", async () => {
    loadDatasetMock.mockResolvedValue(
      dataset({
        clients: [client({ id: "c1", first_name: "Lapsed", last_name: "Larry" })],
        pets: [pet({ id: "p1", client_id: "c1", name: "Rex" })],
        appointments: [
          appointment({ id: "a1", client_id: "c1", pet_id: "p1", date: "2024-01-01" }),
        ],
      }),
    );

    const result = (await runAgentTool("list_lapsed_clients", {})) as {
      thresholdDays: number;
      clients: { owner: string; pets: string[]; daysSince: number | null }[];
    };

    expect(result.thresholdDays).toBe(DEFAULT_OPERATOR_SETTINGS.lapsedThresholdDays);
    expect(result.clients[0].owner).toBe("Lapsed Larry");
    expect(result.clients[0].pets).toContain("Rex");
  });

  it("rejects a non-positive threshold", async () => {
    loadDatasetMock.mockResolvedValue(dataset());
    await expect(
      runAgentTool("list_lapsed_clients", { threshold_days: 0 }),
    ).rejects.toBeInstanceOf(AgentToolError);
  });
});

describe("dispatch", () => {
  it("throws for an unknown tool name", async () => {
    await expect(runAgentTool("send_text", {})).rejects.toBeInstanceOf(AgentToolError);
  });

  it("only knows the intended read tools", () => {
    expect([...AGENT_READ_TOOL_NAMES].sort()).toEqual([
      "find_household",
      "get_day_income",
      "get_groom_detail",
      "get_locations",
      "get_pet_history",
      "get_schedule",
      "list_lapsed_clients",
    ]);
  });
});

describe("get_pet_history — operator groom detail", () => {
  it("exposes the operator's own per-visit groom notes and standing pet notes", async () => {
    loadDatasetMock.mockResolvedValue(
      dataset({
        pets: [pet({ id: "pet-1", grooming_notes: "Clipper #4 all over; matted behind ears." })],
        appointments: [
          appointment({
            id: "a1",
            date: "2026-05-10",
            service: "Full groom",
            status: "completed",
            notes: "Used clipper #5 on the legs; nervous about the dryer.",
          }),
        ],
      }),
    );

    const result = (await runAgentTool("get_pet_history", { pet_id: "pet-1" })) as {
      pet: { groomingNotes: string | null };
      visits: { date: string; notes: string | null }[];
    };

    expect(result.pet.groomingNotes).toBe("Clipper #4 all over; matted behind ears.");
    expect(result.visits[0].notes).toBe("Used clipper #5 on the legs; nervous about the dryer.");
  });
});

describe("get_groom_detail", () => {
  it("returns the most recent completed groom's operator notes (the 'what clipper last time' answer)", async () => {
    loadDatasetMock.mockResolvedValue(
      dataset({
        pets: [pet({ id: "pet-1", grooming_notes: "Sensitive skin — oatmeal shampoo." })],
        appointments: [
          appointment({
            id: "old",
            date: "2026-01-10",
            status: "completed",
            notes: "Clipper #3.",
          }),
          appointment({
            id: "recent",
            date: "2026-05-10",
            service: "Full groom",
            status: "completed",
            notes: "Clipper #4; used the de-shedding tool.",
          }),
        ],
      }),
    );

    const result = (await runAgentTool("get_groom_detail", { pet_id: "pet-1" })) as {
      pet: { name: string; groomingNotes: string | null };
      groom: { date: string; notes: string | null } | null;
    };

    expect(result.groom?.date).toBe("2026-05-10");
    expect(result.groom?.notes).toBe("Clipper #4; used the de-shedding tool.");
    expect(result.pet.groomingNotes).toBe("Sensitive skin — oatmeal shampoo.");
  });

  it("targets a specific visit when a date is given", async () => {
    loadDatasetMock.mockResolvedValue(
      dataset({
        appointments: [
          appointment({ id: "old", date: "2026-01-10", status: "completed", notes: "Clipper #3." }),
          appointment({ id: "recent", date: "2026-05-10", status: "completed", notes: "Clipper #4." }),
        ],
      }),
    );

    const result = (await runAgentTool("get_groom_detail", {
      pet_id: "pet-1",
      date: "2026-01-10",
    })) as { groom: { date: string; notes: string | null } | null };

    expect(result.groom?.date).toBe("2026-01-10");
    expect(result.groom?.notes).toBe("Clipper #3.");
  });

  it("rejects an unknown pet id", async () => {
    loadDatasetMock.mockResolvedValue(dataset());
    await expect(
      runAgentTool("get_groom_detail", { pet_id: "nope" }),
    ).rejects.toBeInstanceOf(AgentToolError);
  });

  it("rejects a non-ISO date", async () => {
    loadDatasetMock.mockResolvedValue(dataset());
    await expect(
      runAgentTool("get_groom_detail", { pet_id: "pet-1", date: "last week" }),
    ).rejects.toBeInstanceOf(AgentToolError);
  });
});

describe("get_locations", () => {
  it("returns the org's configured locations for a 1:1 business", async () => {
    loadOrgSettingsMock.mockResolvedValue({
      ...DEFAULT_ORG_SETTINGS,
      schedulingStyle: "one_to_one",
      locations: [
        { name: "Gina's Salon", address: "12 King Street" },
        { name: "Home Studio", address: "5 Maple Avenue" },
      ],
    });
    const result = (await runAgentTool("get_locations", {})) as {
      schedulingStyle: string;
      locations: { name: string; label: string; address: string | null }[];
    };
    expect(result.schedulingStyle).toBe("one_to_one");
    expect(result.locations.map((l) => l.name)).toEqual(["Gina's Salon", "Home Studio"]);
    expect(result.locations[0].address).toBe("12 King Street");
  });

  it("returns the gina/annette options for a batched business with operator-facing labels", async () => {
    loadOrgSettingsMock.mockResolvedValue(DEFAULT_ORG_SETTINGS); // batched
    const result = (await runAgentTool("get_locations", {})) as {
      schedulingStyle: string;
      locations: { name: string; label: string }[];
    };
    expect(result.schedulingStyle).toBe("batched");
    expect(result.locations.map((l) => l.name).sort()).toEqual(["annette", "gina"]);
    expect(result.locations.find((l) => l.name === "gina")?.label).toContain("Gina");
  });
});
