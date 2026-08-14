import Link from "next/link";
import { ArrowLeft, ArrowRight, FileQuestion, Info } from "lucide-react";
import {
  TEAM_PROFILE_FAMILIES,
  TEAM_PROFILES,
  UNDOCUMENTED_TEAM_NAMES,
} from "@/lib/team-profiles/catalog";
import type { TeamProfileMessages } from "@/lib/team-profiles/content";

/**
 * Índice das funções, agrupado por família. A faixa final lista as equipes que
 * existem na empresa e ainda NÃO têm descritivo — a ausência fica visível de
 * propósito: função invisível é função sem expectativa escrita.
 */
export function TeamProfileIndex({ messages }: { messages: TeamProfileMessages }) {
  const { ui, index, profiles } = messages;

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
          <span className="font-semibold text-foreground">{index.hrNote.label}.</span>{" "}
          {index.hrNote.text}
        </p>
      </div>

      <div className="space-y-10">
        {TEAM_PROFILE_FAMILIES.map((family) => {
          const members = TEAM_PROFILES.filter((p) => p.family === family);
          if (!members.length) return null;
          const familyCopy = index.families[family];

          return (
            <section key={family}>
              <div className="mb-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {familyCopy?.title ?? family}
                </h2>
                {familyCopy?.subtitle ? (
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {familyCopy.subtitle}
                  </p>
                ) : null}
              </div>

              <div className="space-y-3">
                {members.map((profile) => {
                  const content = profiles[profile.slug];
                  if (!content) return null;
                  const Icon = profile.icon;

                  return (
                    <Link
                      key={profile.slug}
                      href={`/help/equipes/${profile.slug}`}
                      className="group flex items-center gap-4 rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/60 hover:shadow-md"
                    >
                      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-bold text-foreground">{content.title}</h3>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {content.summary}
                        </p>
                      </div>
                      <span className="hidden flex-none items-center gap-1.5 text-sm font-semibold text-primary transition-all group-hover:gap-2.5 sm:inline-flex">
                        {ui.openProfile}
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}

        <section>
          <div className="mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {index.undocumented.title}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {index.undocumented.subtitle}
            </p>
          </div>

          <ul className="flex flex-wrap gap-2">
            {UNDOCUMENTED_TEAM_NAMES.map((name) => (
              <li
                key={name}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
              >
                <FileQuestion className="h-4 w-4 shrink-0" aria-hidden="true" />
                {name}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
