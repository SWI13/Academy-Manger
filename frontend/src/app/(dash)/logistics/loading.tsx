import { SkeletonHeader, SkeletonTable, SkeletonTiles } from "@/components/ui/Skeleton";

/**
 * The shape of the inventory, before it arrives.
 *
 * Six tiles and a table, which is what lands - so the figures appear where
 * their placeholders were and the page settles rather than reflowing under
 * somebody's cursor.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonHeader />
      <SkeletonTiles count={6} />
      <SkeletonTable rows={8} columns={6} />
    </div>
  );
}
