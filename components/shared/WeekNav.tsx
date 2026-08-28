"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
        <Link href={href(-1)} aria-label={labels.previous} className={iconBtn} rel="prev">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <Link href={href(1)} aria-label={labels.next} className={iconBtn} rel="next">
          <ChevronRight className="h-4 w-4" />
        </Link>
        {/* "Semana atual" só aparece quando LEVA a algum lugar: a própria presença informa que você
            navegou para longe. */}
        {!isCurrentWeek && (
          <Link
            href={href(0)}
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
