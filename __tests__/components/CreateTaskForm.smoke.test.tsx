import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { CreateTaskForm } from "@/components/tasks/CreateTaskForm";

/**
 * Smoke test da criação de tarefa após a migração dos <select> nativos para o
 * Radix `ui/select`. O form usa `<form action={createTask}>` (Server Action via
 * FormData), então cada Radix Select PRECISA emitir um <select> nativo oculto
 * com o `name` correto — senão projectId/templateId/priority não seriam
 * submetidos e a criação quebraria silenciosamente.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((k: string) => k, { rich: (k: string) => k }),
  useLocale: () => "pt-BR",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

// Server actions / heavy children stubbed — we only exercise form structure.
vi.mock("@/lib/actions/task", () => ({ createTask: vi.fn() }));
vi.mock("@/app/actions/templateActions", () => ({
  getTemplateStagePreview: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/actions/client", () => ({ getClients: vi.fn().mockResolvedValue([]) }));
// v2/subsistema-1 server actions — stubbed so the real "use server" modules
// (which pull in next-auth → next/server, unresolvable under Vitest) never load.
vi.mock("@/lib/actions/reporting", () => ({ getTypeForecast: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/actions/assignee-experience", () => ({
  getAssigneeTypeExperience: vi.fn().mockResolvedValue({ completed: 0, experienced: false }),
}));
vi.mock("@/components/quick-create/QuickCreateProject", () => ({
  QuickCreateProject: () => <div />,
}));
vi.mock("@/components/quick-create/QuickCreateClient", () => ({
  QuickCreateClient: () => <div />,
}));
vi.mock("@/components/ui/StageAssigneeSelect", () => ({ StageAssigneeSelect: () => <div /> }));

const projects = [
  { id: "p1", name: "Site", clientId: "c1", client: { name: "ACME" } },
  { id: "p2", name: "App", clientId: "c1", client: { name: "ACME" } },
];
const templates = [{ id: "t1", name: "Landing", description: null, _count: { stages: 3 } }];

describe("CreateTaskForm — smoke (Radix Select → FormData)", () => {
  it("renders a form that submits projectId, templateId and priority via hidden native selects", async () => {
    let container!: HTMLElement;
    // Wrap in act(): the component fires a getClients() effect on mount.
    await act(async () => {
      ({ container } = render(<CreateTaskForm projects={projects} templates={templates} />));
    });

    const form = container.querySelector("form");
    expect(form, "the create-task <form> should render").toBeTruthy();

    // Radix Select emits a hidden native <select name=...> for form submission.
    for (const name of ["projectId", "templateId", "priority"]) {
      const nativeSelect = container.querySelector(`select[name="${name}"]`);
      expect(
        nativeSelect,
        `Radix Select "${name}" must render a hidden native <select> so the server action receives it`
      ).toBeTruthy();
    }

    // priority defaults to MEDIUM — the submitted value must reflect that.
    const priority = container.querySelector<HTMLSelectElement>('select[name="priority"]');
    expect(priority?.value).toBe("MEDIUM");

    // Text fields still submit under their names.
    expect(container.querySelector('input[name="title"]')).toBeTruthy();
    expect(container.querySelector('textarea[name="description"]')).toBeTruthy();
    expect(container.querySelector('input[name="dueDate"]')).toBeTruthy();
  });
});
