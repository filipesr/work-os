import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { getNavItems, isNavGroup, stagePath, type AppRole, type NavItem } from "@/lib/navigation";

/**
 * A navegação é a única superfície onde os nomes de todas as telas aparecem
 * lado a lado — e é por isso que ela é o lugar certo para checar que dois
 * lugares diferentes não têm o mesmo nome.
 *
 * O caso concreto: "Cobertura" virou "Demandas" e passou a colidir com o item
 * que já se chamava assim (/admin/tasks). Nada quebrou, nenhum teste falhou; o
 * menu simplesmente passou a ter dois "Demandas" apontando para telas
 * diferentes. Só se percebe lendo o menu inteiro de uma vez, que é exatamente o
 * que um humano não faz ao renomear uma tela.
 */
const PAPEIS: AppRole[] = ["ADMIN", "MANAGER", "SUPERVISOR", "MEMBER"];
const LOCALES = ["pt-BR", "es-ES"];

function carregaNav(locale: string): Record<string, string> {
  const f = path.join(process.cwd(), "locales", locale, "common.json");
  return JSON.parse(fs.readFileSync(f, "utf-8")).nav;
}

/** Achata grupos e links num par [rótulo, destino] por tela visível. */
function telasVisiveis(itens: NavItem[], nav: Record<string, string>) {
  const saida: { label: string; href: string; caminho: string }[] = [];

  for (const item of itens) {
    if (isNavGroup(item)) {
      const grupo = nav[item.labelKey] ?? item.labelKey;
      for (const filho of item.children) {
        saida.push({
          label: nav[filho.labelKey] ?? filho.labelKey,
          href: filho.href,
          caminho: `${grupo} › ${nav[filho.labelKey] ?? filho.labelKey}`,
        });
      }
    } else {
      saida.push({
        label: nav[item.labelKey] ?? item.labelKey,
        href: item.href,
        caminho: nav[item.labelKey] ?? item.labelKey,
      });
    }
  }
  return saida;
}

describe("navegação", () => {
  for (const locale of LOCALES) {
    describe(locale, () => {
      const nav = carregaNav(locale);

      for (const papel of PAPEIS) {
        it(`${papel}: nenhum rótulo se repete apontando para telas diferentes`, () => {
          const telas = telasVisiveis(getNavItems(papel), nav);

          const porRotulo = new Map<string, Set<string>>();
          for (const t of telas) {
            if (!porRotulo.has(t.label)) porRotulo.set(t.label, new Set());
            porRotulo.get(t.label)!.add(t.href);
          }

          // Mesmo rótulo apontando para o MESMO href é atalho deliberado (o
          // dashboard aparece como "Início" e como "Dashboard"), não ambiguidade.
          const ambiguos = [...porRotulo.entries()]
            .filter(([, hrefs]) => hrefs.size > 1)
            .map(([label, hrefs]) => `"${label}" → ${[...hrefs].join(" e ")}`);

          expect(
            ambiguos,
            `Rótulos repetidos em telas diferentes (${papel}/${locale}): ${ambiguos.join("; ")}. ` +
              `No menu isso vira dois itens com o mesmo nome e destinos distintos.`
          ).toEqual([]);
        });
      }

      it("todo labelKey tem tradução", () => {
        // Sem isto, uma chave inexistente cai no próprio nome da chave e o menu
        // mostra "calendarMonthly" para o usuário — falha silenciosa, porque
        // `nav[key] ?? key` não lança.
        const semTraducao = new Set<string>();
        for (const papel of PAPEIS) {
          for (const item of getNavItems(papel)) {
            const chaves = isNavGroup(item)
              ? [item.labelKey, ...item.children.map((c) => c.labelKey)]
              : [item.labelKey];
            for (const k of chaves) if (!(k in nav)) semTraducao.add(k);
          }
        }
        expect([...semTraducao], `Sem tradução em ${locale}`).toEqual([]);
      });
    });
  }

  it("os dois idiomas expõem exatamente as mesmas telas", () => {
    // Um item que só existe num idioma seria menu diferente por idioma — e a
    // paridade de chaves não pega isso, porque o problema estaria na navegação.
    for (const papel of PAPEIS) {
      const hrefs = LOCALES.map((l) =>
        telasVisiveis(getNavItems(papel), carregaNav(l))
          .map((t) => t.href)
          .sort()
      );
      expect(hrefs[0], `menu difere entre idiomas para ${papel}`).toEqual(hrefs[1]);
    }
  });
});

describe("stagePath", () => {
  it("o caminho da etapa é montado num lugar só", () => {
    // Seis telas linkam para a etapa. Seis interpolações à mão divergem no dia em que a rota mudar —
    // e uma delas vai continuar mandando para a demanda sem ninguém notar.
    expect(stagePath("t1", "as2")).toBe("/tasks/t1/stages/as2");
  });
});
