import { describe, it, expect } from "vitest";
import { parseRichText, type BlockNode, type InlineNode } from "@/lib/markdown/parse";

/** Texto plano de uma árvore, para asserções curtas sobre o que sobrou legível. */
function plano(nodes: InlineNode[]): string {
  return nodes
    .map((n) =>
      n.kind === "text" ? n.text : n.kind === "mention" ? n.label : plano(n.children ?? [])
    )
    .join("");
}
const p = (b: BlockNode) =>
  b.kind === "paragraph" || b.kind === "heading" ? plano(b.children) : "";

describe("parseRichText — blocos", () => {
  it("linha em branco separa parágrafos; quebra simples fica DENTRO do parágrafo", () => {
    // As duas coisas são diferentes e o acervo usa as duas: a linha em branco separa assunto, a
    // quebra simples é a lista informal que a pessoa escreveu sem marcador.
    const r = parseRichText("primeira\nsegunda\n\nterceira");
    expect(r).toHaveLength(2);
    expect(r[0].kind).toBe("paragraph");
    expect(p(r[0])).toBe("primeira\nsegunda");
    expect(p(r[1])).toBe("terceira");
  });

  it("texto vazio ou só espaços não vira bloco nenhum", () => {
    expect(parseRichText("")).toEqual([]);
    expect(parseRichText("   \n\n  ")).toEqual([]);
  });

  it("cabeçalho vira heading com o nível certo", () => {
    const r = parseRichText("## Tamanhos");
    expect(r[0]).toMatchObject({ kind: "heading", level: 2 });
    expect(p(r[0])).toBe("Tamanhos");
  });

  it("lista com - ou * vira lista; os marcadores somem do texto", () => {
    const r = parseRichText("- um\n- dois");
    expect(r[0].kind).toBe("list");
    const l = r[0] as Extract<BlockNode, { kind: "list" }>;
    expect(l.ordered).toBe(false);
    expect(l.items.map(plano)).toEqual(["um", "dois"]);
  });

  it("lista numerada é reconhecida como ordenada", () => {
    const r = parseRichText("1. um\n2. dois");
    const l = r[0] as Extract<BlockNode, { kind: "list" }>;
    expect(l.kind).toBe("list");
    expect(l.ordered).toBe(true);
    expect(l.items.map(plano)).toEqual(["um", "dois"]);
  });
});

describe("parseRichText — ênfase", () => {
  it("negrito: o caso mais comum do acervo (68 de 101 descrições)", () => {
    const r = parseRichText("**Texto en pantalla:**");
    expect(r[0]).toMatchObject({ kind: "paragraph" });
    const [n] = (r[0] as Extract<BlockNode, { kind: "paragraph" }>).children;
    expect(n.kind).toBe("strong");
    expect(plano([n])).toBe("Texto en pantalla:");
  });

  it("itálico envolvendo negrito, como o Trello escreve", () => {
    // `_**Políticas adjuntadas en archivos**_` é literal do acervo.
    const r = parseRichText("_**Políticas adjuntadas**_");
    const [n] = (r[0] as Extract<BlockNode, { kind: "paragraph" }>).children;
    expect(n.kind).toBe("em");
    expect(n.kind === "em" && n.children[0].kind).toBe("strong");
    expect(plano([n])).toBe("Políticas adjuntadas");
  });

  it("riscado ~~x~~", () => {
    const r = parseRichText("~~cancelado~~");
    expect((r[0] as Extract<BlockNode, { kind: "paragraph" }>).children[0].kind).toBe("strike");
  });

  it("[CRÍTICO] sublinhado DENTRO de palavra não é itálico — senão quebra URL", () => {
    // 17 das 101 descrições têm isto, e são URLs e nomes de arquivo:
    // `utm_source=...`, `Imagen_de_WhatsApp_2025`. Tratar como itálico comeria os sublinhados e
    // deixaria o link irreconhecível — um defeito pior que o `_` aparecendo cru.
    const r = parseRichText("veja utm_source_x e arquivo_final_v2 aqui");
    expect(p(r[0])).toBe("veja utm_source_x e arquivo_final_v2 aqui");
    expect(
      (r[0] as Extract<BlockNode, { kind: "paragraph" }>).children.every((n) => n.kind === "text")
    ).toBe(true);
  });

  it("marcador sem par fica literal — não engole o resto do texto", () => {
    // Uma pessoa escrevendo "custo ** 2" não pode ver metade do parágrafo virar negrito.
    expect(p(parseRichText("custo ** 2 reais")[0])).toBe("custo ** 2 reais");
    expect(p(parseRichText("ficou _incompleto")[0])).toBe("ficou _incompleto");
  });

  it("escape \\_ e \\* devolvem o caractere literal", () => {
    // O Trello escapa sublinhado ao exportar: `Imagen\_de\_WhatsApp`.
    expect(p(parseRichText("Imagen\\_de\\_WhatsApp")[0])).toBe("Imagen_de_WhatsApp");
    expect(p(parseRichText("2 \\* 3")[0])).toBe("2 * 3");
  });
});

