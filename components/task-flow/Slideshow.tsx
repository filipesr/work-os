"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  FileText,
  Maximize2,
  TrendingUp,
  Tv,
  X,
} from "lucide-react";
import {
  CoverSlide,
  PremiseSlide,
  ProblemsSlide,
  SolutionsSlide,
  FlowIntroSlide,
  ForkJoinSlide,
  BonusSlide,
  CloserSlide,
} from "./slides";

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
            { key: "calendar", href: "/planning/calendar", icon: Calendar },
            { key: "productivity", href: "/reports/performance", icon: TrendingUp },
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
    "inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

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
