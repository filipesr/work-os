import { getTranslations } from "next-intl/server";
import { LogOut } from "lucide-react";
import { signOutAction } from "@/lib/actions/auth";

/**
 * Botão de sair. Existem duas PORTAS (o menu de avatar e esta tela), mas um
 * único MECANISMO: `signOutAction`.
 *
 * Antes esta era a única superfície que chamava `signOut()` do next-auth/react
 * direto — e por isso **não zerava `lastSeenAt`**. Quem saía por aqui continuava
 * aparecendo como "online" no quadro de presença até o dia virar, o que
 * corrompia justamente o dado que o board e o mural de TV mostram.
 *
 * Server Component: nada aqui precisa de estado no cliente, e a server action é
 * chamada por `<form action>` — funciona até sem JS.
 */
export async function SignOutButton() {
  const t = await getTranslations("common.nav");

  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="inline-flex items-center gap-2 rounded-lg bg-destructive px-6 py-2 font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        {t("signOut")}
      </button>
    </form>
  );
}
