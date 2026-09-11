"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

/**
 * Botão de envio que se desabilita sozinho enquanto o formulário está em voo.
 *
 * **Existe por causa de um defeito real, não por elegância.** `CreateTaskForm` usava
 * `<form action={createTask}>` com o botão desabilitado apenas por falta de projeto ou template —
 * nada impedia o segundo clique. Com o banco a ~300ms de ida e volta, a criação leva mais de um
 * segundo sem nenhuma mudança visível no botão, e quem clica de novo **cria uma demanda duplicada**.
 * Ali o clique repetido não é impaciência: é a interface não ter dito que já estava trabalhando.
 *
 * `useFormStatus` só enxerga o formulário de um componente FILHO — é por isso que isto precisa ser
 * um componente próprio, e não um `disabled` calculado na própria página. Quem chamar de fora de um
 * `<form>` recebe `pending: false` para sempre, que é falha silenciosa: por isso o `formAction`
 * nunca deve ser usado aqui para "emprestar" o botão a outro formulário.
 */
export function SubmitButton({
  children,
  pendingLabel,
  disabled = false,
  className = "",
  icon,
}: {
  children: React.ReactNode;
  /** O que dizer enquanto envia. Sem isto, o texto continua o mesmo e só o giro muda. */
  pendingLabel?: string;
  /** Razões da PRÓPRIA tela para bloquear (formulário incompleto, por exemplo). Somam-se ao
   *  bloqueio por envio em andamento; nenhuma substitui a outra. */
  disabled?: boolean;
  className?: string;
  icon?: React.ReactNode;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className={`flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:bg-primary/90 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {pending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : icon}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
