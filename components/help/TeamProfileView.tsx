import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ExternalLink,
  Info,
  Landmark,
  Paperclip,
} from "lucide-react";
import { SectionCard } from "@/components/ui/SectionCard";
import {
  CADENCES,
  TOOL_GROUPS,
  type BrazilianReference,
  type ReportEntry,
  type SourceEntry,
  type TeamProfileContent,
  type TeamProfileUi,
  type ToolEntry,
} from "@/lib/team-profiles/content";
import type { TeamProfile } from "@/lib/team-profiles/catalog";

/**
 * Renderiza UM descritivo de equipe. Mesma anatomia do `FundamentoView`
 * (back-link, header, um SectionCard por seção, painel de fontes ao fim), com
 * tratamento próprio para os dois blocos que não são lista simples: obrigações
 * (quatro cadências) e relatórios (artefatos com destino e sensibilidade).
 */

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li
          key={i}
          className="relative pl-5 text-sm leading-relaxed text-foreground before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-primary/60"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function LabeledList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <Bullets items={items} />
    </div>
  );
}

function ToolItem({ tool }: { tool: ToolEntry }) {
  return (
    <li className="flex flex-col gap-0.5 border-l-2 border-border pl-3">
      {tool.url ? (
        <a
          href={tool.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          {tool.nome}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      ) : (
        <span className="text-sm font-semibold text-foreground">{tool.nome}</span>
      )}
      <span className="text-sm leading-relaxed text-muted-foreground">{tool.para}</span>
    </li>
  );
}

/**
 * Fonte com endereço vira link; sem endereço, fica texto. Rota interna
 * (começa com "/") navega na mesma aba — é conteúdo do próprio produto.
 */
function Source({ source }: { source: SourceEntry }) {
  if (!source.url) {
    return <li className="text-sm leading-relaxed text-muted-foreground">{source.texto}</li>;
  }

  if (source.url.startsWith("/")) {
    return (
      <li className="text-sm leading-relaxed">
        <Link href={source.url} className="text-primary hover:underline">
          {source.texto}
        </Link>
      </li>
    );
  }

  return (
    <li className="text-sm leading-relaxed">
      <a
        href={source.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-baseline gap-1.5 text-primary hover:underline"
      >
        {source.texto}
        <ExternalLink className="h-3.5 w-3.5 shrink-0 self-center" aria-hidden="true" />
      </a>
    </li>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-md bg-muted px-2 py-1 text-xs">
      <span className="font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </span>
  );
}

function ReportCard({ report, ui }: { report: ReportEntry; ui: TeamProfileUi }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-sm font-semibold text-foreground">{report.nome}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{report.conteudo}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Chip label={ui.reportFields.quando} value={report.quando} />
        <Chip label={ui.reportFields.destino} value={ui.destino[report.destino]} />
        <Chip label={ui.reportFields.sensibilidade} value={ui.sensitivity[report.sensibilidade]} />
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {report.ondeEntregar}
      </p>
      {report.modelo ? (
        <Link
          href={`/help/relatorios/${report.modelo}`}
          className="group mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
        >
          {ui.openReportModel}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">{ui.noReportModel}</p>
      )}
    </div>
  );
}

/**
 * Referência ocupacional brasileira: o código da CBO, o quanto ele de fato
 * corresponde à função, e a entidade setorial quando existe.
 *
 * A ressalva de jurisdição aparece em toda função, não só nas duvidosas: a
 * operação não está sob registro trabalhista brasileiro, então a CBO é
 * vocabulário, não enquadramento. E os códigos vieram de espelhos da tabela —
 * o site oficial não abre ficha por link —, o que também precisa estar dito.
 */
function BrazilianRef({
  reference,
  ui,
}: {
  // Nunca chamar esta prop de `ref`: é reservada e não atravessa a fronteira de
  // Server Component. Ver __tests__/components/reserved-ref-prop.test.ts.
  reference: BrazilianReference;
  ui: TeamProfileUi;
}) {
  const copy = ui.brazilianRef;
  const missing = reference.cbo.aderencia === "inexistente";

  return (
    <SectionCard title={copy.title} icon={Landmark} bodyClassName="space-y-4 p-6">
      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <p className="text-xs leading-relaxed text-muted-foreground">{copy.note}</p>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {copy.cboLabel}
        </span>
        <span
          className={`font-mono text-base font-bold ${missing ? "text-muted-foreground" : "text-foreground"}`}
        >
          {reference.cbo.codigo}
        </span>
        <span className="text-sm text-foreground">{reference.cbo.titulo}</span>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {copy.familyLabel}
          </dt>
          <dd className="mt-0.5 text-sm text-foreground">{reference.cbo.familia}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {copy.adherenceLabel}
          </dt>
          <dd
            className={`mt-0.5 text-sm ${missing ? "font-semibold text-warning" : "text-foreground"}`}
          >
            {copy.adherence[reference.cbo.aderencia]}
          </dd>
        </div>
      </dl>

      <p className="text-sm leading-relaxed text-muted-foreground">{reference.observacao}</p>

      <div>
        <a
          href="https://cbo.mte.gov.br/cbosite/pages/home.jsf"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          {copy.officialSearch}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
        <p className="mt-1 text-xs text-muted-foreground">{copy.officialSearchHint}</p>
      </div>

      <div className="border-t border-border pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {copy.sectorTitle}
        </p>
        {reference.setorial.length > 0 ? (
          <ul className="space-y-3">
            {reference.setorial.map((entry, i) => (
              <li key={i} className="border-l-2 border-border pl-3">
                <p className="text-sm font-semibold text-foreground">{entry.entidade}</p>
                {entry.url ? (
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-baseline gap-1.5 text-sm text-primary hover:underline"
                  >
                    {entry.documento}
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 self-center" aria-hidden="true" />
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground">{entry.documento}</p>
                )}
                {entry.ressalva ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{entry.ressalva}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">{copy.sectorEmpty}</p>
        )}
      </div>
    </SectionCard>
  );
}

export function TeamProfileView({
  profile,
  content,
  ui,
}: {
  profile: TeamProfile;
  content: TeamProfileContent;
  ui: TeamProfileUi;
}) {
  const Icon = profile.icon;

  return (
    <div className="container mx-auto max-w-3xl p-8">
      <Link
        href="/help/equipes"
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
            <h1 className="text-3xl font-bold text-foreground">{content.title}</h1>
            <p className="mt-2 text-lg leading-relaxed text-muted-foreground">{content.missao}</p>
          </div>
        </div>

        <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 border-t border-border pt-4">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {ui.coveredTeams}
            </dt>
            <dd className="mt-1 text-sm font-medium text-foreground">
              {profile.teamNames.join(" · ")}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {ui.occupationRef}
            </dt>
            <dd className="mt-1 text-sm font-medium text-foreground">{content.occupationRef}</dd>
          </div>
        </dl>
      </header>

      <div className="space-y-6">
        <SectionCard title={ui.sectionLabels.entregaveis} bodyClassName="p-6">
          <Bullets items={content.entregaveis} />
        </SectionCard>

        <SectionCard
          title={ui.sectionLabels.interfaces}
          bodyClassName="grid gap-6 p-6 sm:grid-cols-2"
        >
          <LabeledList label={ui.interfaceFields.recebeDe} items={content.interfaces.recebeDe} />
          <LabeledList
            label={ui.interfaceFields.entregaPara}
            items={content.interfaces.entregaPara}
          />
        </SectionCard>

        <SectionCard title={ui.sectionLabels.ferramentas} bodyClassName="space-y-5 p-6">
          {TOOL_GROUPS.map((group) => {
            const tools = content.ferramentas[group];
            if (!tools?.length) return null;
            return (
              <div key={group}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {ui.toolGroups[group]}
                </p>
                <ul className="space-y-3">
                  {tools.map((tool, i) => (
                    <ToolItem key={i} tool={tool} />
                  ))}
                </ul>
              </div>
            );
          })}
        </SectionCard>

        <SectionCard title={ui.sectionLabels.obrigacoes} bodyClassName="space-y-5 p-6">
          {CADENCES.map((cadence) => {
            const duties = content.obrigacoes[cadence];
            if (!duties?.length) return null;
            return (
              <div key={cadence} className="border-l-2 border-primary/40 pl-4">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                  {ui.cadence[cadence]}
                </p>
                <Bullets items={duties} />
              </div>
            );
          })}
        </SectionCard>

        <SectionCard title={ui.sectionLabels.relatorios} bodyClassName="space-y-3 p-6">
          {content.relatorios.map((report, i) => (
            <ReportCard key={i} report={report} ui={ui} />
          ))}
        </SectionCard>

        <SectionCard
          title={ui.sectionLabels.competencias}
          bodyClassName="grid gap-6 p-6 sm:grid-cols-2"
        >
          <LabeledList
            label={ui.competenciaFields.tecnicas}
            items={content.competencias.tecnicas}
          />
          <LabeledList
            label={ui.competenciaFields.comportamentais}
            items={content.competencias.comportamentais}
          />
        </SectionCard>

        <SectionCard title={ui.sectionLabels.contratacao} bodyClassName="space-y-5 p-6">
          <LabeledList
            label={ui.contratacaoFields.requisitos}
            items={content.contratacao.requisitos}
          />
          <LabeledList
            label={ui.contratacaoFields.diferenciais}
            items={content.contratacao.diferenciais}
          />
          <LabeledList
            label={ui.contratacaoFields.perguntas}
            items={content.contratacao.perguntas}
          />
        </SectionCard>

        {/* A salvaguarda vem ANTES dos sinais, e vem em toda função: um descritivo
            com seção de avaliação é o artefato que mais tende a virar nota (P1/P2). */}
        <SectionCard title={ui.sectionLabels.avaliacao} bodyClassName="space-y-5 p-6">
          <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">{ui.avaliacaoCallout.label}.</span>{" "}
              {ui.avaliacaoCallout.text}
            </p>
          </div>

          <LabeledList
            label={ui.avaliacaoFields.oQueOlhamos}
            items={content.avaliacao.oQueOlhamos}
          />
          <LabeledList label={ui.avaliacaoFields.comoLemos} items={content.avaliacao.comoLemos} />

          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-destructive">
              {ui.avaliacaoFields.oQueNuncaFazemos}
            </p>
            <ul className="space-y-1.5">
              {content.avaliacao.oQueNuncaFazemos.map((item, i) => (
                <li
                  key={i}
                  className="relative pl-5 text-sm leading-relaxed text-foreground before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-destructive/60"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </SectionCard>

        <BrazilianRef reference={content.referenciaBrasileira} ui={ui} />
      </div>

      <div className="mt-10 rounded-xl border-2 border-primary/30 bg-primary/5 px-6 py-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
          <BookOpen className="h-4 w-4 text-primary" />
          {ui.sectionLabels.fontes}
        </div>
        <ul className="space-y-1.5">
          {content.fontes.map((source, i) => (
            <Source key={i} source={source} />
          ))}
        </ul>
      </div>

      <Link
        href="/help/equipes"
        className="group mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
      >
        {ui.backToIndex}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
