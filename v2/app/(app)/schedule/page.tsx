import type { Metadata } from "next";
import Link from "next/link";
import { loadDataset } from "@/lib/data/repo";
import { bookingLocationLabel } from "@/lib/booking";
import {
  appointmentsForDay,
  appointmentsForWeek,
  groupScheduledAppointments,
  scheduleView,
  shiftDay,
  shiftWeek,
  weekRangeForDate,
  type ScheduledAppointment,
} from "@/lib/schedule";
import {
  dogWorkProfile,
  summarizeDayLoad,
  type DaySummary,
} from "@/lib/dayCapacity";
import { formatMoney, formatPhone, fullName } from "@/lib/format";
import {
  calculateAppointmentMoney,
  calculateDayMoney,
  locationLabelFromSettings,
  type DayMoney,
} from "@/lib/locationFinance";
import type {
  LocationSettingsMap,
  ScheduleCalibration,
} from "@/lib/operatorSettings";
import { readOperatorSettings } from "@/lib/operatorSettings.server";
import type { AppointmentWorkflowStage } from "@/lib/appointmentWorkflow";

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

function fullDayLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
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

function dayHref(date: string): string {
  const range = weekRangeForDate(date);
  return `/schedule?view=day&day=${date}&week=${range.start}`;
}

function weekHref(week: string): string {
  return `/schedule?view=week&week=${week}`;
}

function viewHref(view: "week" | "day", week: string, day: string): string {
  return view === "day" ? dayHref(day) : weekHref(week);
}

function appointmentHref(appointmentId: string): string {
  return `/schedule/appointments/${appointmentId}`;
}

function statusLabel(summary: DaySummary): string | null {
  if (summary.status === "not_recommended") return "Too full";
  if (summary.status === "heavy") return "Heavy";
  if (summary.status === "possible") return "Possible";
  return null;
}

function statusTone(summary: DaySummary): string {
  if (summary.status === "not_recommended" || summary.status === "heavy") {
    return "border-warn/40 bg-warn-soft text-warn";
  }
  return "border-line bg-surface text-ink";
}

function appointmentCardTone(stage: AppointmentWorkflowStage): string {
  if (stage === "completed") return "border-ok/40 bg-ok-soft active:bg-ok-soft/70";
  if (stage === "active") {
    return "border-warn/40 bg-warn-soft active:bg-warn-soft/70";
  }
  if (stage === "exception") {
    return "border-danger/40 bg-danger-soft active:bg-danger-soft/70";
  }
  return "border-line bg-surface active:bg-brand-soft";
}

function appointmentPillTone(stage: AppointmentWorkflowStage): string {
  if (stage === "completed") return "bg-surface/80 text-ok";
  if (stage === "active") return "bg-surface/80 text-warn";
  if (stage === "exception") return "bg-surface/80 text-danger-ink";
  return "";
}

function daySummaryMetrics(summary: DaySummary, money: DayMoney): string {
  return `${summary.totalDogs} dog${summary.totalDogs === 1 ? "" : "s"} · ${
    summary.largeDogs
  } large · ${summary.loadPoints.toFixed(2).replace(/\.00$/, "")} pts · Gross ${formatMoney(
    money.gross,
  )} · Sam ${formatMoney(money.samNet)}`;
}

