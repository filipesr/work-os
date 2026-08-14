import Link from "next/link";
import { ArrowLeft, ArrowRight, ListOrdered, TriangleAlert, XCircle } from "lucide-react";
import { SectionCard } from "@/components/ui/SectionCard";
import { CopySkeletonButton } from "@/components/help/CopySkeletonButton";
import type { ReportModelContent, ReportModelUi } from "@/lib/team-profiles/content";
import type { ReportModel } from "@/lib/team-profiles/reports";

/**
 * Renderiza UM modelo de relatório: a que pergunta responde, quem lê, a
 * anatomia, as regras, o que estraga, um exemplo preenchido e o esqueleto
 * copiável.
 *
 * O exemplo vem marcado como fictício de forma inescapável — é conteúdo com
 * cara de relatório real e não pode ser confundido com dado de cliente.
 */

function Bullets({ items, tone = "primary" }: { items: string[]; tone?: "primary" | "danger" }) {
  const dot = tone === "danger" ? "before:bg-destructive/60" : "before:bg-primary/60";
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li
          key={i}
          className={`relative pl-5 text-sm leading-relaxed text-foreground before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full ${dot}`}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

export function ReportModelView({
  model,
  content,
  ui,
  profileTitle,
  profileSlug,
  destinationLabel,
  sensitivityLabel,
}: {
  model: ReportModel;
  content: ReportModelContent;
  ui: ReportModelUi;
  profileTitle: string;
  profileSlug: string;
  destinationLabel: string;
  sensitivityLabel: string;
}) {
  const Icon = model.icon;

  return (
    <div className="container mx-auto max-w-3xl p-8">
      <Link
        href="/help/relatorios"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {ui.backToIndex}
      </Link>

      <header className="mb-10 mt-6">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold text-foreground">{content.titulo}</h1>
            <p className="mt-2 text-lg leading-relaxed text-muted-foreground">{content.resumo}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-4 text-sm">
          <span className="text-muted-foreground">
            {ui.producedBy}{" "}
            <Link
              href={`/help/equipes/${profileSlug}`}
              className="font-medium text-primary hover:underline"
            >
              {profileTitle}
            </Link>
          </span>
          <span className="inline-flex items-baseline gap-1.5 rounded-md bg-muted px-2 py-1 text-xs">
            <span className="font-medium uppercase tracking-wide text-muted-foreground">
              {destinationLabel}
            </span>
            <span className="font-semibold text-foreground">{sensitivityLabel}</span>
          </span>
        </div>
      </header>

      <div className="space-y-6">
        <SectionCard bodyClassName="space-y-4 p-6">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {ui.sectionLabels.paraQue}
            </p>
            <p className="text-sm leading-relaxed text-foreground">{content.paraQue}</p>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {ui.sectionLabels.leitor}
            </p>
            <p className="text-sm leading-relaxed text-foreground">{content.leitor}</p>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {ui.sectionLabels.quando}
            </p>
            <p className="text-sm leading-relaxed text-foreground">{content.quando}</p>
          </div>
        </SectionCard>

        <SectionCard
          title={ui.sectionLabels.estrutura}
          subtitle={ui.structureHint}
          icon={ListOrdered}
          bodyClassName="p-6"
        >
          <ol className="space-y-4">
            {content.estrutura.map((section, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{section.titulo}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                    {section.oQueVai}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </SectionCard>

        <SectionCard title={ui.sectionLabels.regras} bodyClassName="p-6">
          <Bullets items={content.regras} />
        </SectionCard>

        <SectionCard title={ui.sectionLabels.erros} icon={XCircle} bodyClassName="p-6">
          <Bullets items={content.erros} tone="danger" />
        </SectionCard>

        <SectionCard title={ui.sectionLabels.exemplo} subtitle={content.exemplo.legenda}>
          <div className="mb-5 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-sm leading-relaxed text-foreground">{ui.exampleWarning}</p>
          </div>

          <div className="space-y-5">
            {content.exemplo.blocos.map((bloco, i) => (
              <div key={i} className="border-l-2 border-primary/40 pl-4">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                  {bloco.titulo}
                </p>
                <div className="space-y-1.5">
                  {bloco.corpo.map((linha, j) => (
                    <p key={j} className="text-sm leading-relaxed text-foreground">
                      {linha}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title={ui.sectionLabels.esqueleto} subtitle={ui.skeletonHint}>
          <CopySkeletonButton
            text={content.esqueleto}
            labels={{ copy: ui.copy, copied: ui.copied, failed: ui.copyFailed }}
          />
          <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 text-xs leading-relaxed text-foreground">
            {content.esqueleto}
          </pre>
        </SectionCard>
      </div>

      <Link
        href={`/help/equipes/${profileSlug}`}
        className="group mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
      >
        {ui.seeProfile}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
