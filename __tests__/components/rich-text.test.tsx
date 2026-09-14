import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RichText } from "@/components/ui/RichText";

describe("RichText", () => {
  it("texto simples continua texto simples — quem não usa markdown não percebe nada", () => {
    render(<RichText>Fazer o flyer de setembro</RichText>);
    expect(screen.getByText("Fazer o flyer de setembro")).toBeDefined();
  });

  it("vazio, nulo e só espaços não renderizam bloco nenhum", () => {
    const { container: a } = render(<RichText>{null}</RichText>);
    const { container: b } = render(<RichText>{"   "}</RichText>);
    expect(a.firstChild).toBeNull();
    expect(b.firstChild).toBeNull();
  });

  it("negrito vira <strong>, não asteriscos na tela", () => {
    const { container } = render(<RichText>{"**Texto en pantalla:**"}</RichText>);
    expect(container.querySelector("strong")?.textContent).toBe("Texto en pantalla:");
    expect(container.textContent).not.toContain("**");
  });

  it("lista vira <ul><li>, com os marcadores fora do texto", () => {
    const { container } = render(<RichText>{"- um\n- dois"}</RichText>);
    const itens = [...container.querySelectorAll("li")].map((li) => li.textContent);
    expect(itens).toEqual(["um", "dois"]);
    expect(container.textContent).not.toContain("- um");
  });

  it("[CRÍTICO] link abre em nova aba com noopener — o destino é endereço de fora", () => {
    // Sem `noopener`, a página aberta ganha uma referência à nossa (`window.opener`) e pode
    // redirecioná-la. O endereço vem de texto digitado por outra pessoa.
    const { container } = render(
      <RichText>{'[a campanha](https://trello.com/c/x "smartCard-inline")'}</RichText>
    );
    const a = container.querySelector("a")!;
    expect(a.getAttribute("href")).toBe("https://trello.com/c/x");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toContain("noopener");
    expect(a.textContent).toBe("a campanha");
  });

  it("[CRÍTICO] não injeta HTML — uma tag no texto aparece como TEXTO", () => {
    // O parser devolve dados e o React cria os elementos, então não há caminho para HTML de
    // terceiro entrar. Este teste existe para que continue assim se alguém trocar a renderização.
    const { container } = render(
      <RichText>{'<img src=x onerror="alert(1)"> e <b>negrito falso</b>'}</RichText>
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("<img src=x");
    expect(container.textContent).toContain("<b>negrito falso</b>");
  });

  it("menção do Trello vira o nome quando ele é conhecido", () => {
    const { container } = render(
      <RichText mentionNames={{ abc12345: "Sara Goon" }}>{"@:abc12345 pode ver?"}</RichText>
    );
    expect(container.textContent).toContain("@Sara Goon");
    expect(container.textContent).not.toContain("abc12345");
  });
});
