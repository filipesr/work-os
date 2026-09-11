"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { assinarNavegacao, navegacoesEmVoo } from "@/lib/navigation-busy";

/** Quanto tempo de espera antes de mostrar qualquer coisa. */
const ATRASO_MS = 150;

/**
 * Barra fina de progresso no topo, no padrão que o GitHub e o YouTube usam.
 *
 * **Por que uma barra, e não uma tela escurecida.** Trocar um filtro custa de 0,8 a 2 segundos —
 * quase tudo é ida e volta até o banco, que fica longe. Para esse tempo, um véu que bloqueia a tela
 * aparece e some antes de ser lido: vira piscada, e piscada faz a interface parecer menos estável,
 * não mais. Além disso ele impede a pessoa de fazer outra coisa enquanto espera, o que não se
 * justifica numa leitura. Véu bloqueante fica para operação de vários segundos que não deve ser
 * interrompida.
 *
 * **O atraso de 150ms não é enfeite.** Sem ele, toda navegação servida do cache do roteador —
 * voltar para uma semana já visitada, por exemplo — acenderia e apagaria a barra no mesmo quadro.
 * O que aparece e some rápido demais é ruído: registra como "alguma coisa piscou", não como
 * "está carregando".
 *
 * O que ela cobre: navegação por PARÂMETRO (filtro, semana, período), que é onde o `loading.tsx`
 * não dispara porque a rota não muda. Clique em `<Link>` continua sendo coberto pelo esqueleto da
 * rota de destino.
 */
export function NavigationProgress() {
  const emVoo = useSyncExternalStore(
    assinarNavegacao,
    navegacoesEmVoo,
    // No servidor não há navegação em voo: sem este terceiro argumento o React lança durante a
    // hidratação, porque `navegacoesEmVoo` toca um módulo que só existe no cliente.
    () => 0
  );
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (emVoo === 0) {
      setVisivel(false);
      return;
    }
    const id = setTimeout(() => setVisivel(true), ATRASO_MS);
    return () => clearTimeout(id);
  }, [emVoo]);

  if (!visivel) return null;

  return (
    <div
      // `fixed` e acima do cabeçalho: a barra precisa aparecer mesmo com a página rolada, e o
      // cabeçalho é `sticky z-40`.
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-primary/20"
      role="status"
      aria-live="polite"
    >
      {/* Indeterminada de propósito: não sabemos quanto falta, e uma barra que finge saber ensina
          a desconfiar dela. O que ela afirma é só "ainda estou trabalhando". */}
      <div className="h-full w-1/3 animate-[navprogress_1.1s_ease-in-out_infinite] bg-primary" />
    </div>
  );
}
