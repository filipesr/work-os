import { z } from "zod";

// ========== Reporting filters ==========
// Read-only reporting surfaces (lib/actions/reporting.ts) validate their inputs
// with these before building Prisma where-clauses. Unknown keys are stripped by
// default; dates must be real Date instances (Next.js preserves Date across the
// server-action boundary).

export const productivityFiltersSchema = z.object({
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  projectId: z.string().optional(),
  userId: z.string().optional(),
  clientId: z.string().optional(),
  teamId: z.string().optional(),
});

export const performanceFiltersSchema = z.object({
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  templateId: z.string().optional(),
  projectId: z.string().optional(),
  clientId: z.string().optional(),
  teamId: z.string().optional(),
});

export const calendarFiltersSchema = z.object({
  weekStart: z.date(),
  weekEnd: z.date(),
  teamId: z.string().optional(),
  projectId: z.string().optional(),
  userId: z.string().optional(),
  showCompleted: z.boolean().optional(),
});

export const startEndRangeSchema = z.object({
  start: z.date(),
  end: z.date(),
});

export const periodRangeSchema = z.object({
  from: z.date(),
  to: z.date(),
});

export const createTaskSchema = z.object({
  title: z.string().min(1, "Task title is required").max(200),
  description: z.string().max(5000).optional().default(""),
  projectId: z.string().min(1, "Project is required"),
  templateId: z.string().min(1, "Workflow template is required"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  dueDate: z.string().optional().default(""),
});

export const createClientSchema = z.object({
  name: z.string().min(1, "Nome do cliente é obrigatório").max(200),
  description: z.string().max(2000).optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
});

export const createProjectSchema = z.object({
  name: z.string().min(1, "Nome do projeto é obrigatório").max(200),
  description: z.string().max(2000).optional(),
  clientId: z.string().min(1, "Cliente é obrigatório"),
});

export const workflowTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required").max(200),
  description: z.string().max(2000).optional().default(""),
});

export const templateStageSchema = z.object({
  name: z.string().min(1, "Stage name is required").max(200),
  order: z.coerce
    .number({ error: "Valid order number is required" })
    .int("Valid order number is required"),
  defaultTeamId: z.string().optional(),
  // Optional SLA target in hours. Empty form values normalize to undefined.
  expectedDurationHours: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().int("Valid hours required").min(0).optional()
  ),
  dependencies: z.array(z.string()).optional().default([]),
});

export const stageDependenciesSchema = z.object({
  stageId: z.string().min(1, "Stage is required"),
  templateId: z.string().min(1, "Template is required"),
  newDependsOnStageIds: z.array(z.string()),
});
