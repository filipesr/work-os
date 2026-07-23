export default function TeamProductivityLoading() {
  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="h-8 w-72 bg-muted rounded animate-pulse" />
      <div className="h-12 bg-muted rounded animate-pulse" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-card border border-border rounded-xl p-6">
          <div className="h-6 w-48 bg-muted rounded animate-pulse mb-3" />
          <div className="h-24 bg-muted rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}
