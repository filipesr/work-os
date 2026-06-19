export default function CalendarLoading() {
  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="h-8 w-64 bg-muted rounded animate-pulse" />
      <div className="h-12 bg-muted rounded animate-pulse" />
      <div className="bg-card border-2 border-border rounded-xl overflow-hidden">
        <div className="grid gap-2 p-4" style={{ gridTemplateColumns: "180px repeat(7, 1fr)" }}>
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="h-12 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
