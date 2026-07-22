"use client";

import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Users, Search } from "lucide-react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import RegisterOneOnOneButton from "@/components/admin/RegisterOneOnOneButton";
import type { OneOnOneCadenceRow } from "@/lib/actions/team-health";

const OVERDUE_SHOWN = 5;

// Cadence card: shows up to 5 OVERDUE members to act on now (registering one
// refreshes the server → it drops off, next overdue appears, until empty), plus
// a header button opening a modal of ALL members (name-filtered, name-sorted)
// each with their last-1:1 date and a register button.
export default function OneOnOneCard({ rows }: { rows: OneOnOneCadenceRow[] }) {
  const t = useTranslations("admin.health.oneOnOne");
  const locale = useLocale();
  const [query, setQuery] = useState("");

  const fmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }),
    [locale]
  );
  const lastLabel = (r: OneOnOneCadenceRow) =>
    r.lastOneOnOne ? fmt.format(new Date(r.lastOneOnOne)) : t("never");

  const overdue = useMemo(() => rows.filter((r) => r.overdue), [rows]);
  const shown = overdue.slice(0, OVERDUE_SHOWN);

  const allSorted = useMemo(
    () => [...rows].sort((a, b) => a.name.localeCompare(b.name, locale)),
    [rows, locale]
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? allSorted.filter((r) => r.name.toLowerCase().includes(q)) : allSorted;
  }, [allSorted, query]);

  return (
    <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-foreground" />
          <h3 className="text-lg font-bold text-foreground">{t("title")}</h3>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-accent"
            >
              {t("viewAll")}
            </button>
          </DialogTrigger>
          <DialogContent className="max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>{t("allTitle")}</DialogTitle>
              <DialogDescription>{t("allSubtitle")}</DialogDescription>
            </DialogHeader>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("filterPlaceholder")}
                className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-2 text-sm"
              />
            </div>
            <ul className="mt-2 divide-y divide-border overflow-y-auto">
              {filtered.length === 0 ? (
                <li className="py-3 text-sm text-muted-foreground">{t("noMatch")}</li>
              ) : (
                filtered.map((r) => (
                  <li key={r.userId} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <span className="truncate text-sm font-medium text-foreground">{r.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {t("last", { date: lastLabel(r) })}
                        {r.overdue && (
                          <span className="ml-1 font-semibold text-rose-600 dark:text-rose-400">
                            · {t("overdue")}
                          </span>
                        )}
                      </span>
                    </div>
                    <RegisterOneOnOneButton userId={r.userId} name={r.name} />
                  </li>
                ))
              )}
            </ul>
          </DialogContent>
        </Dialog>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">{t("overdueSubtitle")}</p>

      {shown.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">{t("allClear")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {shown.map((r) => (
            <li key={r.userId} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <span className="truncate text-sm font-medium text-foreground">{r.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {r.daysSince === null ? t("never") : t("daysSince", { days: r.daysSince })}
                  <span className="ml-1 font-semibold text-rose-600 dark:text-rose-400">
                    · {t("overdue")}
                  </span>
                </span>
              </div>
              <RegisterOneOnOneButton userId={r.userId} name={r.name} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
