import { NextRequest, NextResponse } from "next/server";
import { loadDataset } from "@/lib/data/repo";
import { getCurrentUser } from "@/lib/supabase/server";

function parseMonth(raw: string | null): { year: number; month: number } {
  const now = new Date();
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number);
    if (m >= 1 && m <= 12) return { year: y, month: m - 1 };
  }
  return { year: now.getFullYear(), month: now.getMonth() };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function csvCell(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value);
  return `"${raw.replaceAll('"', '""')}"`;
}

function csvRow(values: Array<string | number | null | undefined>): string {
  return values.map(csvCell).join(",");
}

function rangeFromParams(request: NextRequest, dates: string[]) {
  const periodParam = request.nextUrl.searchParams.get("period");
  const period =
    periodParam === "month" || periodParam === "ytd" || periodParam === "all"
      ? periodParam
      : "all";
  const { year, month } = parseMonth(request.nextUrl.searchParams.get("month"));
  const today = new Date().toISOString().slice(0, 10);
  const sortedDates = [...dates].sort();
  const monthFrom = `${year}-${pad(month + 1)}-01`;
  const monthTo = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;
  const from =
    period === "all"
      ? (sortedDates[0] ?? today)
      : period === "ytd"
        ? `${new Date().getFullYear()}-01-01`
        : monthFrom;
  const to =
    period === "all"
      ? (sortedDates.at(-1) ?? today)
      : period === "ytd"
        ? today
        : monthTo;
  return { from, to, period };
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { clients, pets, appointments } = await loadDataset();
  const { from, to, period } = rangeFromParams(
    request,
    appointments.map((a) => a.date),
  );
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const petsById = new Map(pets.map((pet) => [pet.id, pet]));
  const rows = appointments
    .filter((appointment) => appointment.date >= from && appointment.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));

  const lines = [
    csvRow([
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
    ]),
    ...rows.map((appointment) => {
      const client = clientsById.get(appointment.client_id);
      const pet = petsById.get(appointment.pet_id);
      const fee = appointment.price ?? 0;
      const tip = appointment.tip ?? 0;
      return csvRow([
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
      ]);
    }),
  ];

  return new NextResponse(`\uFEFF${lines.join("\n")}\n`, {
    headers: {
      "Content-Disposition": `attachment; filename="tidy-tails-${period}-${from}-to-${to}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
