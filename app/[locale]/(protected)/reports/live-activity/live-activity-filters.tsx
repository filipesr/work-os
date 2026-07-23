"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SlidersHorizontal } from "lucide-react";

interface LiveActivityFiltersProps {
  teamNames: string[];
  showOnline: boolean;
  showOffline: boolean;
  hiddenTeams: Set<string>;
  onToggleOnline: () => void;
  onToggleOffline: () => void;
  onToggleTeam: (name: string) => void;
  onSelectAllTeams: () => void;
  onClearTeams: () => void;
}

export default function LiveActivityFilters({
  teamNames,
  showOnline,
  showOffline,
  hiddenTeams,
  onToggleOnline,
  onToggleOffline,
  onToggleTeam,
  onSelectAllTeams,
  onClearTeams,
}: LiveActivityFiltersProps) {
  const t = useTranslations("reports.liveActivity");
  const [isOpen, setIsOpen] = useState(false);

  const activeCount = (showOnline ? 0 : 1) + (showOffline ? 0 : 1) + hiddenTeams.size;

  const checkbox = (checked: boolean, label: string, onChange: () => void) => (
    <label
      key={label}
      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/60"
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
      />
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="relative inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
      >
        <SlidersHorizontal className="h-4 w-4" />
        {t("filters.button")}
        {activeCount > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
            {activeCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            className="relative mt-12 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg"
          >
            <h3 className="text-lg font-bold text-foreground">{t("filters.title")}</h3>

            {/* Status */}
            <div className="mt-4">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("filters.status")}
              </p>
              {checkbox(showOnline, t("online"), onToggleOnline)}
              {checkbox(showOffline, t("offline"), onToggleOffline)}
            </div>

            {/* Teams */}
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {t("filters.teams")}
                </p>
                <div className="flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={onSelectAllTeams}
                    className="font-medium text-primary hover:underline"
                  >
                    {t("filters.selectAll")}
                  </button>
                  <button
                    type="button"
                    onClick={onClearTeams}
                    className="font-medium text-muted-foreground hover:underline"
                  >
                    {t("filters.clear")}
                  </button>
                </div>
              </div>
              <div className="max-h-[40vh] space-y-0.5 overflow-y-auto rounded-lg border border-border p-2">
                {teamNames.map((name) =>
                  checkbox(!hiddenTeams.has(name), name, () => onToggleTeam(name))
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground hover:bg-primary/90 shadow-md transition-colors"
              >
                {t("filters.close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
