interface SlideShellProps {
  kicker?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  align?: "center" | "start";
  toneClass?: string;
  children?: React.ReactNode;
}

export function SlideShell({
  kicker,
  title,
  subtitle,
  align = "center",
  toneClass,
  children,
}: SlideShellProps) {
  const alignClass = align === "center" ? "items-center text-center" : "items-start text-left";
  return (
    <div
      className={`flex h-full w-full flex-col justify-center ${alignClass} max-w-5xl mx-auto px-8 py-12 ${
        toneClass ?? ""
      }`}
    >
      {kicker && (
        <span className="text-xs font-bold tracking-widest uppercase text-primary/80 mb-3">
          {kicker}
        </span>
      )}
      <h2 className="text-4xl md:text-5xl font-extrabold text-foreground leading-tight">{title}</h2>
      {subtitle && (
        <p className="mt-4 text-lg md:text-xl text-muted-foreground max-w-3xl">{subtitle}</p>
      )}
      {children && <div className="mt-10 w-full">{children}</div>}
    </div>
  );
}
