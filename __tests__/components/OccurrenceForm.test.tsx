import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "pt-BR",
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("react-hot-toast", () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/actions/calendar-occurrence", () => ({
  createOccurrence: vi.fn().mockResolvedValue({ success: true }),
  updateOccurrence: vi.fn().mockResolvedValue({ success: true }),
}));

import { OccurrenceForm } from "@/app/[locale]/(protected)/planning/dates/OccurrenceForm";

/**
 * O campo `type="date"` desenha na ordem do SISTEMA de quem abre a tela: no notebook configurado em
 * inglês ele mostra mm/dd, e quem digita pensando em dd/mm cadastra 12 de maio achando que
 * cadastrou 5 de dezembro. O valor ENVIADO nunca inverte — é sempre ISO, e o servidor recusa
 * qualquer outro formato. O que estes testes protegem é a LEITURA: a escolha repetida por extenso,
 * que tira a ambiguidade sem depender da configuração da máquina.
 */
describe("OccurrenceForm — a data escolhida por extenso", () => {
  beforeEach(() => vi.clearAllMocks());

  const abrir = async (props: Parameters<typeof OccurrenceForm>[0] = {}) => {
    const u = userEvent.setup();
    render(<OccurrenceForm {...props} />);
    await u.click(screen.getByRole("button", { name: props.draft ? /edit/ : /createButton/ }));
    return u;
  };

  it("com uma data já escolhida, mostra dia e mês sem ambiguidade", async () => {
    await abrir({
      draft: { id: "o1", iso: "2026-12-05", titlePt: "Festa", titleEs: "Fiesta", kind: "EVENT" },
    });
    // 05/12 e não 12/05: é exatamente o par que a inversão troca.
    expect(screen.getByText("05/12/26, sábado")).toBeInTheDocument();
  });

  it("acompanha o que a pessoa acabou de escolher", async () => {
    const u = await abrir();
    await u.type(screen.getByLabelText(/fields.date/), "2026-12-25");
    expect(screen.getByText("25/12/26, sexta-feira")).toBeInTheDocument();
  });

  it("sem data escolhida, não mostra nada — nem o traço do formatador", async () => {
    // `formatCalendarDay` devolve "-" quando não há data. Renderizar isso deixaria um traço solto
    // sob o campo, que lê como "sem data" onde ainda não houve escolha nenhuma.
    await abrir();
    expect(screen.queryByText(/\d{2}\/\d{2}\/\d{2},/)).not.toBeInTheDocument();
    expect(screen.queryByText("-")).not.toBeInTheDocument();
  });
});