describe("parseRichText — links", () => {
  it("link markdown vira link com o texto visível", () => {
    const r = parseRichText("veja [o manual](https://exemplo.com/a.pdf)");
    const nodes = (r[0] as Extract<BlockNode, { kind: "paragraph" }>).children;
    const link = nodes.find((n) => n.kind === "link")!;
    expect(link).toMatchObject({ kind: "link", href: "https://exemplo.com/a.pdf" });
    expect(plano([link])).toBe("o manual");
  });

  it("URL nua também vira link, e o texto é a própria URL", () => {
    const r = parseRichText("fonte: https://instagram.com/reel/DZNkGg9t34e/?utm_source=x");
    const link = (r[0] as Extract<BlockNode, { kind: "paragraph" }>).children.find(
      (n) => n.kind === "link"
    )!;
    expect(link).toMatchObject({
      kind: "link",
      href: "https://instagram.com/reel/DZNkGg9t34e/?utm_source=x",
    });
  });

  it("[CRÍTICO] imagem vira LINK, não <img> — a CSP do projeto bloquearia a externa", () => {
    // `img-src 'self' data: lh3.googleusercontent.com` (middleware.ts). Uma <img> para host de
    // fora não carregaria, e o usuário veria um quadro quebrado em vez do endereço clicável.
    const r = parseRichText("![Imagen de WhatsApp](https://cdn.externo.com/a.png)");
    const nodes = (r[0] as Extract<BlockNode, { kind: "paragraph" }>).children;
    expect(nodes.some((n) => n.kind === "link")).toBe(true);
    expect(nodes.some((n) => (n as { kind: string }).kind === "image")).toBe(false);
  });

  it("[CRÍTICO] link com TÍTULO entre aspas — é como o Trello escreve", () => {
    // `[texto](url "smartCard-inline")` é o formato de 50 dos links do acervo, em 26 das 101
    // descrições. Sem aceitar o título, o link inteiro falhava em virar link: sobrava o colchete
    // na tela e a URL aparecia crua ao lado. A maior parte dos links do acervo é assim.
    const r = parseRichText(
      'veja [a campanha](https://trello.com/c/yFFk5wpF/958-crear "smartCard-inline")'
    );
    const nodes = (r[0] as Extract<BlockNode, { kind: "paragraph" }>).children;
    const link = nodes.find((n) => n.kind === "link")!;
    expect(link).toMatchObject({
      kind: "link",
      href: "https://trello.com/c/yFFk5wpF/958-crear",
    });
    expect(plano([link])).toBe("a campanha");
    // e o colchete não sobra como texto
    expect(p(r[0])).toBe("veja a campanha");
  });

  it("[CRÍTICO] o rótulo do link também é interpretado — escapes inclusive", () => {
    // O Trello escapa o sublinhado DENTRO do alt da imagem:
    // `![Imagen\_de\_WhatsApp\_2025](url)`. Sem interpretar o rótulo, a barra invertida vazava
    // para a tela — que é o defeito que a exibição existe para consertar, reaparecendo por dentro.
    const r = parseRichText("![Imagen\\_de\\_WhatsApp](https://cdn.externo.com/a.png)");
    const link = (r[0] as Extract<BlockNode, { kind: "paragraph" }>).children.find(
      (n) => n.kind === "link"
    )!;
    expect(plano([link])).toBe("Imagen_de_WhatsApp");
  });

  it("link sem rótulo mostra a URL, e NÃO vira link dentro de link", () => {
    const r = parseRichText("[](https://exemplo.com/a.pdf)");
    const nodes = (r[0] as Extract<BlockNode, { kind: "paragraph" }>).children;
    const link = nodes.find((n) => n.kind === "link")!;
    expect(plano([link])).toBe("https://exemplo.com/a.pdf");
    // o filho é TEXTO, não outro link
    expect(link.kind === "link" && link.children.every((n) => n.kind === "text")).toBe(true);
  });

  it("[CRÍTICO] só http e https viram link", () => {
    // `javascript:` num href é execução de script por um texto que veio de fora. O parser nem
    // cria o nó: fica texto.
    const r = parseRichText("[clique](javascript:alert(1))");
    expect(
      (r[0] as Extract<BlockNode, { kind: "paragraph" }>).children.every((n) => n.kind === "text")
    ).toBe(true);
    expect(p(r[0])).toContain("clique");
  });
});

describe("parseRichText — menções do Trello", () => {
  it("troca @:id pelo nome de quem o mapa conhece", () => {
    const r = parseRichText("@:68aef51ab9e00a18d1fce85c estamos esperando a medida", {
      mentionNames: { "68aef51ab9e00a18d1fce85c": "Sara Goon" },
    });
    const m = (r[0] as Extract<BlockNode, { kind: "paragraph" }>).children.find(
      (n) => n.kind === "mention"
    )!;
    expect(m).toMatchObject({ kind: "mention", label: "@Sara Goon" });
    expect(p(r[0])).toBe("@Sara Goon estamos esperando a medida");
  });

  it("id desconhecido continua menção, mas sem inventar nome", () => {
    // O id cru não diz nada a ninguém; mostrar um rótulo genérico é melhor que 24 caracteres de
    // hexadecimal no meio da frase. E NÃO se inventa um nome que não se sabe.
    const r = parseRichText("@:deadbeefdeadbeefdeadbeef pode ver?");
    const m = (r[0] as Extract<BlockNode, { kind: "paragraph" }>).children.find(
      (n) => n.kind === "mention"
    )!;
    expect(m.kind).toBe("mention");
    expect(m.label).not.toContain("deadbeef");
  });
});
