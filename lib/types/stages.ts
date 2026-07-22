// Shared workflow-stage types used by the admin template editor
// (StagesList, StageEditForm, WorkflowVisualization) and the task timeline
// (StageWorkflowVisualization). Pure type module — no runtime, no behavior.

/** Minimal reference to a stage (used in dependency edges and stage logs). */
export interface StageRef {
  id: string;
  name: string;
  order: number;
}

/** Minimal reference to a team. */
export interface StageTeamRef {
  id: string;
  name: string;
}

/** A dependency edge between two template stages. */
export interface StageDependency {
  id: string;
  stageId: string;
  stage: StageRef;
  dependsOnStageId: string;
  dependsOn: StageRef;
}

/**
 * A workflow-template stage with its dependency edges and default team.
 * Superset of the shapes previously duplicated in StagesList and
 * WorkflowVisualization (components that only read a subset of these fields).
 */
export interface Stage {
  id: string;
  name: string;
  order: number;
  expectedDurationHours: number | null;
  wipLimit: number | null;
  defaultTeamId: string | null;
  optional: boolean;
  defaultTeam: StageTeamRef | null;
  dependencies: StageDependency[];
  dependents: StageDependency[];
}
