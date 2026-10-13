import { Skeleton } from "@/components/ui/empty";

export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-6 h-8 w-40" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="card mb-4 p-4">
          <Skeleton className="mb-3 h-4 w-24" />
          <Skeleton className="mb-2 h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}
