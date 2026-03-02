export default function AdminTaskDetailLoading() {
  return (
    <div className="container mx-auto p-8 animate-pulse">
      <div className="h-5 w-32 bg-muted rounded mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="h-8 w-72 bg-muted rounded mb-2" />
                <div className="h-4 w-full bg-muted rounded" />
              </div>
              <div className="h-7 w-24 bg-muted rounded-full ml-4" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t-2 border-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i}>
                  <div className="h-3 w-16 bg-muted rounded mb-2" />
                  <div className="h-5 w-24 bg-muted rounded" />
                </div>
              ))}
            </div>
          </div>
          <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
            <div className="h-6 w-32 bg-muted rounded mb-4" />
            <div className="h-20 bg-muted rounded-lg" />
          </div>
          <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
            <div className="h-6 w-40 bg-muted rounded mb-4" />
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 bg-muted rounded-lg" />
              ))}
            </div>
          </div>
        </div>
        <div className="lg:col-span-1">
          <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
            <div className="h-6 w-24 bg-muted rounded mb-4" />
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-12 bg-muted rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
