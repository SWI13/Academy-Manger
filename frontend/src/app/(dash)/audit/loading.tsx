import { SkeletonHeader, SkeletonList } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonHeader />
      <SkeletonList rows={6} />
    </div>
  );
}
