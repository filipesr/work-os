import "@testing-library/jest-dom/vitest";

/**
 * `localStorage` de verdade para o ambiente de teste.
 *
 * O jsdom desta configuração expõe `window.localStorage` como um objeto VAZIO — sem `getItem`,
 * sem `setItem`, sem `clear`. Quem tocasse nele quebrava com "not a function", e o efeito prático
 * era que nenhum código de preferência local (tema, idioma, formato de link, filtros de
 * planejamento) tinha como ser testado no caminho real: só com dublê por arquivo, que prova o
 * dublê e não o código.
 *
 * A implementação abaixo é a mínima que cumpre o contrato do `Storage`, inclusive o acesso por
 * índice (`key(n)`) e o `length`, porque código que itera o armazenamento existe.
 */
class MemoryStorage implements Storage {
  private dados = new Map<string, string>();

  get length(): number {
    return this.dados.size;
  }

  clear(): void {
    this.dados.clear();
  }

  getItem(key: string): string | null {
    return this.dados.has(key) ? (this.dados.get(key) as string) : null;
  }

  key(index: number): string | null {
    return [...this.dados.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.dados.delete(key);
  }

  setItem(key: string, value: string): void {
    // O `Storage` do navegador converte para texto; sem isto, um número gravado voltaria número e
    // o teste passaria onde o navegador falharia.
    this.dados.set(String(key), String(value));
  }
}

// Guardado porque parte da suíte roda em ambiente `node` (`@vitest-environment node`, nos testes
// que tocam jose/crypto), onde `window` não existe e o setup é carregado do mesmo jeito.
if (typeof window !== "undefined") {
  for (const nome of ["localStorage", "sessionStorage"] as const) {
    Object.defineProperty(window, nome, {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  }
}