function uniqueText(values: Array<string | null | undefined>): string | null {
  const unique = Array.from(
    new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]),
  );
  if (unique.length === 0) return null;
  if (unique.length === 1) return unique[0];
  return unique.join(" / ");
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; day?: string; view?: string }>;
}) {
  const params = await searchParams;
  const view = scheduleView(params.view);
  const selectedDay = params.day ?? params.week ?? todayISO();
  const range = weekRangeForDate(params.week ?? selectedDay);
  const { clients, pets, appointments } = await loadDataset();
  const settings = await readOperatorSettings();
  const calibration = settings.scheduleCalibration;
  const rows =
    view === "day"
      ? appointmentsForDay({ appointments, clients, pets, date: selectedDay })
      : appointmentsForWeek({ appointments, clients, pets, range });
  const daySummaries = weekDays(range.start).map((date) =>
    summarizeDayLoad({ date, appointments, pets, calibration }),
  );
  const selectedDaySummary =
    daySummaries.find((summary) => summary.date === selectedDay) ??
    summarizeDayLoad({ date: selectedDay, appointments, pets, calibration });
  const prev = view === "day" ? shiftDay(selectedDay, -1) : shiftWeek(range.start, -1);
  const next = view === "day" ? shiftDay(selectedDay, 1) : shiftWeek(range.start, 1);
  const totalMoney = rows.reduce(
    (sum, row) => {
      const money = calculateAppointmentMoney(
        row.appointment,
        settings.locationSettings,
      );
      return {
        gross: sum.gross + money.gross,
        samNet: sum.samNet + money.samNet,
      };
    },
    { gross: 0, samNet: 0 },
  );

  return (
    <main className="px-4 py-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Schedule</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {view === "day"
              ? `Slate and day fit for ${dayLabel(selectedDay)}.`
              : "Scheduled dogs in the Tidy Tails book."}
          </p>
        </div>
        <Link
          href={viewHref(view, weekRangeForDate(todayISO()).start, todayISO())}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-brand active:bg-brand-soft"
        >
          Today
        </Link>
      </header>

      <section className="mt-5">
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-line bg-canvas p-1">
          <Link
            href={weekHref(range.start)}
            className={`rounded-lg px-3 py-2 text-center text-sm font-semibold ${
              view === "week"
                ? "bg-surface text-brand shadow-sm"
                : "text-ink-soft active:bg-surface"
            }`}
          >
            Week
          </Link>
          <Link
            href={dayHref(selectedDay)}
            className={`rounded-lg px-3 py-2 text-center text-sm font-semibold ${
              view === "day"
                ? "bg-surface text-brand shadow-sm"
                : "text-ink-soft active:bg-surface"
            }`}
          >
            Day
          </Link>
        </div>

        <div className="mb-3 grid grid-cols-[44px_1fr_44px] items-center gap-2">
          <Link
            href={view === "day" ? dayHref(prev) : weekHref(prev)}
            aria-label={view === "day" ? "Previous day" : "Previous week"}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-center text-lg font-bold text-ink-soft active:bg-canvas"
          >
            ‹
          </Link>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              {view === "day" ? "Day" : "Week"}
            </p>
            <p className="text-base font-semibold text-ink">
              {view === "day" ? fullDayLabel(selectedDay) : range.label}
            </p>
          </div>
          <Link
            href={view === "day" ? dayHref(next) : weekHref(next)}
            aria-label={view === "day" ? "Next day" : "Next week"}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-center text-lg font-bold text-ink-soft active:bg-canvas"
          >
            ›
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-line bg-surface px-3 py-3">
            <p className="text-2xl font-bold text-ink">{rows.length}</p>
            <p className="text-xs font-medium text-ink-soft">Scheduled dogs</p>
          </div>
          <div className="rounded-xl border border-line bg-surface px-3 py-3">
            <p className="text-2xl font-bold text-ink">
              {formatMoney(totalMoney.samNet)}
            </p>
            <p className="text-xs font-medium text-ink-soft">
              Sam net · Gross {formatMoney(totalMoney.gross)}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
            {view === "day" ? "Day fit and slate" : "Day fit"}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {view === "day"
              ? "The selected day opened up with the dogs already booked."
              : "Tap a day to open the slate. Sam still decides."}
          </p>
        </div>
        {view === "day" ? (
          <OpenedDay
            summary={selectedDaySummary}
            rows={rows}
            money={calculateDayMoney(
              appointments,
              selectedDaySummary.date,
              settings.locationSettings,
            )}
            calibration={calibration}
            locationSettings={settings.locationSettings}
          />
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {daySummaries.map((summary) => (
              <DaySummaryCard
                key={summary.date}
                summary={summary}
                money={calculateDayMoney(
                  appointments,
                  summary.date,
                  settings.locationSettings,
                )}
              />
            ))}
          </div>
        )}
      </section>

      {view === "week" ? (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">
            Appointments this week
          </h2>
          <AppointmentList
            rows={rows}
            calibration={calibration}
            locationSettings={settings.locationSettings}
            empty="No scheduled dogs this week."
          />
        </section>
      ) : null}
    </main>
  );
}

