import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { Appointment, Client, DayCloseoutOverride, Pet } from "./data/types";
import {
  BOOKKEEPER_HEADERS,
  buildBookkeeperRows,
  createBookkeeperWorkbookBuffer,
} from "./bookkeeperExport";

const clients: Client[] = [
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
];

const pets: Pet[] = [
  {
    id: "p1",
    client_id: "c1",
    name: "Whiskey",
    breed: "Silver Terrier Yorkie",
    color: null,
    sex: null,
    date_of_birth: null,
    allergies: false,
    allergies_detail: null,
    grooming_notes: null,
    typical_fee: 60,
    created_at: "2026-01-01",
  },
];

const appointments: Appointment[] = [
  {
    id: "a1",
    client_id: "c1",
    pet_id: "p1",
    date: "2026-04-10",
    time_slot: "10:30am",
    service: "Full groom",
    price: 60,
    tip: 10,
    notes: "#4, left ears and tail [payment:interac; payment_status:paid]",
    location: "gina",
    google_calendar_id: null,
    google_event_id: null,
    google_sync_status: null,
    google_sync_error: null,
    google_synced_at: null,
    created_at: "2026-04-10",
  },
];

const closeoutOverrides: DayCloseoutOverride[] = [
  {
    id: "closeout-1",
    date: "2026-04-10",
    location: "gina",
    final_payout: 20,
    calculated_payout: 18,
    note: "Rounded at end of day",
    created_at: "2026-04-10T20:00:00.000Z",
    updated_at: "2026-04-10T20:00:00.000Z",
  },
];

describe("bookkeeper export rows", () => {
  it("builds Excel-ready rows with fee, tip, and total collected", () => {
    expect(
      buildBookkeeperRows({ clients, pets, appointments, from: "2026-01-01", to: "2026-12-31" }),
    ).toEqual([
      [
        "2026-04-10",
        "Mary Anca",
        "705-330-1807",
        "Whiskey",
        "Silver Terrier Yorkie",
        "Tidy Tails (Gina)",
        "",
        "",
        60,
        10,
        70,
        "",
        "",
        60,
        "Paid",
        "Full groom",
        "#4, left ears and tail",
      ],
    ]);
  });

  it("marks waiting payments instead of counting them as collected cash/interac", () => {
    const waiting = [
      {
        ...appointments[0],
        notes: "Pay Friday [payment:cash; payment_status:waiting]",
      },
    ];

    expect(
      buildBookkeeperRows({
        clients,
        pets,
        appointments: waiting,
        from: "2026-01-01",
        to: "2026-12-31",
      })[0],
    ).toEqual([
      "2026-04-10",
      "Mary Anca",
      "705-330-1807",
      "Whiskey",
      "Silver Terrier Yorkie",
      "Tidy Tails (Gina)",
      "",
      "",
      60,
      10,
      0,
      "",
      "",
      "",
      "Waiting on payment",
      "Full groom",
      "Pay Friday",
    ]);
  });

  it("omits appointments outside the selected range", () => {
    expect(
      buildBookkeeperRows({ clients, pets, appointments, from: "2026-05-01", to: "2026-05-31" }),
    ).toEqual([]);
  });

  it("keeps one row per pet in a grouped household booking", () => {
    const groupedPets: Pet[] = [
      ...pets,
      {
        ...pets[0],
        id: "p2",
        name: "Kiwi",
        breed: "Havanese",
        typical_fee: 45,
      },
    ];
    const groupedAppointments: Appointment[] = [
      appointments[0],
      {
        ...appointments[0],
        id: "a2",
        pet_id: "p2",
        price: 45,
        tip: null,
        service: "Bath only",
      },
    ];

    const rows = buildBookkeeperRows({
      clients,
      pets: groupedPets,
      appointments: groupedAppointments,
      from: "2026-01-01",
      to: "2026-12-31",
    });

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row[3])).toEqual(["Whiskey", "Kiwi"]);
    expect(rows.reduce((sum, row) => sum + Number(row[8] ?? 0), 0)).toBe(105);
  });

  it("exports only the logged groom when an old booked row still exists", () => {
    const duplicated: Appointment[] = [
      { ...appointments[0], id: "booked", status: "booked", tip: null },
      {
        ...appointments[0],
        id: "logged",
        status: "completed",
        time_slot: null,
        tip: 5,
        notes:
          "#7 left ears and tail [salon_payout:15] [payment:cash; payment_status:paid]",
      },
    ];

    const rows = buildBookkeeperRows({
      clients,
      pets,
      appointments: duplicated,
      from: "2026-01-01",
      to: "2026-12-31",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0][10]).toBe(65);
    expect(rows[0][16]).toBe("#7 left ears and tail");
  });
});

