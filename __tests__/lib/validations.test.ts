import { describe, it, expect } from "vitest";
import { createTaskSchema, createClientSchema, createProjectSchema } from "@/lib/validations";

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
