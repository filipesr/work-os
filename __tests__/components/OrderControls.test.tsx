import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/actions/week-planning", () => ({
  moveStageOrder: vi.fn(),
  unscheduleStage: vi.fn(),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { OrderControls } from "@/app/[locale]/(protected)/planning/week/OrderControls";

beforeEach(() => vi.clearAllMocks());

describe("OrderControls", () => {
  it("com um item só no dia, as setas somem", () => {
    // Ordenar uma coisa sozinha não faz nada, e botão que não faz nada ensina a ignorar botão —
    // inclusive os que fazem. Tirar da semana continua valendo: isso tem efeito com um item só.
    render(<OrderControls activeStageId="as1" canReorder={false} />);

    expect(screen.queryByRole("button", { name: "moveUp" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "moveDown" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "unschedule" })).toBeInTheDocument();
  });

  it("com mais de um, as setas aparecem", () => {
    render(<OrderControls activeStageId="as1" canReorder />);

    expect(screen.getByRole("button", { name: "moveUp" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "moveDown" })).toBeInTheDocument();
  });
});
