/**
 * Um markdown pequeno, do tamanho do que o acervo realmente usa.
 *
 * O texto das descrições veio do Trello, que escreve markdown — e a tela o mostrava como
 * código-fonte: `**Texto en pantalla:**` aparecia com os asteriscos. Medido em 14/set sobre as 101
 * descrições importadas, o que existe é isto, e é isto que o parser cobre:
 *
 *   negrito 68 · link 28 · URL nua 28 · itálico 18 · lista 13 · cabeçalho 5 · riscado 5 · imagem 2
 *
 * **Por que não uma biblioteca.** Markdown completo traz tabelas, blocos de código e HTML embutido —
 * nada disso aparece no acervo, e o HTML embutido é justamente a porta que obrigaria a sanitizar.
 * Este parser devolve uma ÁRVORE DE DADOS, não HTML: quem renderiza monta elementos React a partir
 * dela, então não existe `dangerouslySetInnerHTML` em lugar nenhum e não há o que sanitizar.
 *
 * **Por que conservador.** O texto não foi todo escrito como markdown — parte é URL, nome de
 * arquivo, anotação solta. Um parser ganancioso estraga mais do que conserta, e por isso:
 *   · `_` só abre itálico em BORDA de palavra (17 descrições têm `utm_source`, `arquivo_final`);
 *   · marcador sem par fica literal, em vez de engolir o resto do parágrafo;
 *   · só `http`/`https` viram link.
 */

export type InlineNode =
  | { kind: "text"; text: string }
  | { kind: "strong"; children: InlineNode[] }
  | { kind: "em"; children: InlineNode[] }
  | { kind: "strike"; children: InlineNode[] }
  | { kind: "link"; href: string; children: InlineNode[] }
  /** Menção herdada do Trello (`@:<id>`). Vira o nome quando ele é conhecido. */
  | { kind: "mention"; id: string; label: string };

export type BlockNode =
  | { kind: "paragraph"; children: InlineNode[] }
  | { kind: "heading"; level: number; children: InlineNode[] }
  | { kind: "list"; ordered: boolean; items: InlineNode[][] };

