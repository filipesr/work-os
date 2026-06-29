"use client";

import { useDroppable } from "@dnd-kit/core";
import { useMounted } from "@/lib/hooks/useMounted";

/**
 * Seven absolutely-positioned droppable day columns overlaid on a lane. Used as
 * drop targets for DraggableBar. The cells are pointer-events-none so they never
 * intercept clicks on the task-bar links — dnd-kit detects drops via bounding
 * rects, independent of pointer events.
 */
function DropCell({ index }: { index: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${index}` });
  return (
    <div
      ref={setNodeRef}
      className={isOver ? "bg-primary/15 transition-colors" : "transition-colors"}
      aria-hidden="true"
    />
  );
}

export function DayDropZones() {
  const mounted = useMounted();
  return (
    <div
      className="absolute inset-0 grid pointer-events-none"
      style={{ gridTemplateColumns: "repeat(7, 1fr)" }}
      aria-hidden="true"
    >
      {Array.from({ length: 7 }, (_, i) =>
        mounted ? <DropCell key={i} index={i} /> : <div key={i} />
      )}
    </div>
  );
}
