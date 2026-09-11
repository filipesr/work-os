"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { SlidersHorizontal, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { useStickyFilters } from "@/lib/hooks/useStickyFilters";
import { serializeMultiParam, toggleInMulti } from "@/lib/planning/multi-param";

export interface FilterOption {
  id: string;
  name: string;
}

/**
 * Um campo do diálogo. `param` é o nome do parâmetro na URL — é ele que o servidor lê, e é ele que
 * o armazenamento local guarda.
 */
export type PlanningFilterField =
  /** Escolha de VÁRIOS (pessoas, equipes). Lista vazia é TODOS, nunca NENHUM. */
  | { kind: "multi"; param: string; label: string; options: FilterOption[]; selected: string[] }
  /** Escolha de UM, com a opção "todos" no topo. */
  | {
      kind: "single";
      param: string;
      label: string;
      allLabel: string;
      options: FilterOption[];
      selected?: string;
    }
  /** Liga/desliga. O rótulo é o que a tag mostra quando está ligado. */
  | { kind: "check"; param: string; label: string; checked: boolean };

/**
 * A barra de filtros das telas de planejamento: tags do que está ativo à esquerda, botão que abre o
 * diálogo à direita.
 *
 * **As tags não são enfeite.** Elas são o que impede o pior caso da persistência: sem elas, quem
 * abrisse a tela com um filtro salvo de semanas atrás veria uma grade recortada e acharia que o
 * trabalho sumiu. Por isso toda escolha ativa aparece FORA do diálogo, removível com um clique, e
 * o botão carrega a contagem.
 *
 * Os filtros ficam num diálogo, e não abertos na barra, porque na maior parte do tempo eles dizem
 * "todos / todos / todos" — ocupar a largura da tela para isso é gastar o espaço mais caro da
 * página com a informação menos útil dela.
 */
export function PlanningFilters({
  scope,
  namespace,
  fields,
  extra,
}: {
  /** Identifica a tela no armazenamento local. Por tela: a mesa do gestor e o calendário filtram
   *  coisas diferentes, e herdar o filtro de uma na outra seria surpresa, não conveniência. */
  scope: string;
  /**
   * Namespace de tradução da tela. O componente busca as próprias mensagens porque **função não
   * atravessa a fronteira do servidor para o cliente**: passar `clearOne: (f) => t(...)` como
   * propriedade compila, passa no `next build` e quebra em execução com "Functions cannot be passed
   * directly to Client Components". Teste de componente também não pega — no cliente puro a
   * fronteira não existe. Daí o contrato ser por CHAVE, não por função.
   *
   * As chaves esperadas: `filtersTitle`, `filtersSubtitle`, `clearAll`, `clearOne` (com `{filter}`)
   * e `selectedCount` (com `{label}` e `{count}`).
   */
  namespace: string;
  fields: PlanningFilterField[];
  /** Conteúdo extra dentro do diálogo, abaixo dos campos (ex.: um controle próprio da tela). */
  extra?: ReactNode;
}) {
  const t = useTranslations(namespace);
  const { setParam, setParams } = useUrlFilters({ replace: true });
  const [open, setOpen] = useState(false);

  useStickyFilters(
    scope,
    fields.map((f) => f.param)
  );

  const marcarMulti = (field: Extract<PlanningFilterField, { kind: "multi" }>, id: string) =>
    setParam(field.param, serializeMultiParam(toggleInMulti(field.selected, id)));

  const nomeDe = (options: FilterOption[], id?: string) => options.find((o) => o.id === id)?.name;

  const ativos = fields
    .map((f) => {
      if (f.kind === "multi" && f.selected.length > 0) {
        return {
          param: f.param,
          // Um nome quando é um só; a contagem quando são vários — "Ana, Bruno, Carla, Diego" não
          // cabe numa tag e o excesso viraria reticências que não dizem nada.
          rotulo:
            f.selected.length === 1
              ? (nomeDe(f.options, f.selected[0]) ?? f.label)
              : t("selectedCount", { label: f.label, count: f.selected.length }),
        };
      }
      if (f.kind === "single" && f.selected) {
        return { param: f.param, rotulo: nomeDe(f.options, f.selected) };
      }
      if (f.kind === "check" && f.checked) {
        return { param: f.param, rotulo: f.label };
      }
      return null;
    })
    .filter((x): x is { param: string; rotulo: string } => !!x?.rotulo);

  const limparTudo = () =>
    setParams(Object.fromEntries(fields.map((f) => [f.param, null] as const)));

  const selectClass =
    "h-10 w-full rounded-lg border-2 border-input-border bg-input px-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 transition-colors";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ativos.map((f) => (
        <button
          key={f.param}
          type="button"
          onClick={() => setParam(f.param, null)}
          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
          aria-label={t("clearOne", { filter: f.rotulo })}
        >
          {f.rotulo}
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            {t("filtersTitle")}
            {ativos.length > 0 && (
              <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                {ativos.length}
              </span>
            )}
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{t("filtersTitle")}</DialogTitle>
            <DialogDescription>{t("filtersSubtitle")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {fields.map((field) => {
              if (field.kind === "check") {
                return (
                  <label
                    key={field.param}
                    className="flex items-center gap-2 pt-1 text-sm text-foreground"
                  >
                    <input
                      type="checkbox"
                      checked={field.checked}
                      onChange={() => setParam(field.param, field.checked ? null : "1")}
                    />
                    {field.label}
                  </label>
                );
              }

              if (field.kind === "single") {
                return (
                  <label key={field.param} className="block text-sm">
                    <span className="mb-1.5 block font-medium text-muted-foreground">
                      {field.label}
                    </span>
                    <select
                      className={selectClass}
                      value={field.selected ?? ""}
                      onChange={(e) => setParam(field.param, e.target.value || null)}
                    >
                      <option value="">{field.allLabel}</option>
                      {field.options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }

              return (
                <fieldset key={field.param} className="block text-sm">
                  <legend className="mb-1.5 block font-medium text-muted-foreground">
                    {field.label}
                  </legend>
                  {/* Rolagem própria: a lista de pessoas cresce com a empresa, e um diálogo que
                      passa da altura da tela esconde o botão de fechar. */}
                  <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                    {field.options.map((o) => (
                      <label
                        key={o.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-foreground hover:bg-accent"
                      >
                        <input
                          type="checkbox"
                          checked={field.selected.includes(o.id)}
                          onChange={() => marcarMulti(field, o.id)}
                        />
                        {o.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}

            {extra}
          </div>

          {ativos.length > 0 && (
            <button
              type="button"
              onClick={limparTudo}
              className="text-sm font-medium text-primary transition-colors hover:underline"
            >
              {t("clearAll")}
            </button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
