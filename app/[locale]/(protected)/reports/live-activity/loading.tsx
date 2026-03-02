export default function LiveActivityLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-5 w-5 bg-muted rounded" />
            <div className="h-8 w-56 bg-muted rounded" />
          </div>
          <div className="h-4 w-72 bg-muted rounded" />
        </div>
        <div className="h-4 w-40 bg-muted rounded" />
      </div>
      <div className="bg-card rounded-xl border border-border shadow-sm">
        <div className="p-6 border-b border-border">
          <div className="h-6 w-48 bg-muted rounded" />
        </div>
        <div className="p-6">
          <div className="flex flex-wrap justify-center gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="w-52 rounded-xl border-2 border-border overflow-hidden">
                <div className="h-24 bg-muted" />
                <div className="flex justify-center -mt-12 mb-4">
                  <div className="h-24 w-24 rounded-full bg-muted border-4 border-background" />
                </div>
                <div className="px-4 pb-4 space-y-2">
                  <div className="h-5 w-32 bg-muted rounded mx-auto" />
                  <div className="h-3 w-20 bg-muted rounded mx-auto" />
                  <div className="pt-2 border-t">
                    <div className="h-3 w-28 bg-muted rounded mx-auto" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
