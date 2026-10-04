import { Skeleton } from "@/components/ui";
export default function Loading() {
  return (
    <div className="container page-shell" aria-label="Loading / جار التحميل">
      <Skeleton className="h-12 w-72 mb-8" />
      <div className="doctor-grid">
        {[1, 2, 3].map((x) => (
          <Skeleton className="skeleton-card" key={x} />
        ))}
      </div>
    </div>
  );
}
