"use client";

import { useCallback, useEffect, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { navegacaoIniciou, navegacaoTerminou } from "@/lib/navigation-busy";

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
 * - isPending: a navegação ainda está em voo.
 *
 * **Por que a navegação vai dentro de `useTransition`.** Trocar um parâmetro re-renderiza a página
 * no SERVIDOR, e com o banco a ~300ms de ida e volta isso leva de 0,8 a 2 segundos. Sem transição
 * não existe sinal nenhum de que algo está acontecendo: a tela antiga fica na frente, intacta, e
 * quem clicou conclui que o clique não pegou — e clica de novo. `isPending` é o que permite ao
 * controle responder, e é ele que acende a barra do topo (`lib/navigation-busy.ts`).
 */
export function useUrlFilters(options?: UseUrlFiltersOptions) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const resetKey = options?.resetKey ?? "page";
  const scroll = options?.scroll ?? false;
  const replace = options?.replace ?? false;

  const [isPending, startTransition] = useTransition();

  // O contador do topo segue o `isPending`, e não as chamadas: assim cada navegação soma UMA vez,
  // mesmo que o commit seja chamado duas vezes seguidas, e o "fim" acontece quando a navegação
  // realmente termina — não quando a função retorna, que é imediato.
  useEffect(() => {
    if (!isPending) return;
    navegacaoIniciou();
    return () => navegacaoTerminou();
  }, [isPending]);

  const commit = useCallback(
    (sp: URLSearchParams) => {
      const qs = sp.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      startTransition(() => {
        if (replace) router.replace(url, { scroll });
        else router.push(url, { scroll });
      });
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

  return { searchParams, setParam, setParams, clearParams, isPending };
}
