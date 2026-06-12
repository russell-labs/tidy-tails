import {
  SkeletonBlock,
  SkeletonCard,
  SkeletonHeader,
  SkeletonPage,
} from "@/components/Skeleton";

// Route-level loading state for Schedule: heading, week strip, day cards.
export default function ScheduleLoading() {
  return (
    <SkeletonPage label="Loading schedule">
      <SkeletonHeader />
      <div className="mt-4 flex gap-2">
        {Array.from({ length: 7 }, (_, i) => (
          <SkeletonBlock key={i} className="h-14 flex-1 rounded-xl" />
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <SkeletonCard key={i}>
            <SkeletonBlock className="h-5 w-1/3" />
            <SkeletonBlock className="mt-2.5 h-4 w-2/3" />
            <SkeletonBlock className="mt-2.5 h-4 w-2/5" />
          </SkeletonCard>
        ))}
      </div>
    </SkeletonPage>
  );
}
