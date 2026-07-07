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

// ========== NAS artifact upload (spec 2026-07-02) ==========

const artifactMediaTypeEnum = z.enum([
  "VIDEOS",
  "FOTOS",
  "DOCUMENTOS",
  "LOGOS",
  "SOCIAL_MEDIA",
  "OUTROS",
]);
const sensitivityEnum = z.enum(["INTERNO", "CLIENTE", "CONFIDENCIAL"]);

// prepareArtifactUpload — o browser envia os metadados declarados; o servidor calcula o path/nome
// selado e assina o token. Escopo (TASK/PROJECT/CLIENT) + o id do dono correspondente; sem campos de
// campanha (spec 2026-07-06-nas-flow-simplification). mediaType obrigatório; purposeId opcional
// (quando ausente, o nome sai sem o segmento de propósito).
export const prepareArtifactUploadSchema = z
  .object({
    scope: z.enum(["TASK", "PROJECT", "CLIENT"]).default("TASK"),
    taskId: z.string().min(1).optional(),
    projectId: z.string().min(1).optional(),
    clientId: z.string().min(1).optional(),
    mediaType: artifactMediaTypeEnum,
    purposeId: z.string().min(1).optional(),
    sensitivity: sensitivityEnum.default("INTERNO"),
    stageId: z.string().optional(),
    originalFileName: z.string().min(1, "Nome do arquivo é obrigatório").max(255),
    mimeType: z.string().min(1, "MIME é obrigatório").max(255),
    sizeBytes: z.number().int().positive("Tamanho inválido"),
  })
  .refine(
    (d) =>
      (d.scope === "TASK" && !!d.taskId) ||
      (d.scope === "PROJECT" && !!d.projectId) ||
      (d.scope === "CLIENT" && !!d.clientId),
    { message: "Escopo requer o id do dono correspondente.", path: ["scope"] }
  );

// ========== Scoped link artifacts (spec 2026-07-06) ==========
// Artifacts carry a `scope` (TASK / PROJECT / CLIENT). v1 supports LINK artifacts only for the
// PROJECT/CLIENT scopes. The invariant — enforced here in code, not in the DB — is that EXACTLY ONE
// owner id is set and it matches the scope: TASK⇒taskId, PROJECT⇒projectId, CLIENT⇒clientId (the
// other two must be null/absent).

export const artifactScopeEnum = z.enum(["TASK", "PROJECT", "CLIENT"]);

const linkArtifactTypeEnum = z.enum(["DOCUMENT", "IMAGE", "VIDEO", "FIGMA", "OTHER"]);

export const scopedLinkArtifactSchema = z
  .object({
    scope: artifactScopeEnum,
    taskId: z.string().min(1).nullish(),
    projectId: z.string().min(1).nullish(),
    clientId: z.string().min(1).nullish(),
    title: z.string().min(1, "Título do artefato é obrigatório").max(200),
    url: z.string().url("URL inválida"),
    type: linkArtifactTypeEnum.default("OTHER"),
  })
  .refine(
    (data) => {
      const owners = {
        TASK: Boolean(data.taskId),
        PROJECT: Boolean(data.projectId),
        CLIENT: Boolean(data.clientId),
      };
      const setCount = Object.values(owners).filter(Boolean).length;
      // Exactly one owner id, and it must be the one implied by `scope`.
      return setCount === 1 && owners[data.scope];
    },
    {
      message:
        "Exatamente um dono deve ser informado e corresponder ao escopo (TASK⇒taskId, PROJECT⇒projectId, CLIENT⇒clientId).",
      path: ["scope"],
    }
  );

export type ScopedLinkArtifactInput = z.infer<typeof scopedLinkArtifactSchema>;

export const createShareLinkSchema = z.object({
  artifactId: z.string().min(1),
  password: z.string().min(4).max(200).optional(),
  expiresInDays: z.number().int().min(1).max(30).default(7),
  maxDownloads: z.number().int().positive().optional(),
  note: z.string().max(500).optional(),
});

export const changeSensitivitySchema = z.object({
  artifactId: z.string().min(1),
  sensitivity: sensitivityEnum,
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
  // Etapa opcional: aparece desmarcada na criação da tarefa. Checkbox → "on"/ausente.
  optional: z.preprocess((v) => v === "on" || v === true, z.boolean()).default(false),
  dependencies: z.array(z.string()).optional().default([]),
});

export const stageDependenciesSchema = z.object({
  stageId: z.string().min(1, "Stage is required"),
  templateId: z.string().min(1, "Template is required"),
  newDependsOnStageIds: z.array(z.string()),
});
