import { type ReactNode } from "react";

/**
 * Micro-label de campo em maiúsculas (linguagem "nexo v2"), com asterisco de
 * obrigatório em tom `danger`. Padrão para labels de formulário.
 */
export function FieldLabel({
  htmlFor,
  required = false,
  className = "",
  children,
}: {
  htmlFor?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={`mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground ${className}`}
    >
      {children}
      {required && <span className="ml-1 text-danger">*</span>}
    </label>
  );
}
