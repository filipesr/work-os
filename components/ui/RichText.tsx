import { Fragment } from "react";
import { parseRichText, type BlockNode, type InlineNode } from "@/lib/markdown/parse";
import { cn } from "@/lib/utils";

/**
 * Texto de descrição e instrução, com a formatação que ele já trazia.
 *
 * O acervo veio do Trello, que escreve markdown — e a tela mostrava `**Texto en pantalla:**` com os
 * asteriscos à vista. Aqui a árvore que `lib/markdown/parse.ts` devolve vira elementos React.
 *
 * **Não existe `dangerouslySetInnerHTML` neste caminho, e é de propósito.** O parser devolve DADOS;
 * cada nó vira um elemento criado pelo React, que escapa o texto sozinho. Não há HTML de terceiro
 * sendo injetado, então não há o que sanitizar — e não há como um texto colado por alguém virar
 * script.
 *
 * Quem escreve texto simples continua vendo texto simples: sem marcador nenhum, isto é um
 * parágrafo com as quebras de linha preservadas, exatamente como era antes.
 */
export function RichText({
  children,
  className,
  mentionNames,
}: {
  /** O texto cru, como está no banco. */
  children: string | null | undefined;
  className?: string;
  /** `{ id do membro do Trello: nome no WorkOS }` para as menções herdadas. */
  mentionNames?: Record<string, string>;
}) {
  if (!children?.trim()) return null;
  const blocos = parseRichText(children, { mentionNames });
  if (blocos.length === 0) return null;

  return (
    <div className={cn("space-y-2 text-sm leading-relaxed text-foreground", className)}>
      {blocos.map((b, i) => (
        <Bloco key={i} node={b} />
      ))}
    </div>
  );
}

function Bloco({ node }: { node: BlockNode }) {
  if (node.kind === "heading") {
    // Sempre o mesmo peso visual, qualquer que seja o nível: `#` no Trello era organização de
    // texto, não hierarquia de documento — e um <h1> dentro do painel competiria com o título da
    // própria tela. O nível vira o elemento certo para leitor de tela, e só.
    const Tag = `h${Math.min(node.level + 2, 6)}` as "h3" | "h4" | "h5" | "h6";
    return (
      <Tag className="text-sm font-semibold text-foreground">
        <Inlines nodes={node.children} />
      </Tag>
    );
  }
  if (node.kind === "list") {
    const Tag = node.ordered ? "ol" : "ul";
    return (
      <Tag
        className={cn(
          "ml-4 space-y-0.5",
          node.ordered ? "list-decimal" : "list-disc",
          "marker:text-muted-foreground"
        )}
      >
        {node.items.map((item, i) => (
          <li key={i}>
            <Inlines nodes={item} />
          </li>
        ))}
      </Tag>
    );
  }
  // `whitespace-pre-wrap` fica: a quebra de linha SIMPLES dentro de um parágrafo é a lista informal
  // que a pessoa escreveu sem marcador, e o acervo está cheio delas (99 de 101 descrições).
  return (
    <p className="whitespace-pre-wrap">
      <Inlines nodes={node.children} />
    </p>
  );
}

function Inlines({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((n, i) => (
        <Fragment key={i}>
          <Inline node={n} />
        </Fragment>
      ))}
    </>
  );
}

function Inline({ node }: { node: InlineNode }) {
  switch (node.kind) {
    case "text":
      return <>{node.text}</>;
    case "strong":
      return (
        <strong className="font-semibold">
          <Inlines nodes={node.children} />
        </strong>
      );
    case "em":
      return (
        <em className="italic">
          <Inlines nodes={node.children} />
        </em>
      );
    case "strike":
      return (
        <s className="text-muted-foreground">
          <Inlines nodes={node.children} />
        </s>
      );
    case "link":
      return (
        // `noopener noreferrer` porque o destino é endereço de fora, digitado por outra pessoa:
        // sem eles a página aberta ganha uma referência à nossa (`window.opener`).
        <a
          href={node.href}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-primary underline underline-offset-2 hover:text-primary/80"
        >
          <Inlines nodes={node.children} />
        </a>
      );
    case "mention":
      return (
        // Menção herdada do Trello. Marcada visualmente porque É uma referência a alguém — e sem
        // link, porque ela não leva a lugar nenhum aqui: o id é de outro sistema.
        <span
          className="rounded bg-primary/10 px-1 font-medium text-primary"
          title={`Menção importada do Trello (${node.id})`}
        >
          {node.label}
        </span>
      );
  }
}
