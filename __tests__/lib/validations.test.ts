import { describe, it, expect } from "vitest";
import {
  createTaskSchema,
  createClientSchema,
  createProjectSchema,
  workflowTemplateSchema,
  templateStageSchema,
  stageDependenciesSchema,
} from "@/lib/validations";

describe("createTaskSchema", () => {
  it("accepts valid task data", () => {
    const result = createTaskSchema.safeParse({
      title: "My Task",
      description: "A description",
      projectId: "proj-123",
      templateId: "tmpl-456",
      priority: "HIGH",
      dueDate: "2026-04-01",
    });
    expect(result.success).toBe(true);
  });

  it("accepts minimal valid data with defaults", () => {
    const result = createTaskSchema.safeParse({
      title: "Task",
      projectId: "proj-123",
      templateId: "tmpl-456",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe("MEDIUM");
      expect(result.data.description).toBe("");
    }
  });

  it("rejects empty title", () => {
    const result = createTaskSchema.safeParse({
      title: "",
      projectId: "proj-123",
      templateId: "tmpl-456",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing projectId", () => {
    const result = createTaskSchema.safeParse({
      title: "Task",
      projectId: "",
      templateId: "tmpl-456",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing templateId", () => {
    const result = createTaskSchema.safeParse({
      title: "Task",
      projectId: "proj-123",
      templateId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid priority", () => {
    const result = createTaskSchema.safeParse({
      title: "Task",
      projectId: "proj-123",
      templateId: "tmpl-456",
      priority: "INVALID",
    });
    expect(result.success).toBe(false);
  });

  it("rejects title exceeding max length", () => {
    const result = createTaskSchema.safeParse({
      title: "a".repeat(201),
      projectId: "proj-123",
      templateId: "tmpl-456",
    });
    expect(result.success).toBe(false);
  });
});

describe("createClientSchema", () => {
  it("accepts valid client data", () => {
    const result = createClientSchema.safeParse({
      name: "Acme Corp",
      description: "A client",
      email: "acme@example.com",
      phone: "+5511999999999",
    });
    expect(result.success).toBe(true);
  });

  it("accepts minimal data (name only)", () => {
    const result = createClientSchema.safeParse({ name: "Client" });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createClientSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = createClientSchema.safeParse({
      name: "Client",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty email string", () => {
    const result = createClientSchema.safeParse({
      name: "Client",
      email: "",
    });
    expect(result.success).toBe(true);
  });
});

describe("createProjectSchema", () => {
  it("accepts valid project data", () => {
    const result = createProjectSchema.safeParse({
      name: "Project X",
      description: "A project",
      clientId: "client-123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createProjectSchema.safeParse({
      name: "",
      clientId: "client-123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing clientId", () => {
    const result = createProjectSchema.safeParse({
      name: "Project",
      clientId: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("workflowTemplateSchema", () => {
  it("accepts valid data and defaults description", () => {
    const result = workflowTemplateSchema.safeParse({ name: "Onboarding" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("");
    }
  });

  it("rejects empty name", () => {
    const result = workflowTemplateSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const result = workflowTemplateSchema.safeParse({ description: "x" });
    expect(result.success).toBe(false);
  });
});

describe("templateStageSchema", () => {
  it("accepts valid data and coerces order from string", () => {
    const result = templateStageSchema.safeParse({
      name: "Design",
      order: "2",
      expectedDurationHours: "8",
      defaultTeamId: "team-1",
      dependencies: ["stage-a", "stage-b"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.order).toBe(2);
    }
  });

  it("defaults dependencies to an empty array", () => {
    const result = templateStageSchema.safeParse({
      name: "QC",
      order: 0,
      expectedDurationHours: 4,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dependencies).toEqual([]);
    }
  });

  it("rejects empty name", () => {
    const result = templateStageSchema.safeParse({ name: "", order: 1 });
    expect(result.success).toBe(false);
  });

  it("rejects non-numeric order", () => {
    const result = templateStageSchema.safeParse({ name: "Design", order: "abc" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing order", () => {
    const result = templateStageSchema.safeParse({ name: "Design" });
    expect(result.success).toBe(false);
  });

  it("exige a previsão de horas", () => {
    // Passou a ser obrigatória porque é somada entre as etapas para calcular o
    // início sugerido de uma demanda. UMA etapa sem previsão invalida a soma do
    // fluxo inteiro — e o cálculo passaria a mentir por omissão, sugerindo um
    // início mais tarde do que a execução realmente exige.
    const semPrevisao = templateStageSchema.safeParse({ name: "Design", order: 1 });
    expect(semPrevisao.success).toBe(false);

    const vazia = templateStageSchema.safeParse({
      name: "Design",
      order: 1,
      expectedDurationHours: "",
    });
    expect(vazia.success).toBe(false);
  });

  it("recusa previsão de zero hora", () => {
    // Etapa que leva zero hora não é etapa — e zero somaria nada, dando o mesmo
    // efeito de não ter previsão, só que sem avisar.
    const result = templateStageSchema.safeParse({
      name: "Design",
      order: 1,
      expectedDurationHours: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("stageDependenciesSchema", () => {
  it("accepts valid ids and an empty dependency list", () => {
    const result = stageDependenciesSchema.safeParse({
      stageId: "stage-1",
      templateId: "tmpl-1",
      newDependsOnStageIds: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty stageId", () => {
    const result = stageDependenciesSchema.safeParse({
      stageId: "",
      templateId: "tmpl-1",
      newDependsOnStageIds: [],
    });
    expect(result.success).toBe(false);
  });
});
