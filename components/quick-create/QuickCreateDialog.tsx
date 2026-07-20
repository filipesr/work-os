"use client";

import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface QuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  onSubmit: (e: React.FormEvent) => void;
  /** Trigger button styling. */
  variant?: "default" | "outline" | "ghost" | "secondary" | "destructive";
  size?: "default" | "sm" | "lg";
  className?: string;
  buttonLabel: string;
  /** Ícone exibido no título do dialog. */
  icon: ReactNode;
  title: string;
  description: string;
  cancelLabel: string;
  createLabel: string;
  creatingLabel: string;
  /** Condição extra (além de `isPending`) para desabilitar o submit. */
  submitDisabled?: boolean;
  children: ReactNode;
}

/**
 * Shared chrome for the quick-create dialogs (trigger, header, footer).
 * Cada tela injeta seus campos via `children`.
 */
export function QuickCreateDialog({
  open,
  onOpenChange,
  isPending,
  onSubmit,
  variant = "outline",
  size = "sm",
  className,
  buttonLabel,
  icon,
  title,
  description,
  cancelLabel,
  createLabel,
  creatingLabel,
  submitDisabled = false,
  children,
}: QuickCreateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <Plus className="h-4 w-4 mr-2" />
          {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {icon}
              {title}
            </DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">{children}</div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {cancelLabel}
            </Button>
            <Button type="submit" disabled={isPending || submitDisabled}>
              {isPending ? creatingLabel : createLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
