import ExcelJS from "exceljs";
import { collapseLoggedGroomDuplicates } from "./appointmentLedger";
import { bookingLocationLabel } from "./booking";
import type { Appointment, Client, DayCloseoutOverride, Pet } from "./data/types";
import type { OwnedLocation } from "./orgSettings";
import { isWholeMonth, ownerLocationTakeHome } from "./ownerEconomics";
import { parsePaymentInfo, stripPaymentInfo } from "./payments";
import { stripSalonPayoutOverride } from "./payoutOverride";

export const BOOKKEEPER_HEADERS = [
  "Date",
  "Client Name",
  "Phone",
  "Pet Name",
  "Breed",
  "Location",
  "work",
  "wage",
  "Fee",
  "Tip",
  "Total Collected",
  "wages pd cash",
  "Fee Paid Cash",
  "Fee Paid Debit",
  "Payment Status",
  "Service",
  "Notes",
] as const;

type ExportInput = {
  clients: Client[];
  pets: Pet[];
  appointments: Appointment[];
  closeoutOverrides?: DayCloseoutOverride[];
  from: string;
  to: string;
};

const DAY_CLOSEOUT_HEADERS = [
  "Date",
  "Location",
  "Calculated payout",
  "Final payout",
  "Difference",
  "Note",
] as const;

// WS4b — owner-operator economics, appended only for an org with owned locations.
// Sam's workbook (no owned locations) is unchanged: this sheet is never added.
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
] as const;

function addOwnerEconomicsSheet(
  workbook: ExcelJS.Workbook,
  {
    ownedLocations,
    appointments,
    from,
    to,
  }: {
    ownedLocations: OwnedLocation[];
    appointments: Appointment[];
    from: string;
    to: string;
  },
): void {
  // Take-home is only honest for a full calendar month of recurring expenses.
  const showTakeHome = isWholeMonth(from, to);
  const sheet = workbook.addWorksheet("Owner Economics", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.addRow([...OWNER_ECONOMICS_HEADERS]);
  for (const location of ownedLocations) {
    const t = ownerLocationTakeHome({
      locationName: location.name,
      appointments,
      from,
      to,
      expenses: location.expenses,
    });
    sheet.addRow([
      location.name,
      t.fees,
      t.tips,
      t.collected,
      location.expenses.rentMortgage,
      location.expenses.utilities,
      location.expenses.supplies,
      location.expenses.upkeep,
      location.expenses.cleaning,
      t.hasExpensesOnFile ? t.totalExpenses : null,
      showTakeHome && t.hasExpensesOnFile ? t.takeHome : null,
    ]);
  }
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF6D28D9" },
  };
  sheet.columns = [
    { width: 22 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 16 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
  ];
  for (let column = 2; column <= OWNER_ECONOMICS_HEADERS.length; column += 1) {
    sheet.getColumn(column).numFmt = "$#,##0.00";
  }
}

export function buildBookkeeperRows({
  clients,
  pets,
  appointments,
  from,
  to,
}: ExportInput): Array<Array<string | number | null>> {
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const petsById = new Map(pets.map((pet) => [pet.id, pet]));

  return collapseLoggedGroomDuplicates(appointments)
    .filter((appointment) => appointment.date >= from && appointment.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((appointment) => {
      const client = clientsById.get(appointment.client_id);
      const pet = petsById.get(appointment.pet_id);
      const fee = appointment.price ?? 0;
      const tip = appointment.tip ?? 0;
      const payment = parsePaymentInfo(appointment.notes);
      const paid = payment.status === "paid";
      const totalCollected = paid || payment.status == null ? fee + tip : 0;
      return [
        appointment.date,
        client
          ? `${client.first_name} ${client.last_name}`.trim()
          : appointment.client_id,
        client?.phone ?? "",
        pet?.name ?? appointment.pet_id,
        pet?.breed ?? "",
        bookingLocationLabel(appointment.location) ?? "",
        "",
        "",
        appointment.price,
        appointment.tip,
        totalCollected,
        "",
        paid && payment.method === "cash" ? fee : "",
        paid && payment.method === "interac" ? fee : "",
        payment.status === "waiting" ? "Waiting on payment" : paid ? "Paid" : "",
        appointment.service,
        stripSalonPayoutOverride(stripPaymentInfo(appointment.notes)),
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
  closeoutOverrides = [],
  ownedLocations = [],
}: ExportInput & {
  period: string;
  ownedLocations?: OwnedLocation[];
}): Promise<ArrayBuffer> {
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
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 18 },
    { width: 18 },
    { width: 42 },
  ];
  for (const column of [9, 10, 11, 12, 13, 14]) {
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
    ["Fees", { formula: `SUM('Bookkeeper Export'!I2:I${lastRow})` }],
    ["Tips", { formula: `SUM('Bookkeeper Export'!J2:J${lastRow})` }],
    ["Total collected", { formula: `SUM('Bookkeeper Export'!K2:K${lastRow})` }],
  ]);
  summary.getCell("A1").font = { bold: true, size: 14 };
  summary.getColumn(1).font = { bold: true };
  for (const cell of ["B6", "B7", "B8"]) summary.getCell(cell).numFmt = "$#,##0.00";

  const closeoutRows = closeoutOverrides
    .filter((override) => override.date >= from && override.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.location.localeCompare(b.location))
    .map((override) => [
      override.date,
      bookingLocationLabel(override.location) ?? override.location,
      override.calculated_payout,
      override.final_payout,
      override.calculated_payout == null
        ? null
        : override.final_payout - override.calculated_payout,
      override.note,
    ]);

  const closeouts = workbook.addWorksheet("Day Closeouts", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  closeouts.addRow([...DAY_CLOSEOUT_HEADERS]);
  for (const row of closeoutRows) closeouts.addRow(row);
  closeouts.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  closeouts.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF6D28D9" },
  };
  closeouts.columns = [
    { width: 12 },
    { width: 18 },
    { width: 18 },
    { width: 16 },
    { width: 14 },
    { width: 42 },
  ];
  for (const column of [3, 4, 5]) {
    closeouts.getColumn(column).numFmt = "$#,##0.00";
  }

  // WS4b — owner-operator economics last, only when the org has owned locations.
  if (ownedLocations.length > 0) {
    addOwnerEconomicsSheet(workbook, { ownedLocations, appointments, from, to });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  if (buffer instanceof ArrayBuffer) return buffer;
  const view = buffer as Uint8Array;
  return view.buffer.slice(
    view.byteOffset,
    view.byteOffset + view.byteLength,
  ) as ArrayBuffer;
}
