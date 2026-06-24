import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import { HelpFigure } from "./HelpFigure";

interface Callout {
  label: string;
  text: string;
}

interface Step {
  n: string;
  title: string;
  body?: string[];
  bullets?: string[];
  callout?: Callout;
  image?: string;
  caption?: string;
}

interface Section {
  title: string;
  intro?: string;
  steps: Step[];
}

interface Guide {
  badge: string;
  title: string;
  intro: string;
  route: string;
  sections: Section[];
  closing?: string;
}

interface GuideUi {
  backToHelp: string;
  routeBadge: string;
  figurePlaceholder: string;
}

export function GuideView({ guide, ui }: { guide: Guide; ui: GuideUi }) {
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
        <div className="flex items-center gap-3 mb-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground text-base font-bold">
            {guide.badge}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-border bg-muted px-3 py-1 text-xs font-mono text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {ui.routeBadge}: {guide.route}
          </span>
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-3">{guide.title}</h1>
        <p className="text-lg text-muted-foreground leading-relaxed">{guide.intro}</p>
      </header>

      <div className="space-y-12">
        {guide.sections.map((section, si) => (
          <section key={si}>
            <h2 className="text-xl font-semibold text-foreground border-b-2 border-border pb-2 mb-2">
              {section.title}
            </h2>
            {section.intro ? (
              <p className="text-muted-foreground leading-relaxed mb-5">{section.intro}</p>
            ) : (
              <div className="mb-5" />
            )}

            <ol className="space-y-8">
              {section.steps.map((step, sti) => (
                <li key={sti} className="flex gap-4">
                  <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full border-2 border-primary/40 bg-primary/10 text-sm font-bold text-primary">
                    {step.n}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-foreground mb-1.5">{step.title}</h3>
                    {step.body?.map((paragraph, pi) => (
                      <p key={pi} className="text-muted-foreground leading-relaxed mb-2">
                        {paragraph}
                      </p>
                    ))}
                    {step.bullets ? (
                      <ul className="my-2 space-y-1.5">
                        {step.bullets.map((bullet, bi) => (
                          <li
                            key={bi}
                            className="relative pl-5 text-muted-foreground leading-relaxed before:absolute before:left-0 before:top-2.5 before:h-1.5 before:w-1.5 before:rounded-full before:bg-primary/60"
                          >
                            {bullet}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {step.callout ? (
                      <div className="my-3 rounded-lg border-l-4 border-primary bg-primary/5 px-4 py-3">
                        <p className="text-sm leading-relaxed text-foreground">
                          <span className="font-semibold">{step.callout.label}:</span>{" "}
                          <span className="text-muted-foreground">{step.callout.text}</span>
                        </p>
                      </div>
                    ) : null}
                    {step.image || step.caption ? (
                      <HelpFigure
                        image={step.image}
                        caption={step.caption}
                        placeholder={ui.figurePlaceholder}
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      {guide.closing ? (
        <div className="mt-12 rounded-xl border-2 border-primary/30 bg-primary/5 px-6 py-5">
          <p className="text-base leading-relaxed text-foreground">{guide.closing}</p>
        </div>
      ) : null}
    </div>
  );
}
