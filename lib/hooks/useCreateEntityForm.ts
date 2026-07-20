"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

interface UseCreateEntityFormOptions<
  TFormData extends { name: string },
  TResult extends { error?: string },
  TEntity extends { id: string; name: string },
> {
  /** Server Action que cria a entidade. Convenção: retorna `{ error }` em falha. */
  action: (data: TFormData) => Promise<TResult>;
  /** Estado inicial do formulário (também usado no reset após sucesso). */
  initialFormData: TFormData;
  /** Extrai a entidade criada do resultado da action (ex.: `r.project`, `r.client`). */
  extractEntity: (result: TResult) => TEntity | undefined | null;
  /** Toast de sucesso a partir da entidade criada. */
  successMessage: (entity: TEntity) => string;
  /** Mensagem exibida quando o nome está vazio. */
  nameRequiredMessage: string;
  /** Validação adicional opcional; retorne a mensagem de erro (toast) para abortar. */
  validate?: (data: TFormData) => string | null | undefined;
  /** Callback no sucesso; quando ausente, faz `router.refresh()`. */
  onCreated?: (id: string) => void;
}

/**
 * Owns the shared create-dialog lifecycle: open state, form state,
 * pending/submit via `useTransition`, validação de nome, toasts e reset.
 * Cada tela fornece apenas seus campos e labels específicos.
 */
export function useCreateEntityForm<
  TFormData extends { name: string },
  TResult extends { error?: string },
  TEntity extends { id: string; name: string },
>({
  action,
  initialFormData,
  extractEntity,
  successMessage,
  nameRequiredMessage,
  validate,
  onCreated,
}: UseCreateEntityFormOptions<TFormData, TResult, TEntity>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [formData, setFormData] = useState<TFormData>(initialFormData);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error(nameRequiredMessage);
      return;
    }

    const validationError = validate?.(formData);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    startTransition(async () => {
      const result = await action(formData);

      if (result.error) {
        toast.error(result.error);
      } else {
        const entity = extractEntity(result);
        if (entity) {
          toast.success(successMessage(entity));
          setOpen(false);
          setFormData(initialFormData);

          if (onCreated) {
            onCreated(entity.id);
          } else {
            router.refresh();
          }
        }
      }
    });
  };

  return { open, setOpen, isPending, formData, setFormData, handleSubmit };
}
