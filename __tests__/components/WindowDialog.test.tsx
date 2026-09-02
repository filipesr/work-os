import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const setStageWindow = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/lib/actions/week-planning", () => ({
  setStageWindow: (...a: unknown[]) => setStageWindow(...a),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { WindowDialog } from "@/app/[locale]/(protected)/planning/week/WindowDialog";

beforeEach(() => vi.clearAllMocks());

describe("WindowDialog", () => {
  it("reabre com a hora que já está marcada", () => {
    // Editar um compromisso de 14h–16h num formulário vazio o transformaria em outro compromisso.
    render(
      <WindowDialog
        activeStageId="as1"
        label="Reels · Gravação"
        startTime="14:00"
        endTime="16:00"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "windowOpen" }));
    expect((screen.getByLabelText("windowStart") as HTMLInputElement).value).toBe("14:00");
    expect((screen.getByLabelText("windowEnd") as HTMLInputElement).value).toBe("16:00");
  });

  it("envia início e fim", () => {
    render(
      <WindowDialog activeStageId="as1" label="Reels · Gravação" startTime={null} endTime={null} />
    );
    fireEvent.click(screen.getByRole("button", { name: "windowOpen" }));
    fireEvent.change(screen.getByLabelText("windowStart"), { target: { value: "09:30" } });
    fireEvent.submit(screen.getByTestId("window-form"));
    expect(setStageWindow).toHaveBeenCalledWith({
      activeStageId: "as1",
      startTime: "09:30",
      endTime: null,
    });
  });

  it("desmarcar manda startTime nulo", () => {
    // Limpar é a mesma porta, sem uma segunda ação no servidor.
    render(
      <WindowDialog activeStageId="as1" label="Reels · Gravação" startTime="14:00" endTime={null} />
    );
    fireEvent.click(screen.getByRole("button", { name: "windowOpen" }));
    fireEvent.click(screen.getByRole("button", { name: "windowClear" }));
    expect(setStageWindow).toHaveBeenCalledWith({ activeStageId: "as1", startTime: null });
  });
});
