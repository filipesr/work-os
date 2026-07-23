export default function LiveActivityLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-pulse">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 h-4 w-20 bg-muted rounded" />
          <div className="mb-2 h-8 w-56 bg-muted rounded" />
          <div className="h-4 w-72 bg-muted rounded" />
        </div>
        <div className="h-9 w-40 bg-muted rounded-lg" />
      </div>
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-6">
          <div className="h-6 w-48 bg-muted rounded" />
        </div>
        <div className="p-6">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border p-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-24 bg-muted rounded" />
                    <div className="h-3 w-16 bg-muted rounded" />
                  </div>
                </div>
                <div className="mt-3 h-10 bg-muted rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