function DaySummaryCard({
  summary,
  money,
}: {
  summary: DaySummary;
  money: DayMoney;
}) {
  const label = statusLabel(summary);

  return (
    <Link
      href={dayHref(summary.date)}
      className={`block rounded-xl border px-3.5 py-3 shadow-sm active:scale-[0.99] active:bg-brand-soft ${statusTone(summary)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold">{dayLabel(summary.date)}</p>
          <p className="mt-1 text-xs opacity-80">
            {daySummaryMetrics(summary, money)}
          </p>
        </div>
        {label ? (
          <span className="rounded-full bg-white/70 px-2 py-1 text-xs font-semibold">
            {label}
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="text-xl font-semibold leading-none text-ink-faint"
          >
            ›
          </span>
        )}
      </div>
      {summary.messages[1] ? (
        <p className="mt-2 text-xs leading-relaxed opacity-85">
          {summary.messages[1]}
        </p>
      ) : null}
    </Link>
  );
}

function OpenedDay({
  summary,
  rows,
  money,
  calibration,
  locationSettings,
}: {
  summary: DaySummary;
  rows: ScheduledAppointment[];
  money: DayMoney;
  calibration: ScheduleCalibration;
  locationSettings: LocationSettingsMap;
}) {
  const label = statusLabel(summary);

  return (
    <div className="rounded-xl border border-line bg-surface shadow-sm">
      <div className={`rounded-t-xl border-b px-3.5 py-3 ${statusTone(summary)}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold">{fullDayLabel(summary.date)}</p>
            <p className="mt-1 text-xs opacity-80">
              {daySummaryMetrics(summary, money)}
            </p>
          </div>
          {label ? (
            <span className="rounded-full bg-white/70 px-2 py-1 text-xs font-semibold">
              {label}
            </span>
          ) : null}
        </div>
        {summary.messages[1] ? (
          <p className="mt-2 text-xs leading-relaxed opacity-85">
            {summary.messages[1]}
          </p>
        ) : null}
      </div>
      <div className="px-3.5 py-3">
        <AppointmentList
          rows={rows}
          calibration={calibration}
          locationSettings={locationSettings}
          empty="No scheduled dogs on this day yet."
          compact
        />
      </div>
    </div>
  );
}

function AppointmentList({
  rows,
  calibration,
  locationSettings,
  empty,
  compact = false,
}: {
  rows: ScheduledAppointment[];
  calibration: ScheduleCalibration;
  locationSettings: LocationSettingsMap;
  empty: string;
  compact?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-surface px-3.5 py-4 text-sm text-ink-soft">
        {empty}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {groupScheduledAppointments(rows).map((group) => {
        const { appointment, client } = group.primary;
        const workflowLabel = group.workflowLabel;
        const workflowStage = group.workflowStage;
        const location =
          locationLabelFromSettings(appointment.location, locationSettings) ??
          bookingLocationLabel(appointment.location);
        const money = group.rows.reduce(
          (sum, row) => {
            const rowMoney = calculateAppointmentMoney(
              row.appointment,
              locationSettings,
            );
            return {
              gross: sum.gross + rowMoney.gross,
              samNet: sum.samNet + rowMoney.samNet,
            };
          },
          { gross: 0, samNet: 0 },
        );
        const profilePoints = group.rows.reduce((sum, row) => {
          const profile = dogWorkProfile(
            row.pet,
            row.appointment.service,
            calibration,
          );
          return sum + (profile?.points ?? 0);
        }, 0);
        const breeds = uniqueText(group.rows.map((row) => row.pet?.breed));
        const services = uniqueText(
          group.rows.map((row) => row.appointment.service),
        );
        const card = (
          <Link
            href={appointmentHref(appointment.id)}
            className={`block rounded-xl border px-3.5 py-3 shadow-sm ${
              compact ? "shadow-none" : ""
            } ${appointmentCardTone(workflowStage)}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    {dayLabel(appointment.date)}
                  </p>
                  {workflowLabel ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${appointmentPillTone(
                        workflowStage,
                      )}`}
                    >
                      {workflowLabel}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-lg font-bold text-ink">
                  {appointment.time_slot ?? "Time not set"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-brand">
                  {appointment.price != null
                    ? `Net ${formatMoney(money.samNet)}`
                    : "No fee"}
                </p>
                {appointment.price != null ? (
                  <p className="mt-0.5 text-xs font-medium text-ink-faint">
                    Gross {formatMoney(money.gross)}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="mt-2 border-t border-line pt-2">
              <p className="font-semibold text-ink">
                {group.petNames.join(" + ")}
                {breeds ? (
                  <span className="font-normal text-ink-soft"> · {breeds}</span>
                ) : null}
              </p>
              <p className="text-sm text-ink-soft">
                {client
                  ? `${fullName(client.first_name, client.last_name)} · ${formatPhone(client.phone)}`
                  : "Unknown household"}
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                {services ?? "Service not set"}
                {location ? ` · ${location}` : ""}
              </p>
              {profilePoints > 0 ? (
                <p className="mt-1 text-xs text-ink-faint">
                  {group.petCount} dog{group.petCount === 1 ? "" : "s"} ·{" "}
                  {profilePoints.toFixed(2).replace(/\.00$/, "")} pts
                </p>
              ) : null}
            </div>
          </Link>
        );

        return (
          <div key={group.id}>
            {card}
          </div>
        );
      })}
    </div>
  );
}
