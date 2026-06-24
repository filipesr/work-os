"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  GitBranch,
  GitMerge,
  Maximize2,
  MessageSquareWarning,
  PauseCircle,
  TrendingDown,
  TrendingUp,
  Tv,
  Users,
  X,
} from "lucide-react";
import { SlideShell } from "./SlideShell";
import { SlideCard } from "./SlideCard";
import { StepCard } from "./StepCard";

const SLIDE_KEYS = [
  "cover",
  "premise",
  "problems",
  "solutions",
  "flowIntro",
  "forkJoin",
  "bonus1",
  "bonus2",
  "closer",
] as const;

type SlideKey = (typeof SLIDE_KEYS)[number];

function clampSlide(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(SLIDE_KEYS.length - 1, value));
}

function CoverSlide() {
  const t = useTranslations("taskFlow.slides.cover");
  return (
    <SlideShell
      kicker={t("eyebrow")}
      title={t("title")}
      subtitle={t("subtitle")}
      toneClass="bg-gradient-to-br from-primary/10 via-background to-background"
    >
      <p className="text-sm text-muted-foreground mt-6 animate-pulse">{t("hint")}</p>
    </SlideShell>
  );
}

function PremiseSlide() {
  const t = useTranslations("taskFlow.slides.premise");
  return (
    <SlideShell
      kicker={t("kicker")}
      title={
        <>
          {t("title")}
          <br />
          <span className="text-primary">{t("highlight")}</span>
        </>
      }
    >
      <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
        {t("body")}
      </p>
    </SlideShell>
  );
}

const PROBLEM_ICONS = {
  doing: Eye,
  planned: Calendar,
  assignment: MessageSquareWarning,
  parallel: PauseCircle,
  metrics: TrendingDown,
} as const;

function ProblemsSlide({
  slideKey,
  keys,
}: {
  slideKey: "problems";
  keys: ReadonlyArray<keyof typeof PROBLEM_ICONS>;
}) {
  const t = useTranslations(`taskFlow.slides.${slideKey}`);
  return (
    <SlideShell kicker={t("kicker")} title={t("title")}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {keys.map((key) => (
          <SlideCard
            key={key}
            icon={PROBLEM_ICONS[key]}
            title={t(`cards.${key}.title`)}
            text={t(`cards.${key}.text`)}
            tone="problem"
          />
        ))}
      </div>
    </SlideShell>
  );
}

const SOLUTION_ICONS = {
  doing: Tv,
  planned: Calendar,
  assignment: Users,
  parallel: GitBranch,
  metrics: TrendingUp,
} as const;

function SolutionsSlide({
  slideKey,
  keys,
}: {
  slideKey: "solutions";
  keys: ReadonlyArray<keyof typeof SOLUTION_ICONS>;
}) {
  const t = useTranslations(`taskFlow.slides.${slideKey}`);
  return (
    <SlideShell kicker={t("kicker")} title={t("title")}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {keys.map((key) => (
          <SlideCard
            key={key}
            icon={SOLUTION_ICONS[key]}
            title={t(`cards.${key}.title`)}
            text={t(`cards.${key}.text`)}
            tone="solution"
          />
        ))}
      </div>
    </SlideShell>
  );
}

function FlowIntroSlide() {
  const t = useTranslations("taskFlow.slides.flowIntro");
  const keys = ["1", "2", "3", "4"] as const;
  const accents = { "1": "primary", "2": "primary", "3": "primary", "4": "loop" } as const;
  const icons = { "4": MessageSquareWarning } as const;
  return (
    <SlideShell kicker={t("kicker")} title={t("title")} subtitle={t("subtitle")}>
      <div className="mb-6 inline-flex items-center justify-center mx-auto bg-muted px-4 py-2 rounded-lg text-sm font-mono text-foreground">
        {t("stages")}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {keys.map((key) => (
          <StepCard
            key={key}
            badge={t(`steps.${key}.badge`)}
            title={t(`steps.${key}.title`)}
            actor={t(`steps.${key}.actor`)}
            text={t(`steps.${key}.text`)}
            accent={accents[key]}
            icon={icons[key as "4"]}
          />
        ))}
      </div>
    </SlideShell>
  );
}

