import Link from "next/link";
import { inferSizeClass, type SizeClass } from "@/lib/dayCapacity";
import type { ScheduledAppointment } from "@/lib/schedule";
import {
  oneToOneDaySummary,
  oneToOneHeavinessNote,
  oneToOneLoadSummaryText,
} from "@/lib/scheduling/oneToOne";
import {
  formatMinutes,
  parseTimeToMinutes,
  type WorkingDay,
} from "@/lib/scheduling/time";

// 1:1 (one_to_one) day view (WS4a). One dog per time block, ordered by start,
// with visible gaps and an informational capacity line against the soft target.
// Deliberately omits the salon day-closeout controls (Sam's batched finance);
// per-location closeout for a 1:1/own-facility org is WS4b.

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

type Block = {
  id: string;
  startMinutes: number | null;
  startLabel: string;
  endLabel: string | null;
  durationMinutes: number | null;
  petName: string;
  size: SizeClass;
  service: string | null;
  location: string | null;
};

export function OneToOneOpenedDay({
  date,
  rows,
  softTarget,
  bufferMinutes,
  workingDay,
}: {
  date: string;
  rows: ScheduledAppointment[];
  softTarget: number;
  bufferMinutes: number;
  workingDay: WorkingDay;
}) {
  const blocks: Block[] = rows
    .map((row): Block => {
      const start = parseTimeToMinutes(row.appointment.time_slot);
      const duration = row.appointment.duration_minutes ?? null;
      return {
        id: row.appointment.id,
        startMinutes: start,
        startLabel: row.appointment.time_slot ?? "Time not set",
        endLabel:
          start != null && duration != null ? formatMinutes(start + duration) : null,
        durationMinutes: duration,
        petName: row.pet?.name ?? "Dog",
        size: row.pet ? inferSizeClass(row.pet) : "unknown",
        service: row.appointment.service,
        location: row.appointment.location ?? null,
      };
    })
    .sort((a, b) => (a.startMinutes ?? 1e9) - (b.startMinutes ?? 1e9));

  const summary = oneToOneDaySummary({
    date,
    blocks: blocks.map((b) => ({
      durationMinutes: b.durationMinutes ?? 0,
      size: b.size,
    })),
    softTarget,
    workingDay,
  });
  const heavinessNote = oneToOneHeavinessNote(summary);

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="rounded-xl border border-line bg-surface px-3.5 py-3">
        <p className="text-sm font-semibold text-ink">
          {summary.totalDogs} {summary.totalDogs === 1 ? "dog" : "dogs"} ·{" "}
          {oneToOneLoadSummaryText(summary)}
        </p>
        <p className="mt-0.5 text-xs text-ink-soft">
          {summary.overTarget
            ? `Over the usual ${softTarget}/day — a fuller day, but still your call.`
            : `Soft target ${softTarget}/day.`}
          {bufferMinutes > 0 ? ` · ${bufferMinutes}-min buffer on.` : ""}
        </p>
      </div>

      {heavinessNote ? (
        <p className="rounded-xl bg-warn-soft px-3.5 py-3 text-sm font-medium text-warn">
          {heavinessNote}
        </p>
      ) : null}

      {blocks.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-3.5 py-4 text-sm text-ink-soft">
          No appointments on this day yet.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {blocks.map((block) => (
            <li key={block.id}>
              <Link
                href={`/schedule/appointments/${block.id}`}
                className="flex items-stretch gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 active:bg-canvas"
              >
                <div className="w-20 shrink-0 border-r border-line pr-3">
                  <p className="text-sm font-semibold text-ink">{block.startLabel}</p>
                  {block.endLabel ? (
                    <p className="text-xs text-ink-soft">to {block.endLabel}</p>
                  ) : null}
                  {block.durationMinutes ? (
                    <p className="mt-1 text-xs text-ink-faint">
                      {formatDuration(block.durationMinutes)}
                    </p>
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {block.petName}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-ink-soft">
                    {block.service ?? "Service not set"}
                    {block.location ? ` · ${block.location}` : ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
