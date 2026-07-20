"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface UseUrlFiltersOptions {
  /** Parâmetro resetado quando qualquer outro filtro muda (padrão: "page"). */
  resetKey?: string;
  /** Se deve rolar ao topo ao navegar (padrão: false). */
  scroll?: boolean;
  /**
   * Usa `router.replace` em vez de `router.push` (não adiciona entrada no
   * histórico do navegador). Para filtros que não devem "empilhar" no back.
   */
  replace?: boolean;
}

/**
 * Plumbing compartilhado de filtros via query-string — antes reimplementado
 * em TaskFilters, UserFilters, CalendarFiltersBar, WeekNavigator, etc.
 *
 * - setParam(key, value): define ou remove (value falsy => remove) e reseta
 *   o `resetKey` (paginação) automaticamente.
 * - setParams({...}): várias mudanças de uma vez.
 * - clearParams(keys?): remove os `keys` informados (ou todos).
 */
export function useUrlFilters(options?: UseUrlFiltersOptions) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const resetKey = options?.resetKey ?? "page";
  const scroll = options?.scroll ?? false;
  const replace = options?.replace ?? false;

  const commit = useCallback(
    (sp: URLSearchParams) => {
      const qs = sp.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (replace) router.replace(url, { scroll });
      else router.push(url, { scroll });
    },
    [router, pathname, scroll, replace]
  );

  const setParam = useCallback(
    (key: string, value: string | null | undefined) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (value) sp.set(key, value);
      else sp.delete(key);
      if (key !== resetKey) sp.delete(resetKey);
      commit(sp);
    },
    [searchParams, resetKey, commit]
  );

  const setParams = useCallback(
    (values: Record<string, string | null | undefined>) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(values)) {
        if (value) sp.set(key, value);
        else sp.delete(key);
      }
      sp.delete(resetKey);
      commit(sp);
    },
    [searchParams, resetKey, commit]
  );

  const clearParams = useCallback(
    (keys?: string[]) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (keys) keys.forEach((key) => sp.delete(key));
      else Array.from(sp.keys()).forEach((key) => sp.delete(key));
      commit(sp);
    },
    [searchParams, commit]
  );

  return { searchParams, setParam, setParams, clearParams };
}
