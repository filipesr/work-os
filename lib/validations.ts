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
