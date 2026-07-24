import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";
import { SectionCard } from "@/components/ui/SectionCard";

interface RefField {
  label: string;
  text?: string;
  items?: string[];
}

interface RefEntry {
  badge?: string;
  term: string;
  summary?: string;
  fields: RefField[];
}

interface RefPage {
  title: string;
  intro: string;
  entries: RefEntry[];
  sourcesLabel?: string;
  sources?: string[];
}

interface FundamentoUi {
  backToHelp: string;
}

function Field({ field }: { field: RefField }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {field.label}
      </p>
      {field.text ? (
        <p className="mt-1 text-sm leading-relaxed text-foreground">{field.text}</p>
      ) : null}
      {field.items ? (
        <ul className="mt-1.5 space-y-1.5">
          {field.items.map((item, i) => (
            <li
              key={i}
              className="relative pl-5 text-sm leading-relaxed text-foreground before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-primary/60"
            >
              {item}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function FundamentoView({ page, ui }: { page: RefPage; ui: FundamentoUi }) {
  return (
    <div className="container mx-auto max-w-3xl p-8">
      <Link
        href="/help"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {ui.backToHelp}
      </Link>

      <header className="mt-6 mb-10">
        <h1 className="text-3xl font-bold text-foreground mb-3">{page.title}</h1>
        <p className="text-lg text-muted-foreground leading-relaxed">{page.intro}</p>
      </header>

      <div className="space-y-6">
        {page.entries.map((entry, ei) => (
          <SectionCard
            key={ei}
            title={entry.term}
            badge={
              entry.badge ? (
                <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-primary px-2 text-sm font-bold text-primary-foreground">
                  {entry.badge}
                </span>
              ) : undefined
            }
            bodyClassName="p-6 space-y-4"
          >
            {entry.summary ? (
              <p className="text-sm leading-relaxed text-muted-foreground">{entry.summary}</p>
            ) : null}
            {entry.fields.map((field, fi) => (
              <Field key={fi} field={field} />
            ))}
          </SectionCard>
        ))}
      </div>

      {page.sources && page.sources.length > 0 ? (
        <div className="mt-10 rounded-xl border-2 border-primary/30 bg-primary/5 px-6 py-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <BookOpen className="h-4 w-4 text-primary" />
            {page.sourcesLabel ?? "Fontes"}
          </div>
          <ul className="space-y-1.5">
            {page.sources.map((source, i) => (
              <li key={i} className="text-sm leading-relaxed text-muted-foreground">
                {source}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
