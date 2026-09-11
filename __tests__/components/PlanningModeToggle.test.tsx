import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

let pendente = false;
const setParam = vi.fn();
vi.mock("@/lib/hooks/useUrlFilters", () => ({
  useUrlFilters: () => ({ setParam, isPending: pendente }),
}));

import { PlanningModeToggle } from "@/app/[locale]/(protected)/planning/calendar/PlanningModeToggle";

beforeEach(() => {
  setParam.mockClear();
  pendente = false;
});

/**
 * Ligar a trava re-renderiza a página inteira no servidor — mais de um segundo, porque o banco está
 * a ~300ms de ida e volta. Sem bloquear o botão, o SEGUNDO clique desliga o que o primeiro acabou
 * de ligar, e a pessoa conclui que o botão não funciona.
 */
describe("PlanningModeToggle", () => {
  it("em repouso, aceita o clique", () => {
    render(<PlanningModeToggle enabled={false} />);
    expect(screen.getByRole("button")).toBeEnabled();
  });

  it("com a navegação em voo, BLOQUEIA — o segundo clique desfaria o primeiro", () => {
    pendente = true;
    render(<PlanningModeToggle enabled={false} />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("anuncia o trabalho em curso a quem usa leitor de tela", () => {
    pendente = true;
    render(<PlanningModeToggle enabled={false} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
  });

  it("continua dizendo se a trava está ligada ou não", () => {
    render(<PlanningModeToggle enabled />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });
});
