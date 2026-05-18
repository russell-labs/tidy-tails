import { dataMode } from "@/lib/data/repo";

// A thin always-visible strip so the operator always knows whether they are
// looking at anonymized demo data or the real production book.
export function DataModeBanner() {
  const mode = dataMode();

  if (mode === "live") {
    return (
      <div className="bg-brand-soft px-4 py-1.5 text-center text-xs font-semibold text-brand-ink">
        Live data · production book
      </div>
    );
  }

  return (
    <div className="bg-brand-soft px-4 py-1.5 text-center text-xs font-medium text-brand-ink">
      Demo data · anonymized fixtures
    </div>
  );
}
