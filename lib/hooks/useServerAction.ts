"use client";

import { useTransition } from "react";
import toast from "react-hot-toast";

type ActionResult = { error?: string } | void | null | undefined;

interface UseServerActionOptions {
  /** Toast de sucesso exibido quando a action não retorna `{ error }`. */
  successMessage?: string;
  /** Mensagem usada quando a action lança (exceção não tratada). */
  errorMessage?: string;
  /** Callback chamado no sucesso (após o toast). */
  onSuccess?: (result: unknown) => void;
  /** Callback chamado no erro (após o toast). */
  onError?: (message: string) => void;
}

/**
 * Centraliza o padrão `startTransition -> action -> toast` repetido em ~17
 * componentes. Convenção: a Server Action retorna `{ error: string }` em caso
 * de falha, ou qualquer outra coisa (incl. void) em caso de sucesso.
 */
export function useServerAction<TArgs extends unknown[]>(
  action: (...args: TArgs) => Promise<ActionResult>,
  options: UseServerActionOptions = {}
) {
  const [isPending, startTransition] = useTransition();

  const run = (...args: TArgs) => {
    startTransition(async () => {
      try {
        const result = await action(...args);
        if (result && typeof result === "object" && "error" in result && result.error) {
          const message = String(result.error);
          toast.error(message);
          options.onError?.(message);
          return;
        }
        if (options.successMessage) toast.success(options.successMessage);
        options.onSuccess?.(result);
      } catch {
        const message = options.errorMessage ?? "Ocorreu um erro. Tente novamente.";
        toast.error(message);
        options.onError?.(message);
      }
    });
  };

  return { run, isPending };
}
