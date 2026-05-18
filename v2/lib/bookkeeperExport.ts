import ExcelJS from "exceljs";
import type { Appointment, Client, Pet } from "./data/types";

export const BOOKKEEPER_HEADERS = [
  "Date",
  "Client Name",
  "Phone",
  "Pet Name",
  "Breed",
  "work",
  "wage",
  "Fee",
  "Tip",
  "Total Collected",
  "wages pd cash",
  "Fee Paid Cash",
  "Fee Paid Debit",
  "Service",
  "Notes",
] as const;

type ExportInput = {
  clients: Client[];
  pets: Pet[];
  appointments: Appointment[];
  from: string;
  to: string;
};

export function buildBookkeeperRows({
  clients,
  pets,
  appointments,
  from,
  to,
}: ExportInput): Array<Array<string | number | null>> {
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const petsById = new Map(pets.map((pet) => [pet.id, pet]));

  return appointments
    .filter((appointment) => appointment.date >= from && appointment.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((appointment) => {
      const client = clientsById.get(appointment.client_id);
      const pet = petsById.get(appointment.pet_id);
      const fee = appointment.price ?? 0;
      const tip = appointment.tip ?? 0;
      return [
        appointment.date,
        client
          ? `${client.first_name} ${client.last_name}`.trim()
          : appointment.client_id,
        client?.phone ?? "",
        pet?.name ?? appointment.pet_id,
        pet?.breed ?? "",
        "",
        "",
        appointment.price,
        appointment.tip,
        fee + tip,
        "",
        "",
        "",
        appointment.service,
        appointment.notes,
      ];
    });
}

export async function createBookkeeperWorkbookBuffer({
  clients,
  pets,
  appointments,
  from,
  to,
  period,
}: ExportInput & { period: string }): Promise<ArrayBuffer> {
  const rows = buildBookkeeperRows({ clients, pets, appointments, from, to });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Tidy Tails";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Bookkeeper Export", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.addRow([...BOOKKEEPER_HEADERS]);
  for (const row of rows) sheet.addRow(row);

  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF6D28D9" },
  };
  sheet.getRow(1).alignment = { vertical: "middle" };

  sheet.columns = [
    { width: 12 },
    { width: 24 },
    { width: 16 },
    { width: 18 },
    { width: 22 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 18 },
    { width: 42 },
  ];
  for (const column of [8, 9, 10, 11, 12, 13]) {
    sheet.getColumn(column).numFmt = "$#,##0.00";
  }
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(rows.length + 1, 1), column: BOOKKEEPER_HEADERS.length },
  };

  const summary = workbook.addWorksheet("Summary");
  summary.columns = [{ width: 24 }, { width: 18 }];
  const lastRow = Math.max(rows.length + 1, 2);
  summary.addRows([
    ["Tidy Tails bookkeeper export", ""],
    ["Period", period],
    ["From", from],
    ["To", to],
    ["Visits", rows.length],
    ["Fees", { formula: `SUM('Bookkeeper Export'!H2:H${lastRow})` }],
    ["Tips", { formula: `SUM('Bookkeeper Export'!I2:I${lastRow})` }],
    ["Total collected", { formula: `SUM('Bookkeeper Export'!J2:J${lastRow})` }],
  ]);
  summary.getCell("A1").font = { bold: true, size: 14 };
  summary.getColumn(1).font = { bold: true };
  for (const cell of ["B6", "B7", "B8"]) summary.getCell(cell).numFmt = "$#,##0.00";

  const buffer = await workbook.xlsx.writeBuffer();
  if (buffer instanceof ArrayBuffer) return buffer;
  const view = buffer as Uint8Array;
  return view.buffer.slice(
    view.byteOffset,
    view.byteOffset + view.byteLength,
  ) as ArrayBuffer;
}
