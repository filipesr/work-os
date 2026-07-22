import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { StageAssigneeSelect } from "@/components/ui/StageAssigneeSelect";

const messages = {
  tasks: {
    create: {
      assign: { noTeam: "Sem time", ariaLabel: "Atribuir {team}", unassigned: "Não atribuído" },
    },
  },
};
function renderSelect(props: Record<string, unknown>) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <StageAssigneeSelect
        stageId="s1"
        teamName="Design"
        members={[{ id: "u1", name: "Ana", email: null }]}
        {...props}
      />
    </NextIntlClientProvider>
  );
}

describe("StageAssigneeSelect", () => {
  it("uncontrolled + onChange: mantém name E dispara onChange", () => {
    const onChange = vi.fn();
    const { getByRole } = renderSelect({ onChange });
    const select = getByRole("combobox") as HTMLSelectElement;
    expect(select.getAttribute("name")).toBe("assignee:s1"); // ainda submete
    fireEvent.change(select, { target: { value: "u1" } });
    expect(onChange).toHaveBeenCalledWith("u1");
  });

  it("controlado (value+onChange): sem name", () => {
    const onChange = vi.fn();
    const { getByRole } = renderSelect({ value: "u1", onChange });
    expect((getByRole("combobox") as HTMLSelectElement).getAttribute("name")).toBeNull();
  });
});
