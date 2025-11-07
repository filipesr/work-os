"use client";

import { useState } from "react";
import { TemplateStage } from "@prisma/client";
import { MoreVertical, CheckCircle2, Undo2, XCircle, UserMinus, Clock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu-radix";
import { Button } from "@/components/ui/button";
import { AdvanceStageButton } from "./AdvanceStageButton";
import { RevertStageButton } from "./RevertStageButton";
import { CompleteTaskButton } from "./CompleteTaskButton";
import { UnassignTaskButton } from "./UnassignTaskButton";
import { LogTimeButton } from "./LogTimeButton";
import { useTranslations } from "next-intl";

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
  const [showAdvance, setShowAdvance] = useState(false);
  const [showRevert, setShowRevert] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [showUnassign, setShowUnassign] = useState(false);
  const [showLogTime, setShowLogTime] = useState(false);
  const t = useTranslations("tasks.actions");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="w-full">
            <MoreVertical className="h-4 w-4 mr-2" />
            {t("menu")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 bg-background">
          {currentStageId && (
            <>
              <DropdownMenuItem onClick={() => setShowAdvance(true)}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {t("completeStage")}
              </DropdownMenuItem>
              {previousStages.length > 0 && (
                <DropdownMenuItem onClick={() => setShowRevert(true)}>
                  <Undo2 className="h-4 w-4 mr-2" />
                  {t("revertStage")}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={() => setShowComplete(true)}>
            <XCircle className="h-4 w-4 mr-2" />
            {taskStatus === "COMPLETED" ? t("reopenTask") : t("completeTask")}
          </DropdownMenuItem>
          {currentAssignee && (
            <DropdownMenuItem onClick={() => setShowUnassign(true)}>
              <UserMinus className="h-4 w-4 mr-2" />
              {t("unassignTask")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowLogTime(true)}>
            <Clock className="h-4 w-4 mr-2" />
            {t("logTime")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Modal components controlled by menu */}
      <AdvanceStageButton
        taskId={taskId}
        currentStageId={currentStageId}
        open={showAdvance}
        onOpenChange={setShowAdvance}
      />
      <RevertStageButton
        taskId={taskId}
        previousStages={previousStages}
        open={showRevert}
        onOpenChange={setShowRevert}
      />
      <CompleteTaskButton
        taskId={taskId}
        taskStatus={taskStatus}
        open={showComplete}
        onOpenChange={setShowComplete}
      />
      {currentAssignee && (
        <UnassignTaskButton
          taskId={taskId}
          currentAssignee={currentAssignee}
          open={showUnassign}
          onOpenChange={setShowUnassign}
        />
      )}
      <LogTimeButton
        taskId={taskId}
        open={showLogTime}
        onOpenChange={setShowLogTime}
      />
    </>
  );
}
