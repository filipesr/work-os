export default function PerformanceLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="h-5 w-5 bg-muted rounded" />
          <div className="h-8 w-64 bg-muted rounded" />
        </div>
        <div className="h-4 w-72 bg-muted rounded" />
      </div>
      <div className="flex gap-4">
        <div className="h-10 w-40 bg-muted rounded-lg" />
        <div className="h-10 w-40 bg-muted rounded-lg" />
        <div className="h-10 w-24 bg-muted rounded-lg" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card rounded-xl border border-border shadow-sm p-6">
            <div className="h-5 w-40 bg-muted rounded mb-4" />
            <div className="h-48 bg-muted rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
