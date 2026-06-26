import { z } from "zod";

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
  dependencies: z.array(z.string()).optional().default([]),
});

export const stageDependenciesSchema = z.object({
  stageId: z.string().min(1, "Stage is required"),
  templateId: z.string().min(1, "Template is required"),
  newDependsOnStageIds: z.array(z.string()),
});
