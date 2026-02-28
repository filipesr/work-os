import { StatsCardSkeleton, TableSkeleton } from "@/components/dashboard/DashboardSkeleton";

export default function DashboardLoading() {
  return (
    <div className="container mx-auto py-6 px-4">
      <div className="mb-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="mt-2 h-4 w-64 bg-muted rounded animate-pulse" />
      </div>
      <StatsCardSkeleton />
      <div className="space-y-8">
        <TableSkeleton rows={3} />
        <TableSkeleton rows={3} />
      </div>
    </div>
  );
}
