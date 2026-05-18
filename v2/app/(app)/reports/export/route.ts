import { NextRequest, NextResponse } from "next/server";
import { createBookkeeperWorkbookBuffer } from "@/lib/bookkeeperExport";
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
  const workbook = await createBookkeeperWorkbookBuffer({
    clients,
    pets,
    appointments,
    from,
    to,
    period,
  });

  return new NextResponse(workbook, {
    headers: {
      "Content-Disposition": `attachment; filename="tidy-tails-${period}-${from}-to-${to}.xlsx"`,
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}
