export default function NewTaskLoading() {
  return (
    <div className="container mx-auto p-8 max-w-3xl animate-pulse space-y-8">
      <div>
        <div className="h-5 w-32 bg-muted rounded mb-4" />
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="mt-2 h-4 w-64 bg-muted rounded" />
      </div>
      <div className="bg-card shadow-lg rounded-xl border border-border p-6 space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <div className="h-4 w-24 bg-muted rounded mb-2" />
            <div className="h-11 w-full bg-muted rounded-lg" />
          </div>
        ))}
        <div>
          <div className="h-4 w-24 bg-muted rounded mb-2" />
          <div className="h-24 w-full bg-muted rounded-lg" />
        </div>
        <div className="h-11 w-32 bg-muted rounded-lg" />
      </div>
      <div className="bg-primary/5 border-2 border-primary/20 rounded-xl p-5">
        <div className="h-4 w-40 bg-muted rounded mb-3" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-3 w-full bg-muted rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
