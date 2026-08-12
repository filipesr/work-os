import { type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { CrudSearchBox } from "@/components/admin/CrudSearchBox";

/**
 * Lista CRUD simples e canônica (§3.2 UNIFICAR): PageHeader + formulário de
 * criação + lista de itens (link + meta + ações opcionais). Usada por
 * `/admin/clients`, `/admin/teams` e `/admin/templates`, que antes reimplementavam
 * o mesmo layout três vezes. Presentacional (server) — recebe a server action de
 * criação e as ações por item (ex.: botão de excluir) já montadas pelo chamador.
 */

export interface CrudField {
  name: string;
  placeholder: string;
  label?: string;
  type?: "text" | "textarea";
  required?: boolean;
}

export interface CrudItem {
  id: string;
  href: string;
  title: string;
  /** Texto/valor à direita (ex.: "3 projetos"). */
  meta?: ReactNode;
  /** Linha secundária abaixo do título (ex.: descrição do template). */
  description?: ReactNode;
  /** Ações por item (ex.: botão de excluir). */
  actions?: ReactNode;
}

interface SimpleEntityCrudListProps {
  kicker?: string;
  title: string;
  subtitle?: string;
  createTitle: string;
  createAction: (formData: FormData) => void | Promise<void>;
  createFields: CrudField[];
  createButtonLabel: string;
  items: CrudItem[];
  emptyLabel: string;
  emptyIcon: LucideIcon;
  /** Busca opcional sobre a lista. O FILTRO é do chamador (no banco, via `?q=`);
   *  aqui só mora o campo. Omitir = lista sem busca, como antes. */
  search?: {
    /** Termo atual, para o campo refletir a URL. */
    value: string;
    placeholder: string;
    clearLabel: string;
    /** Texto do vazio quando a busca não achou nada — diferente de "não há
     *  nenhum cliente ainda", que é `emptyLabel`. Confundir os dois faz o
     *  usuário achar que apagou a base. */
    noResultsLabel: string;
  };
}

export function SimpleEntityCrudList({
  kicker,
  title,
  subtitle,
  createTitle,
  createAction,
  createFields,
  createButtonLabel,
  items,
  emptyLabel,
  emptyIcon,
  search,
}: SimpleEntityCrudListProps) {
  // Uma linha só (um campo de texto) → layout inline; senão, empilhado.
  const inline = createFields.length === 1 && (createFields[0].type ?? "text") === "text";

  const inputClass =
    "h-11 w-full rounded-lg border border-border bg-input px-4 py-2.5 text-base font-medium text-foreground placeholder:text-muted-foreground transition-all focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10";
  const buttonClass =
    "inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-primary px-6 font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader kicker={kicker} title={title} subtitle={subtitle} />

      {/* Create form */}
      <SectionCard title={createTitle} className="mb-6">
        <form
          action={createAction}
          className={inline ? "flex flex-col gap-3 sm:flex-row sm:items-center" : "space-y-4"}
        >
          {createFields.map((field) => (
            <div key={field.name} className={inline ? "flex-1" : ""}>
              {field.label && (
                <FieldLabel htmlFor={field.name} required={field.required}>
                  {field.label}
                </FieldLabel>
              )}
              {field.type === "textarea" ? (
                <textarea
                  id={field.name}
                  name={field.name}
                  required={field.required}
                  rows={3}
                  placeholder={field.placeholder}
                  className={`${inputClass} min-h-[100px] resize-none py-2.5`}
                />
              ) : (
                <input
                  type="text"
                  id={field.name}
                  name={field.name}
                  required={field.required}
                  placeholder={field.placeholder}
                  className={inputClass}
                />
              )}
            </div>
          ))}
          <button type="submit" className={buttonClass}>
            {createButtonLabel}
          </button>
        </form>
      </SectionCard>

      {search && (
        <div className="mb-4 flex justify-end">
          <CrudSearchBox
            initialValue={search.value}
            placeholder={search.placeholder}
            clearLabel={search.clearLabel}
          />
        </div>
      )}

      {/* List */}
      {items.length === 0 ? (
        <EmptyState
          variant="card"
          icon={emptyIcon}
          title={title}
          description={search && search.value ? search.noResultsLabel : emptyLabel}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-accent"
              >
                <Link href={item.href} className="group flex min-w-0 flex-1 items-center gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-primary transition-colors group-hover:text-primary/80">
                      {item.title}
                    </p>
                    {item.description && (
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {item.description}
                      </p>
                    )}
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-4">
                  {item.meta != null && (
                    <span className="text-sm text-muted-foreground">{item.meta}</span>
                  )}
                  {item.actions}
                  <ChevronRight className="h-4 w-4 text-muted-foreground/60" aria-hidden="true" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
