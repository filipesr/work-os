import Link from "next/link";
import { ArrowLeft, ArrowRight, FileQuestion, Info } from "lucide-react";
import { TEAM_PROFILES } from "@/lib/team-profiles/catalog";
import {
  REPORT_MODELS,
  REPORT_MODEL_DESTINATIONS,
  getReportModelsByDestination,
} from "@/lib/team-profiles/reports";
import type { ReportModelMessages, TeamProfileMessages } from "@/lib/team-profiles/content";

/**
 * Índice dos modelos, agrupado por destino — o que vai para o cliente primeiro,
 * porque é o que mais custa quando sai errado.
 *
 * A faixa final lista os artefatos que os descritivos declaram e que ainda não
 * têm anatomia escrita. Ela é derivada do conteúdo, não mantida à mão: um
 * relatório novo num descritivo aparece aqui como pendente sozinho.
 */
export function ReportModelIndex({
  messages,
  profileMessages,
}: {
  messages: ReportModelMessages;
  profileMessages: TeamProfileMessages;
}) {
  const { ui, index, models } = messages;

  const modeled = new Set(REPORT_MODELS.map((m) => m.slug));
  const pending = TEAM_PROFILES.flatMap((profile) => {
    const content = profileMessages.profiles[profile.slug];
    if (!content) return [];
    return content.relatorios
      .filter((report) => !report.modelo || !modeled.has(report.modelo))
      .map((report) => ({ nome: report.nome, profile, profileTitle: content.title }));
  });

  return (
    <div className="container mx-auto max-w-3xl p-8">
      <Link
        href="/help"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {ui.backToHelp}
      </Link>

      <header className="mb-8 mt-6">
        <h1 className="mb-3 text-3xl font-bold text-foreground">{index.title}</h1>
        <p className="text-lg leading-relaxed text-muted-foreground">{index.intro}</p>
      </header>

      <div className="mb-10 flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 px-5 py-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">{index.clientNote.label}.</span>{" "}
          {index.clientNote.text}
        </p>
      </div>

      <div className="space-y-10">
        {REPORT_MODEL_DESTINATIONS.map((destino) => {
          const group = getReportModelsByDestination(destino);
          if (!group.length) return null;
          const groupCopy = index.groups[destino];

          return (
            <section key={destino}>
              <div className="mb-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {groupCopy.title}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {groupCopy.subtitle}
                </p>
              </div>

              <div className="space-y-3">
                {group.map((model) => {
                  const content = models[model.slug];
                  if (!content) return null;
                  const profileTitle = profileMessages.profiles[model.profileSlug]?.title;
                  const Icon = model.icon;

                  return (
                    <Link
                      key={model.slug}
                      href={`/help/relatorios/${model.slug}`}
                      className="group flex items-center gap-4 rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/60 hover:shadow-md"
                    >
                      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-bold text-foreground">{content.titulo}</h3>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {content.resumo}
                        </p>
                        {profileTitle ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {ui.producedBy} {profileTitle}
                          </p>
                        ) : null}
                      </div>
                      <span className="hidden flex-none items-center gap-1.5 text-sm font-semibold text-primary transition-all group-hover:gap-2.5 sm:inline-flex">
                        {ui.openModel}
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}

        {pending.length > 0 ? (
          <section>
            <div className="mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {index.pending.title}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {index.pending.subtitle}
              </p>
            </div>

            <ul className="space-y-2">
              {pending.map(({ nome, profile, profileTitle }) => (
                <li
                  key={`${profile.slug}-${nome}`}
                  className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-sm"
                >
                  <FileQuestion
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 text-foreground">{nome}</span>
                  <Link
                    href={`/help/equipes/${profile.slug}`}
                    className="flex-none text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {profileTitle}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
