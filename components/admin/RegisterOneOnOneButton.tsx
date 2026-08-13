"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FormDialog } from "@/components/ui/FormDialog";
import { useServerAction } from "@/lib/hooks/useServerAction";
import { logOneOnOne } from "@/lib/actions/one-on-one";

/**
 * Registro de um 1:1, com anotação do que foi conversado.
 *
 * Era um botão de confirmar puro: gravava que a conversa aconteceu e nada mais.
 * A action e a coluna `OneOnOneLog.notes` já aceitavam o texto — só a interface
 * nunca o enviava. Sem ele a cadência vira caixinha de "feito": o gestor chega
 * no próximo encontro sem o combinado do anterior, e a pessoa percebe.
 *
 * A nota é OPCIONAL de propósito. Tornar obrigatório empurraria para o texto de
 * fachada ("tudo certo") só para destravar o botão — e uma nota vazia é mais
 * honesta que uma nota falsa. Ao salvar, a rota é revalidada: quem estava
 * atrasado sai da lista e o próximo aparece.
 */
export default function RegisterOneOnOneButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const t = useTranslations("admin.health.oneOnOne");
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");

  const { run, isPending } = useServerAction(logOneOnOne, {
    successMessage: t("logged"),
    onSuccess: () => {
      setOpen(false);
      setNotes("");
      router.refresh();
    },
  });

  const formId = `one-on-one-${userId}`;

  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setNotes("");
      }}
      title={t("confirmTitle")}
      description={t("confirmDesc", { name })}
      formId={formId}
      submitLabel={t("confirmYes")}
      isPending={isPending}
      trigger={
        <button
          type="button"
          className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-accent"
        >
          {t("logButton")}
        </button>
      }
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          run(userId, notes);
        }}
      >
        <label htmlFor={`${formId}-notes`} className="block text-sm font-medium text-foreground">
          {t("notesLabel")}
        </label>
        <textarea
          id={`${formId}-notes`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          placeholder={t("notesPlaceholder")}
          className="mt-1.5 w-full rounded-md border border-border bg-background p-2 text-sm text-foreground"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">{t("notesHint")}</p>
      </form>
    </FormDialog>
  );
}
