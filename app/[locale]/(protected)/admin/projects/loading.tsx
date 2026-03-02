export default function ProjectsLoading() {
  return (
    <div className="animate-pulse space-y-8">
      <div>
        <div className="h-8 w-40 bg-muted rounded" />
        <div className="mt-2 h-4 w-64 bg-muted rounded" />
      </div>
      <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
        <div className="h-5 w-32 bg-muted rounded mb-4" />
        <div className="flex gap-4">
          <div className="flex-1 h-11 bg-muted rounded-lg" />
          <div className="h-11 w-40 bg-muted rounded-lg" />
          <div className="h-11 w-24 bg-muted rounded-lg" />
        </div>
      </div>
      <div className="bg-card shadow-lg rounded-xl border-2 border-border overflow-hidden">
        <div className="bg-muted px-6 py-4 flex gap-8">
          <div className="h-4 w-20 bg-muted-foreground/10 rounded" />
          <div className="h-4 w-20 bg-muted-foreground/10 rounded" />
          <div className="h-4 w-16 bg-muted-foreground/10 rounded" />
          <div className="h-4 w-20 bg-muted-foreground/10 rounded ml-auto" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="px-6 py-4 border-t border-border flex items-center gap-8">
            <div className="h-4 w-32 bg-muted rounded" />
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="h-4 w-16 bg-muted rounded" />
            <div className="h-8 w-16 bg-muted rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
