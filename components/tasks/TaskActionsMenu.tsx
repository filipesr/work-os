"use client";

import { TemplateStage } from "@prisma/client";
import { AdvanceStageButton } from "./AdvanceStageButton";
import { RevertStageButton } from "./RevertStageButton";
import { CompleteTaskButton } from "./CompleteTaskButton";
import { UnassignTaskButton } from "./UnassignTaskButton";
import { LogTimeButton } from "./LogTimeButton";

interface TaskActionsMenuProps {
  taskId: string;
  currentStageId: string | null;
  taskStatus: string;
  currentAssignee: string | null;
  previousStages: TemplateStage[];
}

export function TaskActionsMenu({
  taskId,
  currentStageId,
  taskStatus,
  currentAssignee,
  previousStages,
}: TaskActionsMenuProps) {
  return (
    <div className="flex flex-col gap-2">
      {currentStageId && (
        <>
          <AdvanceStageButton
            taskId={taskId}
            currentStageId={currentStageId}
          />
          {previousStages.length > 0 && (
            <RevertStageButton
              taskId={taskId}
              previousStages={previousStages}
            />
          )}
        </>
      )}
      <CompleteTaskButton
        taskId={taskId}
        taskStatus={taskStatus}
      />
      {currentAssignee && (
        <UnassignTaskButton
          taskId={taskId}
          currentAssignee={currentAssignee}
        />
      )}
      <LogTimeButton taskId={taskId} />
    </div>
  );
}
