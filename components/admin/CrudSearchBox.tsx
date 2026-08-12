"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";

/**
 * Busca da lista CRUD. O termo vive na URL (`?q=`), não em estado local: o
 * filtro é feito no banco, então a lista funciona com qualquer tamanho de base e
 * o resultado é compartilhável/recarregável.
 *
 * Debounce de 300ms porque cada mudança de `?q=` é uma navegação — digitar
 * "cliente" sem ele dispararia sete consultas. `replace: true` evita entupir o
 * histórico com um passo por letra.
 */
export function CrudSearchBox({
  initialValue,
  placeholder,
  clearLabel,
}: {
  initialValue: string;
  placeholder: string;
  clearLabel: string;
}) {
  const { setParam } = useUrlFilters({ replace: true });
  const [value, setValue] = useState(initialValue);

  // Ressincroniza quando a URL muda por fora (voltar/avançar do navegador).
  useEffect(() => setValue(initialValue), [initialValue]);

  useEffect(() => {
    if (value === initialValue) return;
    const id = setTimeout(() => setParam("q", value.trim() || null), 300);
    return () => clearTimeout(id);
    // setParam é estável (useUrlFilters); initialValue entra só como baseline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded-lg border-2 border-input-border bg-input pl-9 pr-9 text-sm font-medium text-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 sm:w-72"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label={clearLabel}
          title={clearLabel}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
