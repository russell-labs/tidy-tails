import type { Metadata } from "next";
import Link from "next/link";
import { collapseLoggedGroomDuplicates } from "@/lib/appointmentLedger";
import { loadDataset } from "@/lib/data/repo";
import { lapsedClients, revenueInRange, vaccinationState } from "@/lib/derive";
import {
  formatDate,
  formatMoney,
  formatPhone,
  fullName,
  relativeDate,
} from "@/lib/format";
import { readOperatorSettings } from "@/lib/operatorSettings.server";
import { parsePaymentInfo } from "@/lib/payments";

export const metadata: Metadata = { title: "Reports" };

function parseMonth(raw: string | undefined): { year: number; month: number } {
  const now = new Date();
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number);
    if (m >= 1 && m <= 12) return { year: y, month: m - 1 };
  }
  return { year: now.getFullYear(), month: now.getMonth() };
}

function monthKey(year: number, month: number, delta: number): string {
  const d = new Date(year, month + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    period?: string;
    threshold?: string;
    lapsed?: string;
  }>;
}) {
  const {
    month: monthParam,
    period: periodParam,
    threshold: thresholdParam,
    lapsed: lapsedParam,
  } = await searchParams;
  const { year, month } = parseMonth(monthParam);
  const operatorSettings = await readOperatorSettings();
  const { clients, pets, appointments: rawAppointments, vaccinations } = await loadDataset();
  const appointments = collapseLoggedGroomDuplicates(rawAppointments);
  const threshold = parseThreshold(
    thresholdParam,
    operatorSettings.lapsedThresholdDays,
  );
  const period =
    periodParam === "month" || periodParam === "ytd" || periodParam === "all"
      ? periodParam
      : "all";
  const lapsedView =
    lapsedParam === "never" || lapsedParam === "all" ? lapsedParam : "overdue";

  const monthFrom = `${year}-${pad(month + 1)}-01`;
  const monthTo = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;
  const today = new Date().toISOString().slice(0, 10);
  const appointmentDates = appointments.map((a) => a.date).sort();
  const firstAppointmentDate = appointmentDates[0] ?? today;
  const lastAppointmentDate = appointmentDates.at(-1) ?? today;
  const from =
    period === "all"
      ? firstAppointmentDate
      : period === "ytd"
        ? `${new Date().getFullYear()}-01-01`
        : monthFrom;
  const to =
    period === "all" ? lastAppointmentDate : period === "ytd" ? today : monthTo;
  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
  });
  const rangeLabel =
    period === "all"
      ? "All time"
      : period === "ytd"
        ? `${new Date().getFullYear()} year to date`
        : monthLabel;
  const revenue = revenueInRange(appointments, from, to);
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const petsById = new Map(pets.map((pet) => [pet.id, pet]));
  const waitingPayments = appointments
    .filter((appointment) => parsePaymentInfo(appointment.notes).status === "waiting")
    .sort((a, b) => a.date.localeCompare(b.date));
  const waitingTotal = waitingPayments.reduce(
    (sum, appointment) => sum + (appointment.price ?? 0) + (appointment.tip ?? 0),
    0,
  );

  const lapsed = lapsedClients(clients, appointments, pets, threshold);
  const overdue = lapsed.filter((row) => row.daysSince != null);
  const never = lapsed.filter((row) => row.daysSince == null);
  const visibleLapsed =
    lapsedView === "all" ? lapsed : lapsedView === "never" ? never : overdue;

  const vaxAlerts = vaccinations
    .map((v) => ({ v, state: vaccinationState(v) }))
    .filter((x) => x.state === "expired" || x.state === "expiring")
    .map((x) => {
      const pet = pets.find((p) => p.id === x.v.pet_id);
      const client = pet ? clients.find((c) => c.id === pet.client_id) : undefined;
      return { ...x, pet, client };
    })
    .filter((x) => x.pet && x.client)
    .sort((a, b) => a.v.expires_at.localeCompare(b.v.expires_at));

  return (
    <main className="px-4 py-5">
      <h1 className="text-xl font-bold text-ink">Reports</h1>

      {/* Revenue ------------------------------------------------------------ */}
      <section className="mt-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Revenue
        </h2>

        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <PeriodLink active={period === "month"} href={`/reports?period=month&month=${monthKey(year, month, 0)}&threshold=${threshold}&lapsed=${lapsedView}`}>
            Month
          </PeriodLink>
          <PeriodLink active={period === "ytd"} href={`/reports?period=ytd&threshold=${threshold}&lapsed=${lapsedView}`}>
            Year
          </PeriodLink>
          <PeriodLink active={period === "all"} href={`/reports?period=all&threshold=${threshold}&lapsed=${lapsedView}`}>
            All
          </PeriodLink>
        </div>

        <div className="mt-3">
          {period === "month" ? (
            <div className="flex items-center justify-center gap-2">
            <Link
              href={`/reports?period=month&month=${monthKey(year, month, -1)}&threshold=${threshold}&lapsed=${lapsedView}`}
              aria-label="Previous month"
              className="rounded-lg border border-line bg-surface px-2 py-1 text-ink-soft"
            >
              ‹
            </Link>
            <span className="min-w-[7.5rem] text-center text-sm font-semibold text-ink">
              {monthLabel}
            </span>
            <Link
              href={`/reports?period=month&month=${monthKey(year, month, 1)}&threshold=${threshold}&lapsed=${lapsedView}`}
              aria-label="Next month"
              className="rounded-lg border border-line bg-surface px-2 py-1 text-ink-soft"
            >
              ›
            </Link>
            </div>
          ) : (
            <p className="text-sm font-semibold text-ink">
              {rangeLabel}
            </p>
          )}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <StatTile
            label="Total collected"
            value={formatMoney(revenue.total)}
            className="col-span-2"
            valueClassName="text-[clamp(1.9rem,9vw,2.4rem)]"
          />
          <StatTile label="Fees" value={formatMoney(revenue.fees)} />
          <StatTile label="Tips" value={formatMoney(revenue.tips)} />
          <StatTile label="Visits" value={String(revenue.count)} />
          <StatTile label="Avg total" value={formatMoney(revenue.averageTotal)} />
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          Showing {rangeLabel}.{" "}
          {revenue.count === 0
            ? "No appointments are recorded in this range; try All or Year."
            : "Collected totals exclude visits marked waiting on payment; active card clients are still being added."}
        </p>
      </section>

      {/* Payment follow-up -------------------------------------------------- */}
      <section className="mt-7">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Payment follow-up
        </h2>
        <p className="mb-2 text-xs text-ink-faint">
          Waiting on payment · {waitingPayments.length} visit
          {waitingPayments.length === 1 ? "" : "s"} · {formatMoney(waitingTotal)}
        </p>
        {waitingPayments.length === 0 ? (
          <p className="text-sm text-ink-faint">No payments are marked waiting.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {waitingPayments.slice(0, 12).map((appointment) => {
              const client = clientsById.get(appointment.client_id);
              const pet = petsById.get(appointment.pet_id);
              return (
                <li key={appointment.id}>
                  <Link
                    href={`/clients/${appointment.client_id}`}
                    className="block rounded-xl border border-line bg-surface px-4 py-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold text-ink">
                        {client
                          ? fullName(client.first_name, client.last_name)
                          : appointment.client_id}
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-warn">
                        {formatMoney((appointment.price ?? 0) + (appointment.tip ?? 0))}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {pet?.name ?? "Pet"} · {formatDate(appointment.date)} ·{" "}
                      {client ? formatPhone(client.phone) : ""}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Lapsed clients ----------------------------------------------------- */}
      <section className="mt-7">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Follow-up list
        </h2>
        <p className="mb-2 text-xs text-ink-faint">
          No visit in {threshold}+ days · {overdue.length} overdue ·{" "}
          {never.length} with no visit history
        </p>
        <div className="mb-3 grid grid-cols-3 gap-1.5">
          <PeriodLink active={lapsedView === "overdue"} href={`/reports?period=${period}&month=${monthKey(year, month, 0)}&threshold=${threshold}&lapsed=overdue`}>
            Overdue
          </PeriodLink>
          <PeriodLink active={lapsedView === "never"} href={`/reports?period=${period}&month=${monthKey(year, month, 0)}&threshold=${threshold}&lapsed=never`}>
            No visits
          </PeriodLink>
          <PeriodLink active={lapsedView === "all"} href={`/reports?period=${period}&month=${monthKey(year, month, 0)}&threshold=${threshold}&lapsed=all`}>
            All
          </PeriodLink>
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {[60, 90, 120, 180].map((days) => (
            <PeriodLink
              key={days}
              active={threshold === days}
              href={`/reports?period=${period}&month=${monthKey(year, month, 0)}&threshold=${days}&lapsed=${lapsedView}`}
            >
              {days}d
            </PeriodLink>
          ))}
        </div>
        {visibleLapsed.length === 0 ? (
          <p className="text-sm text-ink-faint">Everyone has been seen recently.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visibleLapsed.map((row) => (
              <li key={row.client.id}>
                <Link
                  href={`/clients/${row.client.id}`}
                  className="block rounded-xl border border-line bg-surface px-4 py-3 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-ink">
                      {fullName(row.client.first_name, row.client.last_name)}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-warn">
                      {row.daysSince != null ? `${row.daysSince} days` : "never"}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-ink-soft">
                    {row.pets.map((p) => p.name).join(", ") || "No pets on file"}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {row.lastVisit
                      ? `Last groom ${formatDate(row.lastVisit.date)}`
                      : "No visits recorded"}
                    {" · "}
                    {formatPhone(row.client.phone)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Vaccination alerts ------------------------------------------------- */}
      <section className="mt-7">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Vaccination alerts
        </h2>
        <p className="mb-2 text-xs text-ink-faint">
          Expired or expiring within 30 days · {vaxAlerts.length} record
          {vaxAlerts.length === 1 ? "" : "s"}
        </p>
        {vaxAlerts.length === 0 ? (
          <p className="text-sm text-ink-faint">
            No vaccinations need attention.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {vaxAlerts.map(({ v, state, pet, client }) => (
              <li key={v.id}>
                <Link
                  href={`/clients/${client!.id}/pets/${pet!.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">
                      {pet!.name}{" "}
                      <span className="font-normal text-ink-soft">
                        · {v.vaccine_type}
                      </span>
                    </p>
                    <p className="truncate text-xs text-ink-faint">
                      {fullName(client!.first_name, client!.last_name)} ·{" "}
                      {relativeDate(v.expires_at)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      state === "expired"
                        ? "bg-danger-soft text-danger-ink"
                        : "bg-warn-soft text-warn"
                    }`}
                  >
                    {state === "expired" ? "Expired" : "Expiring"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-7 text-center text-xs text-ink-faint">
        <Link
          href={`/reports/export?period=${period}&month=${monthKey(year, month, 0)}&threshold=${threshold}&lapsed=${lapsedView}`}
          className="font-semibold text-brand"
        >
          Download bookkeeper Excel
        </Link>
        {" · "}
        Includes fees, tips, and total collected for this range.
      </p>
    </main>
  );
}

function StatTile({
  label,
  value,
  className = "",
  valueClassName = "text-lg",
}: {
  label: string;
  value: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={`rounded-xl border border-line bg-surface px-3 py-3 text-center ${className}`}>
      <p className={`break-words font-bold leading-tight text-ink ${valueClassName}`}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-ink-soft">{label}</p>
    </div>
  );
}

function PeriodLink({
  active,
  href,
  children,
}: {
  active: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg border px-2 py-1.5 text-center text-xs font-semibold ${
        active
          ? "border-brand bg-brand text-white"
          : "border-line bg-surface text-ink-soft"
      }`}
    >
      {children}
    </Link>
  );
}

function parseThreshold(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return [60, 90, 120, 180].includes(n) ? n : fallback;
}
