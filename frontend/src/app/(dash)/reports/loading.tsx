import {
  SkeletonHeader,
  SkeletonTable,
  SkeletonTiles,
} from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonHeader />
      <SkeletonTiles count={3} />
      <SkeletonTable rows={6} columns={5} />
    </div>
  );
}