describe("createBookkeeperWorkbookBuffer", () => {
  it("creates a real xlsx workbook with the bookkeeper headers and data", async () => {
    const buffer = await createBookkeeperWorkbookBuffer({
      clients,
      pets,
      appointments,
      closeoutOverrides,
      from: "2026-01-01",
      to: "2026-12-31",
      period: "all",
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      Buffer.from(buffer) as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
    const sheet = workbook.getWorksheet("Bookkeeper Export");

    expect(sheet?.getRow(1).values).toEqual([, ...BOOKKEEPER_HEADERS]);
    expect(sheet?.getCell("A2").value).toBe("2026-04-10");
    expect(sheet?.getCell("F2").value).toBe("Tidy Tails (Gina)");
    expect(sheet?.getCell("K2").value).toBe(70);
    expect(sheet?.getCell("N2").value).toBe(60);
    expect(sheet?.getCell("O2").value).toBe("Paid");

    const closeouts = workbook.getWorksheet("Day Closeouts");
    expect(closeouts?.getCell("A2").value).toBe("2026-04-10");
    expect(closeouts?.getCell("C2").value).toBe(18);
    expect(closeouts?.getCell("D2").value).toBe(20);
    expect(closeouts?.getCell("F2").value).toBe("Rounded at end of day");
  });
});

import {
  FIXTURE_OWNED_LOCATION,
  FIXTURE_OWNER_APPOINTMENTS,
  FIXTURE_OWNER_MONTH,
} from "./data/fixtures";

const OWNER_ECONOMICS_HEADERS = [
  "Location",
  "Fees",
  "Tips",
  "Collected",
  "Rent / mortgage",
  "Utilities",
  "Supplies",
  "Upkeep",
  "Cleaning",
  "Total costs",
  "Take-home",
];

async function loadWorkbook(buffer: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    Buffer.from(buffer) as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  return workbook;
}

describe("createBookkeeperWorkbookBuffer — Owner Economics (WS4b)", () => {
  it("Sam-unchanged: no ownedLocations → no Owner Economics sheet, same three sheets", async () => {
    const buffer = await createBookkeeperWorkbookBuffer({
      clients,
      pets,
      appointments,
      closeoutOverrides,
      from: "2026-01-01",
      to: "2026-12-31",
      period: "all",
    });
    const workbook = await loadWorkbook(buffer);
    expect(workbook.worksheets.map((w) => w.name)).toEqual([
      "Bookkeeper Export",
      "Summary",
      "Day Closeouts",
    ]);
    expect(workbook.getWorksheet("Owner Economics")).toBeUndefined();
  });

  it("owned org: appends an Owner Economics sheet with fees, tips, costs, take-home", async () => {
    const buffer = await createBookkeeperWorkbookBuffer({
      clients: [],
      pets: [],
      appointments: FIXTURE_OWNER_APPOINTMENTS,
      from: FIXTURE_OWNER_MONTH.from,
      to: FIXTURE_OWNER_MONTH.to,
      period: "month",
      ownedLocations: [FIXTURE_OWNED_LOCATION],
    });
    const workbook = await loadWorkbook(buffer);
    const sheet = workbook.getWorksheet("Owner Economics");
    expect(sheet).toBeDefined();
    expect(sheet?.getRow(1).values).toEqual([, ...OWNER_ECONOMICS_HEADERS]);
    expect(sheet?.getCell("A2").value).toBe("Cheryl's Shop");
    expect(sheet?.getCell("B2").value).toBe(280); // fees
    expect(sheet?.getCell("C2").value).toBe(25); // tips
    expect(sheet?.getCell("D2").value).toBe(305); // collected
    expect(sheet?.getCell("E2").value).toBe(1200); // rent
    expect(sheet?.getCell("J2").value).toBe(1500); // total costs
    expect(sheet?.getCell("K2").value).toBe(-1195); // take-home = 305 - 1500
    // The other sheets are still present and unchanged.
    expect(workbook.getWorksheet("Bookkeeper Export")).toBeDefined();
    expect(workbook.getWorksheet("Day Closeouts")).toBeDefined();
  });

  it("owned org with no expenses on file leaves Take-home blank (not 0)", async () => {
    const buffer = await createBookkeeperWorkbookBuffer({
      clients: [],
      pets: [],
      appointments: FIXTURE_OWNER_APPOINTMENTS,
      from: FIXTURE_OWNER_MONTH.from,
      to: FIXTURE_OWNER_MONTH.to,
      period: "month",
      ownedLocations: [
        {
          name: FIXTURE_OWNED_LOCATION.name,
          address: FIXTURE_OWNED_LOCATION.address,
          expenses: {
            rentMortgage: null,
            utilities: null,
            supplies: null,
            upkeep: null,
            cleaning: null,
          },
        },
      ],
    });
    const workbook = await loadWorkbook(buffer);
    const sheet = workbook.getWorksheet("Owner Economics");
    expect(sheet?.getCell("D2").value).toBe(305); // collected still shown
    expect(sheet?.getCell("J2").value).toBeNull(); // total costs blank
    expect(sheet?.getCell("K2").value).toBeNull(); // take-home blank, not 0
  });
});
