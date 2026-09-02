import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LogTimeButton } from "@/components/tasks/LogTimeButton";

// Ecoa NAMESPACE + chave: é assim que o teste verifica de onde exatamente o rótulo vem, sem
// depender do texto traduzido.
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
  useLocale: () => "pt-BR",
}));

// O formulário só monta depois do clique, e tem árvore própria (server action, toast) que nada
// aqui exercita.
vi.mock("@/components/tasks/LogTimeForm", () => ({
  LogTimeForm: () => <div data-testid="log-time-form-stub" />,
}));

describe("LogTimeButton", () => {
  it("o rótulo vem do locale, não do código", () => {
    // "Registrar Tempo" estava cravado em português no componente. A paridade de locales não
    // pegava, porque a string não estava em locale nenhum — e quem lê em espanhol via o botão em
    // português. A chave já existia (`tasks.actions.logTime`), usada pelo menu que esta mesma
    // revisão apagou; agora é este botão que a mantém viva.
    render(<LogTimeButton taskId="t1" />);
    const botao = screen.getByRole("button");
    expect(botao).toHaveTextContent("tasks.actions.logTime");
    expect(botao).not.toHaveTextContent("Registrar Tempo");
  });
});
