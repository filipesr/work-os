"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { CalendarPlus, Pencil } from "lucide-react";
import { FormDialog } from "@/components/ui/FormDialog";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { createOccurrence, updateOccurrence } from "@/lib/actions/calendar-occurrence";

export interface OccurrenceDraft {
  id?: string;
  iso: string;
  titlePt: string;
  titleEs: string;
  kind: "HOLIDAY" | "COMMERCIAL" | "EVENT";
}

/**
 * Cadastro/edição de uma data própria. Usa o `FormDialog` padrão do admin.
 *
 * Só existe para linhas CUSTOM: as do catálogo são regeneráveis, e editá-las
 * aqui produziria uma alteração com prazo de validade (a próxima
 * rematerialização a desfaria). A server action recusa CURATED de todo jeito —
 * esta é a camada de UI da mesma regra, não a regra em si.
 */
export function OccurrenceForm({ draft }: { draft?: OccurrenceDraft }) {
  const t = useTranslations("planning.dates");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isEdit = Boolean(draft?.id);
  const formId = `occurrence-form-${draft?.id ?? "new"}`;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = isEdit ? await updateOccurrence(formData) : await createOccurrence(formData);
      if (res && "error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(isEdit ? t("updated") : t("created"));
      setOpen(false);
      router.refresh();
    });
  };

  const fieldClass =
    "w-full rounded-lg border-2 border-input-border bg-input px-3 py-2 text-foreground shadow-sm transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20";

  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        isEdit ? (
          <button
            type="button"
            aria-label={t("edit")}
            title={t("edit")}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
          >
            <CalendarPlus className="h-4 w-4" aria-hidden="true" />
            {t("createButton")}
          </button>
        )
      }
      title={isEdit ? t("editTitle") : t("createTitle")}
      description={t("formDescription")}
      formId={formId}
      isPending={isPending}
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        {draft?.id && <input type="hidden" name="id" value={draft.id} />}

        <div>
          <FieldLabel htmlFor={`${formId}-date`} required>
            {t("fields.date")}
          </FieldLabel>
          <input
            id={`${formId}-date`}
            name="date"
            type="date"
            required
            defaultValue={draft?.iso ?? ""}
            className={fieldClass}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor={`${formId}-pt`} required>
              {t("fields.titlePt")}
            </FieldLabel>
            <input
              id={`${formId}-pt`}
              name="titlePt"
              required
              defaultValue={draft?.titlePt ?? ""}
              className={fieldClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor={`${formId}-es`} required>
              {t("fields.titleEs")}
            </FieldLabel>
            <input
              id={`${formId}-es`}
              name="titleEs"
              required
              defaultValue={draft?.titleEs ?? ""}
              className={fieldClass}
            />
            {/* P8: a data aparece nas duas línguas do app. Sem o título em
                espanhol, o es-ES mostraria português. */}
            <p className="mt-1 text-xs text-muted-foreground">{t("fields.titleEsHint")}</p>
          </div>
        </div>

        <div>
          <FieldLabel htmlFor={`${formId}-kind`} required>
            {t("fields.kind")}
          </FieldLabel>
          <select
            id={`${formId}-kind`}
            name="kind"
            defaultValue={draft?.kind ?? "EVENT"}
            className={fieldClass}
          >
            <option value="EVENT">{t("kind.EVENT")}</option>
            <option value="COMMERCIAL">{t("kind.COMMERCIAL")}</option>
            <option value="HOLIDAY">{t("kind.HOLIDAY")}</option>
          </select>
        </div>
      </form>
    </FormDialog>
  );
}
