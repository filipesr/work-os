"use client";

import { useCallback, useState } from "react";

/**
 * Hook para o padrão "aberto controlado ou não-controlado" usado nos botões
 * de ação (CompleteTaskButton, UnassignTaskButton, etc). Se `controlledOpen`
 * for definido, o pai controla o estado (via `onOpenChange`); caso contrário
 * o estado é interno.
 */
export function useControllableOpen(
  controlledOpen?: boolean,
  onOpenChange?: (open: boolean) => void
) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const setOpen = useCallback(
    (value: boolean) => {
      if (onOpenChange) onOpenChange(value);
      if (!isControlled) setInternalOpen(value);
    },
    [isControlled, onOpenChange]
  );

  return { open, setOpen, isControlled };
}
