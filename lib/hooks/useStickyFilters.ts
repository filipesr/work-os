"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { readSticky, writeSticky, type StickyFilters } from "@/lib/planning/sticky-filters";

/**
 * Faz os filtros da tela sobreviverem ao recarregamento, guardando-os no navegador.
 *
 * A URL continua sendo a fonte da verdade — é ela que o servidor lê para filtrar. O armazenamento
 * só entra numa situação: **a primeira montagem com a URL sem filtro nenhum**. Aí o hook reescreve
 * a URL com o que estava salvo, e daí em diante tudo segue o caminho normal.
 *
 * **A URL ganha do salvo.** Chegar por um link com filtro NÃO dispara restauração: senão o mesmo
 * link abriria diferente para cada pessoa, conforme o que cada uma tivesse filtrado antes, e um
 * link deixaria de servir para o que serve.
 *
 * O custo é uma navegação a mais no primeiro carregamento de quem tem filtro salvo — `replace`, não
 * `push`, para o botão voltar não cair numa versão sem filtro da mesma tela.
 *
 * O que ele NÃO faz: avisar que há filtro ativo. Isso é da barra, com as tags removíveis, e é o que
 * impede o pior caso desta função — a pessoa abrir a tela recortada e achar que o dado sumiu.
 */
export function useStickyFilters(scope: string, keys: string[]): void {
  const searchParams = useSearchParams();
  const { setParams } = useUrlFilters({ replace: true });
  const [pronto, setPronto] = useState(false);

  // A chave estável evita que um array literal recriado a cada render dispare os efeitos.
  const chaves = useMemo(() => keys.join("|"), [keys]);

  const naUrl = useMemo(() => {
    const atual: StickyFilters = {};
    for (const key of chaves.split("|")) {
      const valor = searchParams.get(key);
      if (valor) atual[key] = valor;
    }
    return atual;
  }, [searchParams, chaves]);

  const temFiltroNaUrl = Object.keys(naUrl).length > 0;
  const jaDecidiu = useRef(false);

  // A decisão de restaurar acontece UMA VEZ. Não é otimização: `setParams` navega dentro de uma
  // transição, a transição re-renderiza, e um efeito que reavalia a cada render voltaria a chamar
  // `setParams` — laço infinito que come a memória do processo. (Foi exatamente o que aconteceu
  // quando a transição entrou no `useUrlFilters`.)
  useEffect(() => {
    if (jaDecidiu.current) return;
    jaDecidiu.current = true;

    if (temFiltroNaUrl) {
      setPronto(true);
      return;
    }

    const salvo = readSticky(scope, chaves.split("|"));
    if (Object.keys(salvo).length === 0) {
      setPronto(true);
      return;
    }

    // Não marca `pronto` aqui: a navegação vai trazer os filtros para a URL, o efeito ABAIXO vê
    // isso e só então o hook passa a gravar. Marcar agora abriria uma janela em que o efeito de
    // gravação salvaria o estado VAZIO por cima do que acabou de ser lido.
    setParams(salvo);
  }, [temFiltroNaUrl, scope, chaves, setParams]);

  // Os filtros restaurados chegaram à URL: daqui em diante o hook grava normalmente.
  useEffect(() => {
    if (!pronto && temFiltroNaUrl) setPronto(true);
  }, [pronto, temFiltroNaUrl]);

  useEffect(() => {
    if (!pronto) return;
    writeSticky(scope, naUrl);
  }, [pronto, naUrl, scope]);
}
