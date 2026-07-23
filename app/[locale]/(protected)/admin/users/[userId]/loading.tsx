export default function UserDetailLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-pulse">
      <div className="h-5 w-40 bg-muted rounded mb-6" />

      <div className="bg-card shadow-lg rounded-xl border border-border p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-muted" />
            <div>
              <div className="h-8 w-48 bg-muted rounded mb-2" />
              <div className="h-4 w-36 bg-muted rounded mb-2" />
              <div className="flex gap-3">
                <div className="h-6 w-20 bg-muted rounded-full" />
                <div className="h-4 w-24 bg-muted rounded" />
              </div>
            </div>
          </div>
          <div className="h-10 w-16 bg-muted rounded-lg" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-card shadow-lg rounded-xl border border-border p-6">
            <div className="h-4 w-28 bg-muted rounded mb-2" />
            <div className="h-8 w-12 bg-muted rounded" />
          </div>
        ))}
      </div>

      <div className="mt-6">
        <div className="h-6 w-32 bg-muted rounded mb-4" />
        <div className="bg-card shadow-lg rounded-xl border border-border overflow-hidden">
          <div className="bg-muted h-12" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-6 py-4 border-t border-border flex gap-6">
              <div className="h-4 w-40 bg-muted rounded" />
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-4 w-20 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <div className="h-6 w-40 bg-muted rounded mb-4" />
        <div className="bg-card shadow-lg rounded-xl border border-border overflow-hidden">
          <div className="bg-muted h-12" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-6 py-4 border-t border-border flex gap-6">
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-4 w-12 bg-muted rounded" />
              <div className="h-4 w-48 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
