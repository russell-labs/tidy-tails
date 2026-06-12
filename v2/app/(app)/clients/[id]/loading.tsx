import {
  SkeletonBlock,
  SkeletonCard,
  SkeletonCardList,
  SkeletonPage,
} from "@/components/Skeleton";

// Route-level loading state for a household page: back link, name block,
// contact card, pet cards.
export default function ClientLoading() {
  return (
    <SkeletonPage label="Loading household">
      <SkeletonBlock className="h-4 w-16" />
      <SkeletonBlock className="mt-4 h-7 w-44" />
      <div className="mt-4">
        <SkeletonCard>
          <SkeletonBlock className="h-4 w-1/2" />
          <SkeletonBlock className="mt-2.5 h-4 w-2/5" />
        </SkeletonCard>
      </div>
      <SkeletonCardList cards={2} />
    </SkeletonPage>
  );
}
