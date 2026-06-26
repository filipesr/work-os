export default function LocaleLoading() {
  return (
    <div
      role="status"
      aria-label="Carregando"
      className="min-h-screen flex items-center justify-center bg-background"
    >
      <div className="h-10 w-10 rounded-full border-4 border-muted border-t-primary animate-spin" />
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
