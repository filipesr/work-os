"use client";

import { type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Diálogo de FORMULÁRIO padrão do admin: gatilho + cabeçalho + corpo + rodapé
 * (cancelar / salvar com estado de pendente).
 *
 * Por que existe: `/admin/users` e `/admin/teams` tinham modais **artesanais**
 * (`fixed inset-0` montado à mão) enquanto o resto do app usava `ui/dialog`.
 * Além da inconsistência visual, o artesanal perde o que o Radix dá de graça:
 * fechar no ESC, trava de foco dentro do diálogo, `aria-modal`, restaurar o foco
 * no gatilho ao fechar e bloqueio de scroll do fundo. Reescrever isso por tela
 * é como esses detalhes somem.
 *
 * O `<form>` é do CALLER, não daqui: cada tela tem sua server action, seus
 * campos e sua validação. Este componente cuida da moldura — o rodapé recebe o
 * `formId` para o botão de submit alcançar um form que vive no corpo.
 */
export function FormDialog({
  trigger,
  title,
  description,
  formId,
  submitLabel,
  isPending = false,
  open,
  onOpenChange,
  children,
  footer,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  /** Id do `<form>` renderizado em `children` — liga o botão do rodapé a ele. */
  formId?: string;
  submitLabel?: string;
  isPending?: boolean;
  /** Controlado (opcional). Omitir = o Radix gerencia o estado internamente. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  /** Substitui o rodapé padrão quando a tela precisa de outras ações. */
  footer?: ReactNode;
}) {
  const t = useTranslations("common.dialog");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {/* Sem descrição o Radix avisa no console a cada abertura. A forma
          documentada de dizer "não há descrição, de propósito" é ter a CHAVE
          `aria-describedby` presente com valor undefined — por isso o spread
          condicional: passá-la sempre seria indistinguível de não passar. */}
      <DialogContent
        className="max-h-[90vh] overflow-y-auto"
        {...(description ? {} : { "aria-describedby": undefined })}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {/* DialogDescription é o que o leitor de tela anuncia junto do título.
              Sem ela o Radix avisa no console — e o usuário de leitor de tela
              ouve só o título, sem o contexto do que o formulário faz. */}
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {children}

        {footer ?? (
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange?.(false)}
              disabled={isPending}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" form={formId} disabled={isPending}>
              {isPending ? t("saving") : (submitLabel ?? t("save"))}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
