"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Pencil, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { updateDisplayName } from "@/lib/actions/profile";
import { useServerAction } from "@/lib/hooks/useServerAction";
import { validateDisplayName, DISPLAY_NAME_MAX } from "@/lib/display-name";

/** Edição do nome de exibição, no lugar onde ele já era mostrado.
 *
 *  Fica embutido na linha do campo em vez de virar um diálogo: é um campo só, e abrir um modal para
 *  trocar uma palavra é mais cerimônia do que a tarefa merece.
 *
 *  A validação roda aqui só para avisar antes de enviar — quem decide é o servidor, com a MESMA
 *  função (`lib/display-name.ts`). Duas implementações da mesma regra divergiriam.
 */
export function EditDisplayNameForm({ currentName }: { currentName: string }) {
  const t = useTranslations("account.editName");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentName);

  const { run, isPending } = useServerAction(updateDisplayName, {
    successMessage: t("success"),
    onSuccess: () => {
      setEditing(false);
      router.refresh();
    },
  });

  // Enquanto o campo está vazio não mostramos erro: a pessoa acabou de apagar para digitar, e
  // acusá-la nesse instante é ruído.
  const problem = value.trim().length > 0 ? validateDisplayName(value) : null;

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-foreground">{currentName || t("empty")}</span>
        <button
          type="button"
          onClick={() => {
            setValue(currentName);
            setEditing(true);
          }}
          aria-label={t("trigger")}
          title={t("trigger")}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <form
      className="space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (problem) return;
        run(new FormData(e.currentTarget));
      }}
    >
      <div className="flex items-center gap-2">
        <Input
          name="name"
          value={value}
          autoFocus
          maxLength={DISPLAY_NAME_MAX}
          onChange={(e) => setValue(e.target.value)}
          aria-label={t("trigger")}
          aria-invalid={problem !== null}
          className="h-9 max-w-xs"
        />
        <button
          type="submit"
          disabled={isPending || problem !== null || value.trim().length === 0}
          aria-label={t("save")}
          title={t("save")}
          className="rounded-md p-1.5 text-success transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={isPending}
          aria-label={t("cancel")}
          title={t("cancel")}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className={`text-xs ${problem ? "text-danger" : "text-muted-foreground"}`}>
        {problem ? t(`error.${problem}`) : t("hint")}
      </p>
    </form>
  );
}
