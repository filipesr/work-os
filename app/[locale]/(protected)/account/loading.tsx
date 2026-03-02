export default function AccountLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto bg-card rounded-xl border-2 border-border shadow-lg">
        <div className="p-6 animate-pulse space-y-6">
          <div>
            <div className="h-7 w-40 bg-muted rounded" />
            <div className="mt-2 h-4 w-64 bg-muted rounded" />
          </div>
          <div className="flex justify-center">
            <div className="w-[120px] h-[120px] rounded-full bg-muted" />
          </div>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="border-b border-border pb-3">
                <div className="h-3 w-20 bg-muted rounded mb-2" />
                <div className="h-5 w-48 bg-muted rounded" />
              </div>
            ))}
          </div>
          <div className="flex justify-center pt-4">
            <div className="h-10 w-32 bg-muted rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
