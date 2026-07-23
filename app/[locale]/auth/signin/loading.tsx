export default function SignInLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full space-y-8 p-10 bg-card rounded-2xl shadow-2xl border border-border">
        <div className="animate-pulse space-y-6">
          <div className="space-y-3 text-center">
            <div className="h-10 w-40 bg-muted rounded mx-auto" />
            <div className="h-4 w-56 bg-muted rounded mx-auto" />
          </div>
          <div className="h-12 w-full bg-muted rounded-lg" />
        </div>
      </div>
    </div>
  );
}
