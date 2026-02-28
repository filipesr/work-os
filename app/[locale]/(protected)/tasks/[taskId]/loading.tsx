export default function TaskDetailLoading() {
  return (
    <div className="container mx-auto py-6">
      <div className="animate-pulse space-y-6">
        <div className="h-6 w-24 bg-muted rounded" />
        <div className="h-8 w-96 bg-muted rounded" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="h-48 bg-muted rounded-xl" />
            <div className="h-32 bg-muted rounded-xl" />
          </div>
          <div className="space-y-4">
            <div className="h-64 bg-muted rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
