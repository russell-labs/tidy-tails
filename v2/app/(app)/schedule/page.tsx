import type { Metadata } from "next";
import Link from "next/link";
import { loadDataset } from "@/lib/data/repo";
import { bookingLocationLabel } from "@/lib/booking";
import {
  appointmentsForWeek,
  shiftWeek,
  weekRangeForDate,
} from "@/lib/schedule";
import { summarizeDayLoad, type DaySummary } from "@/lib/dayCapacity";
import { formatMoney, formatPhone, fullName } from "@/lib/format";

export const metadata: Metadata = { title: "Schedule" };

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function weekDays(start: string): string[] {
  const d = new Date(`${start}T12:00:00`);
  return Array.from({ length: 7 }, (_, i) => {
    const copy = new Date(d);
    copy.setDate(d.getDate() + i);
    return `${copy.getFullYear()}-${String(copy.getMonth() + 1).padStart(2, "0")}-${String(copy.getDate()).padStart(2, "0")}`;
  });
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  const selected = params.week ?? todayISO();
  const range = weekRangeForDate(selected);
  const { clients, pets, appointments } = await loadDataset();
  const rows = appointmentsForWeek({ appointments, clients, pets, range });
  const daySummaries = weekDays(range.start).map((date) =>
    summarizeDayLoad({ date, appointments, pets }),
  );
  const prev = shiftWeek(range.start, -1);
  const next = shiftWeek(range.start, 1);

  return (
    <main className="px-4 py-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Schedule</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Booked appointments in the Tidy Tails book.
          </p>
        </div>
        <Link
          href={`/schedule?week=${todayISO()}`}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-brand active:bg-brand-soft"
        >
          Today
        </Link>
      </header>

      <section className="mt-5">
        <div className="mb-3 grid grid-cols-[44px_1fr_44px] items-center gap-2">
          <Link
            href={`/schedule?week=${prev}`}
            aria-label="Previous week"
            className="rounded-lg border border-line bg-surface px-3 py-2 text-center text-lg font-bold text-ink-soft active:bg-canvas"
          >
            ‹
          </Link>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Week
            </p>
            <p className="text-base font-semibold text-ink">{range.label}</p>
          </div>
          <Link
            href={`/schedule?week=${next}`}
            aria-label="Next week"
            className="rounded-lg border border-line bg-surface px-3 py-2 text-center text-lg font-bold text-ink-soft active:bg-canvas"
          >
            ›
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-line bg-surface px-3 py-3">
            <p className="text-2xl font-bold text-ink">{rows.length}</p>
            <p className="text-xs font-medium text-ink-soft">Bookings</p>
          </div>
          <div className="rounded-xl border border-line bg-surface px-3 py-3">
            <p className="text-2xl font-bold text-ink">
              {formatMoney(
                rows.reduce(
                  (sum, row) => sum + (row.appointment.price ?? 0),
                  0,
                ),
              )}
            </p>
            <p className="text-xs font-medium text-ink-soft">Booked fees</p>
          </div>
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
            Day fit
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            A first-pass read on how full each day is. Sam still decides.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {daySummaries.map((summary) => (
            <DaySummaryCard key={summary.date} summary={summary} />
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Appointments this week
        </h2>
        {rows.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-3.5 py-4 text-sm text-ink-soft">
            No booked appointments this week.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map(({ appointment, client, pet }) => {
              const location = bookingLocationLabel(appointment.location);
              return (
                <Link
                  key={appointment.id}
                  href={
                    client
                      ? `/clients/${client.id}?from=schedule&week=${range.start}`
                      : "/schedule"
                  }
                  className="rounded-xl border border-line bg-surface px-3.5 py-3 shadow-sm active:bg-brand-soft"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                        {dayLabel(appointment.date)}
                      </p>
                      <p className="mt-1 text-lg font-bold text-ink">
                        {appointment.time_slot ?? "Time not set"}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-brand">
                      {appointment.price != null
                        ? formatMoney(appointment.price)
                        : "No fee"}
                    </p>
                  </div>
                  <div className="mt-2 border-t border-line pt-2">
                    <p className="font-semibold text-ink">
                      {pet?.name ?? "Unknown pet"}
                      {pet?.breed ? (
                        <span className="font-normal text-ink-soft">
                          {" "}
                          · {pet.breed}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm text-ink-soft">
                      {client
                        ? `${fullName(client.first_name, client.last_name)} · ${formatPhone(client.phone)}`
                        : "Unknown household"}
                    </p>
                    <p className="mt-1 text-sm text-ink-soft">
                      {appointment.service ?? "Service not set"}
                      {location ? ` · ${location}` : ""}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function DaySummaryCard({ summary }: { summary: DaySummary }) {
  const tone =
    summary.status === "not_recommended" || summary.status === "heavy"
      ? "border-warn/40 bg-warn-soft text-warn"
      : summary.status === "possible"
        ? "border-line bg-surface text-ink"
        : "border-line bg-surface text-ink";
  const status =
    summary.status === "not_recommended"
      ? "Too full"
      : summary.status === "heavy"
        ? "Heavy"
        : summary.status === "possible"
          ? "Possible"
          : "Open";

  return (
    <div className={`rounded-xl border px-3.5 py-3 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold">{dayLabel(summary.date)}</p>
          <p className="mt-1 text-xs opacity-80">
            {summary.totalDogs} dog{summary.totalDogs === 1 ? "" : "s"} ·{" "}
            {summary.largeDogs} large ·{" "}
            {summary.loadPoints.toFixed(2).replace(/\.00$/, "")} pts
          </p>
        </div>
        <span className="rounded-full bg-white/70 px-2 py-1 text-xs font-semibold">
          {status}
        </span>
      </div>
      {summary.messages[1] ? (
        <p className="mt-2 text-xs leading-relaxed opacity-85">
          {summary.messages[1]}
        </p>
      ) : null}
    </div>
  );
}
