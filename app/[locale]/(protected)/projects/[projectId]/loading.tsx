export default function ProjectDetailLoading() {
  return (
    <div className="container mx-auto py-6 animate-pulse">
      <div className="mb-6">
        <div className="h-8 w-48 bg-muted rounded mb-2" />
        <div className="h-4 w-32 bg-muted rounded" />
      </div>
      <div className="flex gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex-1 min-w-[250px]">
            <div className="h-8 w-full bg-muted rounded-lg mb-3" />
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, j) => (
                <div key={j} className="h-24 bg-muted rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
