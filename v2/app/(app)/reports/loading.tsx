import {
  SkeletonBlock,
  SkeletonCard,
  SkeletonHeader,
  SkeletonPage,
} from "@/components/Skeleton";

// Route-level loading state for Reports: heading plus summary tiles and a
// table-ish card.
export default function ReportsLoading() {
  return (
    <SkeletonPage label="Loading reports">
      <SkeletonHeader wide />
      <div className="mt-4 grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonCard key={i}>
            <SkeletonBlock className="h-4 w-2/3" />
            <SkeletonBlock className="mt-2.5 h-6 w-1/2" />
          </SkeletonCard>
        ))}
      </div>
      <div className="mt-4">
        <SkeletonCard>
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonBlock key={i} className={`h-4 w-full ${i ? "mt-3" : ""}`} />
          ))}
        </SkeletonCard>
      </div>
    </SkeletonPage>
  );
}
