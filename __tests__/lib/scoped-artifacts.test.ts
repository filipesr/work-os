import { describe, it, expect } from "vitest";
import { scopedLinkArtifactSchema } from "@/lib/validations";

const base = {
  title: "Brand guidelines",
  url: "https://drive.google.com/brand",
  type: "DOCUMENT" as const,
};

describe("scopedLinkArtifactSchema — scope owner invariant", () => {
  it("accepts a TASK-scoped artifact with only taskId", () => {
    const result = scopedLinkArtifactSchema.safeParse({
      ...base,
      scope: "TASK",
      taskId: "task-1",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a PROJECT-scoped artifact with only projectId", () => {
    const result = scopedLinkArtifactSchema.safeParse({
      ...base,
      scope: "PROJECT",
      projectId: "proj-1",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a CLIENT-scoped artifact with only clientId", () => {
    const result = scopedLinkArtifactSchema.safeParse({
      ...base,
      scope: "CLIENT",
      clientId: "client-1",
    });
    expect(result.success).toBe(true);
  });

  it("defaults type to OTHER when omitted", () => {
    const result = scopedLinkArtifactSchema.safeParse({
      title: base.title,
      url: base.url,
      scope: "PROJECT",
      projectId: "proj-1",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("OTHER");
    }
  });

  it("rejects an artifact with zero owners", () => {
    const result = scopedLinkArtifactSchema.safeParse({
      ...base,
      scope: "PROJECT",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an artifact with more than one owner", () => {
    const result = scopedLinkArtifactSchema.safeParse({
      ...base,
      scope: "PROJECT",
      projectId: "proj-1",
      clientId: "client-1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an owner that does not match the scope (PROJECT scope with taskId)", () => {
    const result = scopedLinkArtifactSchema.safeParse({
      ...base,
      scope: "PROJECT",
      taskId: "task-1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a TASK scope carrying projectId as well", () => {
    const result = scopedLinkArtifactSchema.safeParse({
      ...base,
      scope: "TASK",
      taskId: "task-1",
      projectId: "proj-1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid url", () => {
    const result = scopedLinkArtifactSchema.safeParse({
      ...base,
      url: "not-a-url",
      scope: "CLIENT",
      clientId: "client-1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty title", () => {
    const result = scopedLinkArtifactSchema.safeParse({
      ...base,
      title: "",
      scope: "CLIENT",
      clientId: "client-1",
    });
    expect(result.success).toBe(false);
  });
});
