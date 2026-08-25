import { SkeletonDetail, SkeletonHeader } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonHeader lede={false} />
      <SkeletonDetail items={3} />
      <SkeletonDetail items={4} />
    </div>
  );
}
