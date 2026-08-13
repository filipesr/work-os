import { getTranslations } from "next-intl/server";
import { Lock, Pencil } from "lucide-react";

/**
 * Diz, em uma linha, o que a tela permite AGORA — o pedido de "deixar claro o
 * que é planejamento (escrita) vs leitura". Sem isso, a trava seria só um botão
 * misterioso: o usuário procuraria o botão de criar, não o acharia, e não haveria
 * explicação.
 */
export async function PlanningModeBanner({ enabled }: { enabled: boolean }) {
  const t = await getTranslations("reportsCalendar.planning");

  return (
    <p
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
        enabled
          ? "border-primary/30 bg-primary/5 text-foreground"
          : "border-border bg-muted/30 text-muted-foreground"
      }`}
      role="status"
    >
      {enabled ? (
        <Pencil className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      ) : (
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      {enabled ? t("bannerOn") : t("bannerOff")}
    </p>
  );
}
