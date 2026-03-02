export default function TVLoading() {
  return (
    <div className="min-h-screen bg-background p-6 animate-pulse">
      <div className="flex items-center justify-between mb-8">
        <div className="h-10 w-64 bg-muted rounded" />
        <div className="h-8 w-32 bg-muted rounded" />
      </div>
      <div className="flex flex-wrap justify-center gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="w-52 rounded-xl border-2 border-border overflow-hidden">
            <div className="h-24 bg-muted" />
            <div className="flex justify-center -mt-12 mb-4">
              <div className="h-24 w-24 rounded-full bg-muted border-4 border-background" />
            </div>
            <div className="px-4 pb-4 space-y-2">
              <div className="h-5 w-32 bg-muted rounded mx-auto" />
              <div className="h-3 w-20 bg-muted rounded mx-auto" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