function ForkJoinSlide() {
  const t = useTranslations("taskFlow.slides.forkJoin");
  const keys = ["5", "6", "7"] as const;
  const accents = { "5": "primary", "6": "fork", "7": "join" } as const;
  const icons = { "6": GitBranch, "7": GitMerge } as const;
  return (
    <SlideShell kicker={t("kicker")} title={t("title")} subtitle={t("subtitle")}>
      <div className="space-y-4">
        {keys.map((key) => (
          <StepCard
            key={key}
            badge={t(`steps.${key}.badge`)}
            title={t(`steps.${key}.title`)}
            actor={t(`steps.${key}.actor`)}
            text={t(`steps.${key}.text`)}
            accent={accents[key]}
            icon={icons[key as "6" | "7"]}
          />
        ))}
      </div>
    </SlideShell>
  );
}

function BonusSlide({
  slideKey,
  items,
}: {
  slideKey: "bonus1" | "bonus2";
  items: ReadonlyArray<{ key: string; href: string; icon: typeof Calendar }>;
}) {
  const t = useTranslations(`taskFlow.slides.${slideKey}`);
  return (
    <SlideShell kicker={t("kicker")} title={t("title")} subtitle={t("subtitle")}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {items.map(({ key, href, icon: Icon }) => (
          <Link
            key={key}
            href={href}
            className="group bg-card border-2 border-amber-500/40 rounded-2xl p-6 text-left flex flex-col hover:border-amber-500/70 hover:shadow-xl transition-all"
          >
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/10 mb-4">
              <Icon className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2 leading-tight">
              {t(`cards.${key}.title`)}
            </h3>
            <p className="text-sm md:text-base text-muted-foreground leading-relaxed flex-1">
              {t(`cards.${key}.text`)}
            </p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary group-hover:gap-2 transition-all">
              {t(`cards.${key}.cta`)}
              <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        ))}
      </div>
    </SlideShell>
  );
}

function CloserSlide() {
  const t = useTranslations("taskFlow.slides.closer");
  return (
    <SlideShell
      kicker={t("kicker")}
      title={
        <>
          {t("title")}
          <br />
          <span className="text-primary">{t("highlight")}</span>
        </>
      }
      toneClass="bg-gradient-to-br from-background via-background to-primary/10"
    >
      <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
        {t("body")}
      </p>
      <Link
        href="/"
        className="mt-10 inline-flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 shadow-md hover:shadow-lg transition-all"
      >
        {t("cta")}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </SlideShell>
  );
}

function renderSlide(key: SlideKey) {
  switch (key) {
    case "cover":
      return <CoverSlide />;
    case "premise":
      return <PremiseSlide />;
    case "problems":
      return (
        <ProblemsSlide
          slideKey="problems"
          keys={["doing", "planned", "assignment", "parallel", "metrics"]}
        />
      );
    case "solutions":
      return (
        <SolutionsSlide
          slideKey="solutions"
          keys={["doing", "planned", "assignment", "parallel", "metrics"]}
        />
      );
    case "flowIntro":
      return <FlowIntroSlide />;
    case "forkJoin":
      return <ForkJoinSlide />;
    case "bonus1":
      return (
        <BonusSlide
          slideKey="bonus1"
          items={[
            { key: "calendar", href: "/reports/calendar", icon: Calendar },
            { key: "productivity", href: "/reports/team-productivity", icon: TrendingUp },
          ]}
        />
      );
    case "bonus2":
      return (
        <BonusSlide
          slideKey="bonus2"
          items={[
            { key: "live", href: "/reports/live-activity", icon: Tv },
            { key: "timesheet", href: "/reports/productivity", icon: FileText },
          ]}
        />
      );
    case "closer":
      return <CloserSlide />;
  }
}

