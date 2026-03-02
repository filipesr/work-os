export default function TemplateDetailLoading() {
  return (
    <div className="container mx-auto p-8 animate-pulse">
      <div className="h-5 w-40 bg-muted rounded mb-6" />
      <div className="bg-card border border-border shadow-sm rounded-lg p-6 mb-8">
        <div className="h-8 w-64 bg-muted rounded mb-2" />
        <div className="h-4 w-96 bg-muted rounded" />
      </div>
      <div className="bg-card border border-border shadow-sm rounded-lg p-6 space-y-6">
        <div>
          <div className="h-7 w-48 bg-muted rounded mb-3" />
          <div className="h-4 w-72 bg-muted rounded" />
        </div>
        <div className="space-y-4">
          <div className="h-4 w-24 bg-muted rounded mb-2" />
          <div className="h-11 w-full bg-muted rounded-lg" />
          <div className="flex gap-4">
            <div className="h-11 w-40 bg-muted rounded-lg" />
            <div className="h-11 w-40 bg-muted rounded-lg" />
          </div>
          <div className="h-11 w-32 bg-muted rounded-lg" />
        </div>
        <div className="mt-8 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
