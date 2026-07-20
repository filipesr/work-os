"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useControllableOpen } from "@/lib/hooks/useControllableOpen";
import { useServerAction } from "@/lib/hooks/useServerAction";

interface ConfirmActionButtonProps {
  /** Server Action a executar ao confirmar (retorna `{ error }` em falha). */
  action: () => Promise<{ error?: string } | void>;
  title: string;
  description?: string;
  confirmLabel: string;
  pendingLabel?: string;
  cancelLabel?: string;
  successMessage?: string;
  confirmVariant?: "default" | "destructive";
  /** Classe extra no botão de confirmar (ex.: cores custom green/orange). */
  confirmClassName?: string;
  /**
   * Elemento que abre o diálogo. Se omitido, o componente é "controlado"
   * apenas por `open`/`onOpenChange` (modal-only, sem gatilho próprio).
   */
  trigger?: React.ReactNode;
  /** Conteúdo extra no corpo (info boxes, listas, seletores). */
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: () => void;
}

/**
 * Botão de confirmação genérico construído sobre o Dialog (Radix) — substitui
 * os overlays `fixed inset-0 bg-black` feitos à mão em ~9 componentes, ganhando
 * focus-trap/ESC/scroll-lock de graça. Compõe useControllableOpen +
 * useServerAction.
 */
export function ConfirmActionButton({
  action,
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel = "Cancelar",
  successMessage,
  confirmVariant = "default",
  confirmClassName,
  trigger,
  children,
  open,
  onOpenChange,
  onSuccess,
}: ConfirmActionButtonProps) {
  const { open: isOpen, setOpen } = useControllableOpen(open, onOpenChange);
  const { run, isPending } = useServerAction(action, {
    successMessage,
    onSuccess: () => {
      setOpen(false);
      onSuccess?.();
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="ghost" size="sm" disabled={isPending}>
              {cancelLabel}
            </Button>
          </DialogClose>
          <Button
            variant={confirmVariant}
            size="sm"
            className={confirmClassName}
            onClick={() => run()}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {pendingLabel ?? confirmLabel}
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
