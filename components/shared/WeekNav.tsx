"use client";

import { useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { navegacaoIniciou, navegacaoTerminou } from "@/lib/navigation-busy";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatISODate, shiftWeek } from "@/lib/dates";

/**
 * Navegar de semana pela URL. Nasceu na mesa do gestor e virou compartilhado quando a tela da
 * pessoa precisou do mesmo: duas cópias divergiriam, e a semana seguinte é onde o trabalho é
 * distribuído — não pode funcionar de um jeito de cada lado.
 *
 * O que varia entre as telas (o filtro de time, que só o gestor tem) entra por `children`.
 */
export function WeekNav({
  monday,
  isCurrentWeek,
  labels,
  children,
}: {
  monday: Date;
  /** Vem do SERVIDOR: calcular `new Date()` aqui divergiria entre render de servidor e de cliente
   *  perto da virada do dia. */
  isCurrentWeek: boolean;
  labels: { previous: string; next: string; current: string };
  children?: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Alimenta a barra do topo (`components/NavigationProgress.tsx`).
  useEffect(() => {
    if (!isPending) return;
    navegacaoIniciou();
    return () => navegacaoTerminou();
  }, [isPending]);

  /**
   * Navega dentro de uma TRANSIÇÃO, preservando o `<Link>` por baixo.
   *
   * Trocar de semana muda só o parâmetro, não a rota — então o `loading.tsx` não dispara, e sem
   * transição a tela antiga fica intacta na frente por um a dois segundos (o banco está a ~300ms
   * de ida e volta). Quem clicou conclui que o clique não pegou, e clica de novo.
   *
   * O `<Link>` continua sendo um link de verdade: clique com Ctrl/Cmd, do meio, ou com Shift
   * seguem para o navegador, que é o que permite abrir a semana em outra aba. Só o clique simples
   * é interceptado.
   */
  const navegar = (e: React.MouseEvent<HTMLAnchorElement>, destino: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    startTransition(() => router.push(destino, { scroll: false }));
  };

  // A URL parte sempre dos parâmetros atuais: só a chave da semana muda, senão navegar descartaria
  // os outros filtros a cada clique.
  const href = (delta: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (delta === 0) params.delete("week");
    else params.set("week", formatISODate(shiftWeek(monday, delta)));
    const qs = params.toString();
    return qs ? `?${qs}` : "?";
  };

  const iconBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {children}
      <div className="flex items-center gap-1">
        <Link
          href={href(-1)}
          onClick={(e) => navegar(e, href(-1))}
          aria-label={labels.previous}
          aria-busy={isPending}
          className={iconBtn}
          rel="prev"
        >
          <ChevronLeft className={`h-4 w-4 ${isPending ? "animate-pulse" : ""}`} />
        </Link>
        <Link
          href={href(1)}
          onClick={(e) => navegar(e, href(1))}
          aria-label={labels.next}
          aria-busy={isPending}
          className={iconBtn}
          rel="next"
        >
          <ChevronRight className={`h-4 w-4 ${isPending ? "animate-pulse" : ""}`} />
        </Link>
        {/* "Semana atual" só aparece quando LEVA a algum lugar: a própria presença informa que você
            navegou para longe. */}
        {!isCurrentWeek && (
          <Link
            href={href(0)}
            onClick={(e) => navegar(e, href(0))}
            scroll={false}
            className="ml-1 rounded-lg px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-accent"
          >
            {labels.current}
          </Link>
        )}
      </div>
    </div>
  );
}
