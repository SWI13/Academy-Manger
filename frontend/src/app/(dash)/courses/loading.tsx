import { SkeletonHeader, SkeletonTable } from "@/components/ui/Skeleton";

/**
 * The shape of the catalogue, before it arrives.
 *
 * Streamed while the server fetches. It matches the real layout closely
 * enough that the rows land where their skeletons were, so the page settles
 * instead of reflowing.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonHeader />
      <SkeletonTable rows={6} columns={5} />
    </div>
  );
}
