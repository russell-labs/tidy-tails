import { SkeletonCardList, SkeletonHeader, SkeletonPage } from "@/components/Skeleton";

// Route-level loading state for the inbox: heading plus thread cards.
export default function InboxLoading() {
  return (
    <SkeletonPage label="Loading inbox">
      <SkeletonHeader />
      <SkeletonCardList cards={4} />
    </SkeletonPage>
  );
}
