"use client";

import type { CSSProperties } from "react";
import { useDraggable } from "@dnd-kit/core";
import { useMounted } from "@/lib/hooks/useMounted";

/**
 * Wraps a (server-rendered) task bar to make it draggable. When `gridColumn` is
 * provided the wrapper becomes the grid item (the inner bar must be rendered
 * with `disablePositioning`); otherwise it flows as a normal flex item (used in
 * the no-due-date lane).
 */
export function DraggableBar({
  taskId,
  gridColumn,
  children,
}: {
  taskId: string;
  gridColumn?: { start: number; end: number };
  children: React.ReactNode;
}) {
  const mounted = useMounted();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: taskId });

  const positionStyle: CSSProperties = gridColumn
    ? { gridColumnStart: gridColumn.start, gridColumnEnd: gridColumn.end }
    : {};

  // Until mounted, render the same plain positioned wrapper the server emits —
  // no dnd-kit refs/attributes — so hydration matches. Drag is enabled after.
  if (!mounted) {
    return <div style={positionStyle}>{children}</div>;
  }

  const style: CSSProperties = {
    ...positionStyle,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : undefined,
    zIndex: isDragging ? 50 : undefined,
    cursor: "grab",
    touchAction: "none",
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {children}
    </div>
  );
}
