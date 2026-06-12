import {
  SkeletonBlock,
  SkeletonCardList,
  SkeletonHeader,
  SkeletonPage,
} from "@/components/Skeleton";

// Route-level loading state for the home (search) cockpit. Mirrors the page
// shape: heading, search field, household cards.
export default function HomeLoading() {
  return (
    <SkeletonPage label="Loading clients">
      <SkeletonHeader />
      <SkeletonBlock className="mt-4 h-12 w-full rounded-xl" />
      <SkeletonCardList cards={4} />
    </SkeletonPage>
  );
}
