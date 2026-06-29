"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

const ROLES = ["ADMIN", "MANAGER", "SUPERVISOR", "MEMBER", "CLIENT"] as const;

/**
 * Minimalist user filter: a button with an active-count badge that opens a modal
 * to filter by search (name/email), role and team. Filters live in the URL query
 * (server reads them), so navigation/pagination/sorting compose naturally.
 */
export function UserFilters({ teams }: { teams: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations("admin.users.filters");
  const tRoles = useTranslations("admin.users.roles");

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [role, setRole] = useState(searchParams.get("role") ?? "");
  const [team, setTeam] = useState(searchParams.get("team") ?? "");

  const activeCount = ["q", "role", "team"].filter((k) => searchParams.get(k)).length;

  const push = (mutate: (sp: URLSearchParams) => void) => {
    const sp = new URLSearchParams(searchParams.toString());
    mutate(sp);
    sp.delete("page"); // any filter change resets to the first page
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    setOpen(false);
  };

  const apply = () =>
    push((sp) => {
      const set = (k: string, v: string) => (v ? sp.set(k, v) : sp.delete(k));
      set("q", q.trim());
      set("role", role);
      set("team", team);
    });

  const clear = () => {
    setQ("");
    setRole("");
    setTeam("");
    push((sp) => {
      sp.delete("q");
      sp.delete("role");
      sp.delete("team");
    });
  };

  const fieldClass =
    "h-11 w-full rounded-lg border-2 border-input-border bg-input px-4 text-base font-medium text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 outline-none transition-all";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Filter className="h-4 w-4" />
          {t("button")}
          {activeCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1 text-xs font-bold rounded-full bg-primary text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">{t("search")}</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && apply()}
              placeholder={t("searchPlaceholder")}
              className={fieldClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              {t("roleLabel")}
            </label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className={fieldClass}>
              <option value="">{t("all")}</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {tRoles(r.toLowerCase())}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              {t("teamLabel")}
            </label>
            <select value={team} onChange={(e) => setTeam(e.target.value)} className={fieldClass}>
              <option value="">{t("all")}</option>
              {teams.map((tm) => (
                <option key={tm.id} value={tm.id}>
                  {tm.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={clear}>
            {t("clear")}
          </Button>
          <Button onClick={apply}>{t("apply")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
