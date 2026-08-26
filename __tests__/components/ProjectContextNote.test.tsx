import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ProjectContextNote } from "@/components/tasks/ProjectContextNote";

/**
 * O bloco é renderizado por uma página Server (admin) e por um componente
 * Client (visão do executor). Por isso não pode ter hooks — o teste renderiza
 * direto, sem provider de i18n nem de router, que é a garantia prática de que
 * ele segue neutro.
 */
describe("ProjectContextNote", () => {
  it("mostra rótulo, nome do projeto e a descrição", () => {
    const { container } = render(
      <ProjectContextNote
        label="Sobre o projeto"
        projectName="Site institucional"
        description="Rebranding completo, tom mais sóbrio."
      />
    );
    expect(container.textContent).toContain("Sobre o projeto");
    expect(container.textContent).toContain("Site institucional");
    expect(container.textContent).toContain("Rebranding completo, tom mais sóbrio.");
  });

  it("não renderiza nada quando o projeto não tem descrição", () => {
    // Um cabeçalho vazio pendurado na demanda seria ruído: sem contexto a dar,
    // o bloco não deve ocupar espaço.
    const { container } = render(
      <ProjectContextNote label="Sobre o projeto" projectName="Site" description={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("preserva quebras de linha da descrição", () => {
    const { container } = render(
      <ProjectContextNote label="L" projectName="P" description={"linha 1\nlinha 2"} />
    );
    const body = container.querySelector(".whitespace-pre-wrap");
    expect(body?.textContent).toBe("linha 1\nlinha 2");
  });
});