export interface ParseOptions {
  /** `{ id do membro do Trello: nome no WorkOS }` para as menções herdadas. */
  mentionNames?: Record<string, string>;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;

export function parseRichText(src: string, opts: ParseOptions = {}): BlockNode[] {
  if (!src || !src.trim()) return [];
  const linhas = src.replace(/\r\n?/g, "\n").split("\n");

  const blocos: BlockNode[] = [];
  let paragrafo: string[] = [];
  let lista: { ordered: boolean; items: string[] } | null = null;

  const fecharParagrafo = () => {
    if (paragrafo.length) {
      blocos.push({ kind: "paragraph", children: parseInline(paragrafo.join("\n"), opts) });
      paragrafo = [];
    }
  };
  const fecharLista = () => {
    if (lista) {
      blocos.push({
        kind: "list",
        ordered: lista.ordered,
        items: lista.items.map((i) => parseInline(i, opts)),
      });
      lista = null;
    }
  };

  for (const linha of linhas) {
    if (!linha.trim()) {
      fecharParagrafo();
      fecharLista();
      continue;
    }
    const h = HEADING.exec(linha);
    if (h) {
      fecharParagrafo();
      fecharLista();
      blocos.push({ kind: "heading", level: h[1].length, children: parseInline(h[2], opts) });
      continue;
    }
    const b = BULLET.exec(linha);
    const o = ORDERED.exec(linha);
    if (b || o) {
      fecharParagrafo();
      const ordered = !!o;
      // Trocar de tipo no meio fecha a lista anterior: "- a" seguido de "1. b" são duas listas.
      if (lista && lista.ordered !== ordered) fecharLista();
      lista ??= { ordered, items: [] };
      lista.items.push((b ? b[1] : o![1]).trim());
      continue;
    }
    fecharLista();
    paragrafo.push(linha);
  }
  fecharParagrafo();
  fecharLista();
  return blocos;
}

/** Envoltórios de ênfase, do mais longo para o mais curto — `**` tem que ser testado antes de `*`. */
const CERCAS: { marca: string; kind: "strong" | "em" | "strike" }[] = [
  { marca: "**", kind: "strong" },
  { marca: "~~", kind: "strike" },
  { marca: "__", kind: "strong" },
  { marca: "_", kind: "em" },
];

const URL_NUA = /^https?:\/\/[^\s<>"')\]]+/i;
const MENCAO = /^@:([0-9a-zA-Z]{8,})/;
/**
 * `[texto](url)` e `![alt](url)` — com TÍTULO opcional entre aspas, que é como o Trello escreve:
 * `[a campanha](https://trello.com/c/xxx "smartCard-inline")`. São 50 dos links do acervo, em 26
 * das 101 descrições; sem aceitar o título, o link inteiro não casava e sobrava o colchete na tela
 * com a URL crua ao lado. O título em si é descartado — ele não diz nada a quem lê.
 */
const LINK_MD = /^(!?)\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/;

/** Só http(s). `javascript:` num href é execução de script vinda de texto de fora. */
function hrefSeguro(u: string): string | null {
  return /^https?:\/\//i.test(u) ? u : null;
}

function parseInline(src: string, opts: ParseOptions): InlineNode[] {
  const out: InlineNode[] = [];
  let buffer = "";
  let i = 0;

  const soltarTexto = () => {
    if (buffer) {
      out.push({ kind: "text", text: buffer });
      buffer = "";
    }
  };

  while (i < src.length) {
    const c = src[i];

    // Escape: o Trello exporta `Imagen\_de\_WhatsApp`. O caractere seguinte é literal.
    if (c === "\\" && i + 1 < src.length && /[\\`*_{}[\]()#+\-.!~]/.test(src[i + 1])) {
      buffer += src[i + 1];
      i += 2;
      continue;
    }

    const resto = src.slice(i);

    const mencao = MENCAO.exec(resto);
    if (mencao) {
      soltarTexto();
      const nome = opts.mentionNames?.[mencao[1]];
      out.push({
        kind: "mention",
        id: mencao[1],
        // Sem nome conhecido, NÃO se inventa um: mostra-se que houve menção, e só. O id cru de 24
        // caracteres no meio da frase é pior que o rótulo genérico.
        label: nome ? `@${nome}` : "@alguém",
      });
      i += mencao[0].length;
      continue;
    }

    const link = LINK_MD.exec(resto);
    if (link) {
      const href = hrefSeguro(link[3]);
      if (href) {
        soltarTexto();
        // Imagem (`![alt](url)`) também vira LINK: a CSP do projeto só permite img de 'self',
        // data: e lh3.googleusercontent.com, então uma <img> externa daria quadro quebrado no
        // lugar de um endereço que a pessoa consegue abrir.
        // O rótulo passa pelo parser: o Trello escapa o sublinhado dentro do alt da imagem
        // (`![Imagen\_de\_WhatsApp](url)`), e sem interpretá-lo a barra invertida vazava para a
        // tela — o próprio defeito que esta exibição existe para consertar, reaparecendo por
        // dentro. Sem rótulo, a URL entra como TEXTO e não é reprocessada: `parseInline` a
        // transformaria num segundo link, aninhado dentro deste.
        const rotulo = link[2]
          ? parseInline(link[2], opts)
          : [{ kind: "text" as const, text: href }];
        out.push({ kind: "link", href, children: rotulo });
        i += link[0].length;
        continue;
      }
      // href recusado: o texto segue literal, sem virar link.
      buffer += link[0];
      i += link[0].length;
      continue;
    }

    const nua = URL_NUA.exec(resto);
    if (nua) {
      soltarTexto();
      out.push({ kind: "link", href: nua[0], children: [{ kind: "text", text: nua[0] }] });
      i += nua[0].length;
      continue;
    }

    const cerca = CERCAS.find((f) => resto.startsWith(f.marca) && podeAbrir(src, i, f.marca));
    if (cerca) {
      const fim = acharFechamento(src, i + cerca.marca.length, cerca.marca);
      if (fim > 0) {
        soltarTexto();
        out.push({
          kind: cerca.kind,
          children: parseInline(src.slice(i + cerca.marca.length, fim), opts),
        });
        i = fim + cerca.marca.length;
        continue;
      }
      // Sem fechamento, o marcador é literal — e é o que impede "custo ** 2" de virar negrito até
      // o fim do parágrafo.
    }

    buffer += c;
    i += 1;
  }
  soltarTexto();
  return out;
}

/**
 * `_` só abre em borda de palavra. É a regra que salva as URLs: `utm_source`, `arquivo_final_v2` e
 * `Imagen_de_WhatsApp` têm sublinhado ENTRE letras, e tratá-los como itálico comeria os separadores
 * e deixaria o endereço irreconhecível. `**` e `~~` não precisam disso — ninguém escreve asterisco
 * duplo dentro de uma palavra por acidente.
 */
function podeAbrir(src: string, i: number, marca: string): boolean {
  if (marca !== "_" && marca !== "__") return true;
  const anterior = i > 0 ? src[i - 1] : "";
  return anterior === "" || !/[\p{L}\p{N}]/u.test(anterior);
}

/** Índice do fechamento da cerca, ou -1. Ignora o que estiver escapado. */
function acharFechamento(src: string, desde: number, marca: string): number {
  for (let j = desde; j <= src.length - marca.length; j++) {
    if (src[j] === "\\") {
      j++;
      continue;
    }
    if (!src.startsWith(marca, j)) continue;
    if (j === desde) continue; // conteúdo vazio (`**`): não é ênfase
    if (marca === "_" || marca === "__") {
      const seguinte = src[j + marca.length] ?? "";
      if (seguinte && /[\p{L}\p{N}]/u.test(seguinte)) continue; // fecha no meio de palavra: não é
    }
    return j;
  }
  return -1;
}
