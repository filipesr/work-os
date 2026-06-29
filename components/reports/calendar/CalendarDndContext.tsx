"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { rescheduleTask } from "@/lib/actions/calendar";
import { useMounted } from "@/lib/hooks/useMounted";

/**
 * Client boundary that powers drag-and-drop rescheduling on the calendar Gantt.
 * Wraps the (server-rendered) grid; drop targets are the day columns
 * (`day:<index>`) and draggables are task bars (id = taskId). On drop the new
 * due date is derived from `dayDates[index]` and persisted via rescheduleTask.
 *
 * PointerSensor uses an 8px activation distance so a plain click still follows
 * the task-bar link; only a real drag triggers a reschedule.
 */
export function CalendarDndContext({
  dayDates,
  children,
}: {
  dayDates: string[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const mounted = useMounted();
  const [, startTransition] = useTransition();
  const t = useTranslations("reportsCalendar.dnd");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const onDragEnd = (event: DragEndEvent) => {
    const over = event.over?.id;
    if (!over) return;
    const match = /^day:(\d+)$/.exec(String(over));
    if (!match) return;
    const iso = dayDates[Number(match[1])];
    if (!iso) return;

    const taskId = String(event.active.id);
    startTransition(async () => {
      const res = await rescheduleTask({ taskId, dueDate: iso });
      if (res?.success) {
        toast.success(t("rescheduled"));
        router.refresh();
      } else {
        toast.error(res?.error || t("error"));
      }
    });
  };

  // Defer the DndContext (and its generated accessibility DOM) to the client so
  // SSR and the first client render match — avoids the dnd-kit hydration warning.
  if (!mounted) return <>{children}</>;

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      {children}
    </DndContext>
  );
}
