export default function TasksLoading() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <div className="h-7 w-32 bg-muted rounded animate-pulse" />
        <div className="mt-1 h-4 w-64 bg-muted rounded animate-pulse" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-20 bg-muted rounded-md animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>
      <div className="h-64 bg-muted rounded-xl animate-pulse" />
    </div>
  );
}
