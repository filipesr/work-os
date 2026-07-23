export default function UsersLoading() {
  return (
    <div className="animate-pulse space-y-8">
      <div>
        <div className="h-8 w-40 bg-muted rounded" />
        <div className="mt-2 h-4 w-64 bg-muted rounded" />
      </div>
      <div className="bg-card shadow-lg rounded-xl border border-border overflow-hidden">
        <div className="bg-muted px-6 py-4 flex gap-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-4 w-20 bg-muted-foreground/10 rounded" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="px-6 py-4 border-t border-border flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-muted" />
              <div className="h-4 w-28 bg-muted rounded" />
            </div>
            <div className="h-4 w-40 bg-muted rounded" />
            <div className="h-6 w-20 bg-muted rounded-full" />
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="h-8 w-16 bg-muted rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
