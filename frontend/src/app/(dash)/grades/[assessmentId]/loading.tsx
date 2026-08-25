import {
  SkeletonDetail,
  SkeletonHeader,
  SkeletonTable,
} from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonHeader lede={false} />
      <SkeletonDetail items={4} />
      <SkeletonTable rows={10} columns={4} />
    </div>
  );
}
