export default function TemplatesLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-pulse space-y-8">
      <div>
        <div className="h-8 w-56 bg-muted rounded mb-2" />
        <div className="h-4 w-72 bg-muted rounded" />
      </div>
      <div className="bg-card shadow-lg rounded-xl border border-border p-6 space-y-4">
        <div className="h-6 w-40 bg-muted rounded" />
        <div>
          <div className="h-4 w-20 bg-muted rounded mb-2" />
          <div className="h-11 w-full bg-muted rounded-lg" />
        </div>
        <div>
          <div className="h-4 w-24 bg-muted rounded mb-2" />
          <div className="h-24 w-full bg-muted rounded-lg" />
        </div>
        <div className="h-11 w-32 bg-muted rounded-lg" />
      </div>
      <div className="bg-card shadow-lg rounded-xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b-2 border-border bg-muted">
          <div className="h-6 w-40 bg-muted-foreground/10 rounded" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="p-6 border-t border-border">
            <div className="h-5 w-48 bg-muted rounded mb-2" />
            <div className="h-4 w-72 bg-muted rounded mb-2" />
            <div className="flex items-center gap-4">
              <div className="h-3 w-20 bg-muted rounded" />
              <div className="h-3 w-32 bg-muted rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
