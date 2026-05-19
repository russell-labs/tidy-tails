import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { Appointment, Client, Pet } from "./data/types";
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
    notes: "#4, left ears and tail",
    location: "gina",
    google_calendar_id: null,
    google_event_id: null,
    google_sync_status: null,
    google_sync_error: null,
    google_synced_at: null,
    created_at: "2026-04-10",
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
        "",
        "Full groom",
        "#4, left ears and tail",
      ],
    ]);
  });

  it("omits appointments outside the selected range", () => {
    expect(
      buildBookkeeperRows({ clients, pets, appointments, from: "2026-05-01", to: "2026-05-31" }),
    ).toEqual([]);
  });
});

describe("createBookkeeperWorkbookBuffer", () => {
  it("creates a real xlsx workbook with the bookkeeper headers and data", async () => {
    const buffer = await createBookkeeperWorkbookBuffer({
      clients,
      pets,
      appointments,
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
  });
});
