"use client";

import { useState, useEffect } from "react";
import {
  previewNextStages,
  getTeamMembers,
  type PreviewStage,
} from "@/lib/actions/stage-assignment";

type Member = { id: string; name: string | null; email: string | null };
type MembersByStage = Record<string, Member[]>;

type PreviewData = {
  activated: PreviewStage[];
  blocked: PreviewStage[];
};

/**
 * Loads the next-stage preview (activated + blocked stages) and their team
 * members when `isOpen` becomes true, pre-filling assignments with each
 * stage's already-assigned responsible when that user is still in the team.
 *
 * Fetching is cancelled on unmount/close — no state is written after that.
 */
export function useNextStagePreview(
  taskId: string,
  currentStageId: string | null,
  isOpen: boolean
) {
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [membersByStage, setMembersByStage] = useState<MembersByStage>({});
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen || !currentStageId) return;

    let cancelled = false;
    setLoading(true);
    setPreviewData(null);
    setAssignments({});
    setMembersByStage({});

    (async () => {
      try {
        const result = await previewNextStages(taskId, currentStageId);
        if (cancelled) return;

        const allStages = [...result.activated, ...result.blocked];
        const stagesWithTeam = allStages.filter((s) => s.defaultTeamId !== null);

        const memberResults = await Promise.all(
          stagesWithTeam.map(async (s) => ({
            stageId: s.id,
            members: await getTeamMembers(s.defaultTeamId as string),
          }))
        );

        if (cancelled) return;

        const newMembersByStage: MembersByStage = {};
        for (const { stageId, members } of memberResults) {
          newMembersByStage[stageId] = members;
        }

        // Pre-fill with each stage's already-assigned responsible (set at
        // creation), but only when that user is still in the stage's team.
        const initialAssignments: Record<string, string> = {};
        for (const s of allStages) {
          if (!s.assigneeId) continue;
          const inTeam = newMembersByStage[s.id]?.some((m) => m.id === s.assigneeId);
          if (inTeam) initialAssignments[s.id] = s.assigneeId;
        }

        setPreviewData(result);
        setMembersByStage(newMembersByStage);
        setAssignments(initialAssignments);
      } catch {
        // fail silently — the user can still confirm without assignments
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, taskId, currentStageId]);

  const setAssignment = (stageId: string, userId: string) => {
    setAssignments((prev) => {
      const next = { ...prev };
      if (userId) {
        next[stageId] = userId;
      } else {
        delete next[stageId];
      }
      return next;
    });
  };

  return { previewData, membersByStage, assignments, setAssignment, loading };
}
