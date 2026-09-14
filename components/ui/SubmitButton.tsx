"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
 *
 * **É comportamento, não aparência.** O estilo vem inteiro do chamador: o app crava a classe do
 * botão em cada tela (menu, cabeçalho de edição, lista CRUD), e um estilo padrão aqui obrigaria
 * cada um deles a desfazê-lo classe por classe. O que fica é só o mínimo que o giro precisa —
 * alinhar ícone e texto — e os estados de desabilitado. `cn` resolve os conflitos, então a classe
 * do chamador sempre vence.
 */
export function SubmitButton({
  children,
  pendingLabel,
  disabled = false,
  className = "",
  icon,
  role,
  spinnerClassName = "h-4 w-4",
}: {
  children: React.ReactNode;
  /** O que dizer enquanto envia. Sem isto, o texto continua o mesmo e só o giro muda. */
  pendingLabel?: string;
  /** Razões da PRÓPRIA tela para bloquear (formulário incompleto, por exemplo). Somam-se ao
   *  bloqueio por envio em andamento; nenhuma substitui a outra. */
  disabled?: boolean;
  className?: string;
  icon?: React.ReactNode;
  /** Para quando o botão vive dentro de um `role="menu"` e precisa se declarar item. */
  role?: string;
  /** Tamanho do giro. Existe para casar com o ícone que ele substitui — um giro de tamanho
   *  diferente faz o botão pular de altura no instante do clique, que é justo quando a pessoa
   *  está olhando para ele. */
  spinnerClassName?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      role={role}
      disabled={pending || disabled}
      aria-busy={pending}
      className={cn(
        "inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
    >
      {pending ? (
        <Loader2 className={cn("animate-spin", spinnerClassName)} aria-hidden="true" />
      ) : (
        icon
      )}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