export function Slideshow() {
  const tUi = useTranslations("taskFlow.ui");
  const router = useRouter();
  const searchParams = useSearchParams();
  const slideParam = searchParams.get("slide");
  const requestedIndex = slideParam ? clampSlide(Number.parseInt(slideParam, 10) - 1) : 0;
  const [index, setIndex] = useState<number>(requestedIndex);

  useEffect(() => {
    setIndex(requestedIndex);
  }, [requestedIndex]);

  const total = SLIDE_KEYS.length;
  const currentKey = SLIDE_KEYS[index];

  const navigateTo = useCallback(
    (next: number) => {
      const clamped = clampSlide(next);
      setIndex(clamped);
      const params = new URLSearchParams(searchParams.toString());
      if (clamped === 0) params.delete("slide");
      else params.set("slide", String(clamped + 1));
      const query = params.toString();
      router.replace(query ? `?${query}` : `?`, { scroll: false });
    },
    [router, searchParams]
  );

  const goPrev = useCallback(() => navigateTo(index - 1), [navigateTo, index]);
  const goNext = useCallback(() => navigateTo(index + 1), [navigateTo, index]);

  const toggleFullscreen = useCallback(() => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      switch (e.key) {
        case "ArrowRight":
        case "PageDown":
        case " ":
          e.preventDefault();
          goNext();
          break;
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          goPrev();
          break;
        case "Home":
          e.preventDefault();
          navigateTo(0);
          break;
        case "End":
          e.preventDefault();
          navigateTo(total - 1);
          break;
        case "f":
        case "F":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "Escape":
          if (!document.fullscreenElement) {
            router.push("/");
          }
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev, navigateTo, router, toggleFullscreen, total]);

  const progress = useMemo(() => ((index + 1) / total) * 100, [index, total]);
  const isFirst = index === 0;
  const isLast = index === total - 1;

  const iconBtn =
    "inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-border bg-card text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="fixed inset-0 bg-background text-foreground flex flex-col overflow-hidden">
      {/* Progress bar */}
      <div className="h-1 w-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
          aria-hidden="true"
        />
      </div>

      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border/40">
        <div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground tabular-nums">
          {tUi("slideOf", { current: index + 1, total })}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Tela cheia"
            title="Tela cheia (F)"
            className={iconBtn}
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <Link href="/" aria-label={tUi("exit")} title={tUi("exit")} className={iconBtn}>
            <X className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {/* Slide body */}
      <main className="flex-1 min-h-0 overflow-y-auto" aria-live="polite">
        <div key={currentKey} className="h-full animate-in fade-in duration-200">
          {renderSlide(currentKey)}
        </div>
      </main>

      {/* Bottom nav */}
      <footer className="flex items-center justify-between px-6 py-4 border-t border-border/40 gap-4">
        <button
          type="button"
          onClick={goPrev}
          disabled={isFirst}
          aria-label={tUi("previous")}
          className={iconBtn}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="hidden md:flex items-center gap-1.5 flex-1 justify-center max-w-md">
          {SLIDE_KEYS.map((key, i) => (
            <button
              key={key}
              type="button"
              onClick={() => navigateTo(i)}
              aria-label={`${tUi("slideOf", { current: i + 1, total })}`}
              aria-current={i === index ? "true" : undefined}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-8 bg-primary" : "w-2 bg-border hover:bg-muted-foreground/50"
              }`}
            />
          ))}
        </div>

        <div className="hidden md:block text-[10px] text-muted-foreground tabular-nums">
          {tUi("shortcut")}
        </div>

        <button
          type="button"
          onClick={goNext}
          disabled={isLast}
          aria-label={tUi("next")}
          className={iconBtn}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </footer>
    </div>
  );
}
