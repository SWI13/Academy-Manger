import { SkeletonHeader, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonHeader />
      <SkeletonTable rows={8} columns={5} />
    </div>
  );
}
