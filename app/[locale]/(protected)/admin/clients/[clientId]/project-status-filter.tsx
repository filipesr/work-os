"use client";

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

// Chips Pendentes / Concluídos (+ Todos) para filtrar a lista de projetos do
// cliente por estado de conclusão derivado. Espelha o padrão de TaskFilters
// (useRouter/usePathname/useSearchParams + setParam).
const OPTIONS = [
  { value: null, labelKey: "all" },
  { value: "pending", labelKey: "pending" },
  { value: "completed", labelKey: "completed" },
] as const;

export function ProjectStatusFilter() {
  const t = useTranslations("admin.projectStatusFilter");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const current = searchParams.get("status") ?? "";

  const setParam = useCallback(
    (value: string | null) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (value) sp.set("status", value);
      else sp.delete("status");
      const qs = sp.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      {OPTIONS.map((opt) => {
        const active = current === (opt.value ?? "");
        return (
          <button
            key={opt.labelKey}
            type="button"
            onClick={() => setParam(opt.value)}
            aria-pressed={active}
            className={`px-2.5 py-1 text-sm rounded-full transition-colors ${
              active
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t(opt.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
