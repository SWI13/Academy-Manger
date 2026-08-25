import { SkeletonHeader, SkeletonTiles } from "@/components/ui/Skeleton";

/**
 * The dashboard, before its figures arrive.
 *
 * Four tiles is the common case across roles. Guessing high would leave a
 * hole when a receptionist's three land; guessing low would push the page
 * down as the owner's eight do.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-8">
      <SkeletonHeader />
      <SkeletonTiles count={3} />
      <SkeletonTiles count={4} />
    </div>
  );
}
