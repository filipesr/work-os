"use client";

import { useTranslations } from "next-intl";
import { KeyRound, UserX, UserCheck } from "lucide-react";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { setUserDisabled, renewGoogleLink } from "@/lib/actions/user";

/** Ações de ACESSO de um usuário: ligar/desligar a entrada e refazer o vínculo com o Google.
 *
 *  Ficam separadas do "editar" (papel, times, datas) de propósito: editar é rotina, isto tira ou
 *  devolve o acesso de alguém. Ambas passam por confirmação, e o texto do diálogo diz o efeito
 *  colateral que não é óbvio — as duas derrubam as sessões abertas na hora.
 */
/** As ações devolvem `{ success, ... }` ou `{ error }`; o ConfirmActionButton só olha `error`.
 *  Um adaptador num lugar só evita repetir o estreitamento de tipo em cada botão. */
async function asConfirmResult(
  p: Promise<{ error: string } | { success: true; removed?: number }>
): Promise<{ error?: string } | undefined> {
  const r = (await p) as { error?: string };
  return r.error ? { error: r.error } : undefined;
}

export function UserAccessActions({
  userId,
  userName,
  disabled,
  isSelf,
  hasGoogleLink,
}: {
  userId: string;
  userName: string;
  /** Já está desativado — inverte a ação oferecida. */
  disabled: boolean;
  /** O próprio admin logado: desativar a si mesmo é caminho sem volta (o acesso é por convite). */
  isSelf: boolean;
  /** Sem vínculo, "renovar" não tem o que desfazer — o próximo login já cria um. */
  hasGoogleLink: boolean;
}) {
  const t = useTranslations("admin.users.access");

  return (
    <div className="inline-flex items-center gap-2">
      {hasGoogleLink && (
        <ConfirmActionButton
          action={() => asConfirmResult(renewGoogleLink(userId))}
          title={t("renew.title")}
          description={t("renew.description", { name: userName })}
          confirmLabel={t("renew.confirm")}
          successMessage={t("renew.success")}
          trigger={
            <button
              type="button"
              title={t("renew.trigger")}
              aria-label={t("renew.trigger")}
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <KeyRound className="h-4 w-4" />
            </button>
          }
        />
      )}

      {/* Desativar a si mesmo trancaria o admin para fora sem caminho de volta pela interface.
          O botão some em vez de aparecer e falhar — erro que não pode acontecer não vira mensagem. */}
      {!isSelf && (
        <ConfirmActionButton
          action={() => asConfirmResult(setUserDisabled(userId, !disabled))}
          title={disabled ? t("enable.title") : t("disable.title")}
          description={
            disabled
              ? t("enable.description", { name: userName })
              : t("disable.description", { name: userName })
          }
          confirmLabel={disabled ? t("enable.confirm") : t("disable.confirm")}
          successMessage={disabled ? t("enable.success") : t("disable.success")}
          confirmVariant={disabled ? "default" : "destructive"}
          trigger={
            <button
              type="button"
              title={disabled ? t("enable.trigger") : t("disable.trigger")}
              aria-label={disabled ? t("enable.trigger") : t("disable.trigger")}
              className={`rounded-md p-2 transition-colors hover:bg-muted ${
                disabled
                  ? "text-success hover:text-success"
                  : "text-muted-foreground hover:text-danger"
              }`}
            >
              {disabled ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
            </button>
          }
        />
      )}
    </div>
  );
}
