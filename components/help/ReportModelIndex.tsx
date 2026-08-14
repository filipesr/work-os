import Link from "next/link";
import { ArrowLeft, ArrowRight, FileQuestion, Info } from "lucide-react";
import { TEAM_PROFILES } from "@/lib/team-profiles/catalog";
import {
  REPORT_MODELS,
  REPORT_MODEL_DESTINATIONS,
  getReportModelsForProfile,
} from "@/lib/team-profiles/reports";
import type { ReportModelMessages, TeamProfileMessages } from "@/lib/team-profiles/content";

/**
 * Índice dos modelos, agrupado por FUNÇÃO.
 *
 * O agrupamento era por destino enquanto havia dez modelos; com trinta e quatro,
 * "vão para o cliente" virava uma parede de vinte cartões. Quem procura um
 * modelo sabe a própria função antes de saber para quem o artefato vai — então
 * a função é o eixo, e o destino vira etiqueta no cartão, explicada na legenda.
 *
 * A faixa de pendentes é derivada do conteúdo: um relatório novo num descritivo,
 * sem `modelo`, aparece aqui sozinho.
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

      <div className="mb-8 flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 px-5 py-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">{index.clientNote.label}.</span>{" "}
          {index.clientNote.text}
        </p>
      </div>

      {/* Legenda dos destinos: a etiqueta de cada cartão diz para quem o artefato
          vai, e é aqui que ela ganha significado. */}
      <dl className="mb-10 space-y-3 rounded-xl border border-border bg-card px-5 py-4">
        {REPORT_MODEL_DESTINATIONS.map((destino) => (
          <div key={destino} className="flex flex-col gap-1 sm:flex-row sm:gap-3">
            <dt className="flex-none sm:w-44">
              <span className="inline-flex rounded-md bg-muted px-2 py-1 text-xs font-semibold uppercase tracking-wide text-foreground">
                {profileMessages.ui.destino[destino]}
              </span>
            </dt>
            <dd className="min-w-0 text-sm leading-relaxed text-muted-foreground">
              {index.groups[destino].subtitle}
            </dd>
          </div>
        ))}
      </dl>

      <div className="space-y-10">
        {TEAM_PROFILES.map((profile) => {
          const group = getReportModelsForProfile(profile.slug);
          if (!group.length) return null;
          const profileTitle = profileMessages.profiles[profile.slug]?.title ?? profile.slug;
          const ProfileIcon = profile.icon;

          return (
            <section key={profile.slug}>
              <div className="mb-4 flex items-center gap-2">
                <ProfileIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {profileTitle}
                </h2>
                <Link
                  href={`/help/equipes/${profile.slug}`}
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  {ui.seeProfile}
                </Link>
              </div>

              <div className="space-y-3">
                {group.map((model) => {
                  const content = models[model.slug];
                  if (!content) return null;
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
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-bold text-foreground">{content.titulo}</h3>
                          <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {profileMessages.ui.destino[model.destino]}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {content.resumo}
                        </p>
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
