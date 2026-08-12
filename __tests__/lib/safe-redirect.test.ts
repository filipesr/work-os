import { describe, it, expect } from "vitest";
import { safeRedirectPath, DEFAULT_REDIRECT } from "@/lib/safe-redirect";

describe("safeRedirectPath — destino pós-login", () => {
  it("preserva um caminho interno", () => {
    expect(safeRedirectPath("/admin/tasks/abc123")).toBe("/admin/tasks/abc123");
    expect(safeRedirectPath("/reports/performance?month=2026-08")).toBe(
      "/reports/performance?month=2026-08"
    );
  });

  it("cai no padrão quando não há callbackUrl", () => {
    expect(safeRedirectPath(undefined)).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath(null)).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("")).toBe(DEFAULT_REDIRECT);
  });

  describe("open redirect — o que isso existe para impedir", () => {
    it("rejeita URL absoluta", () => {
      // A vítima vê o nosso domínio na tela de login, autentica, e sai num site
      // de terceiros. O phishing empresta a credibilidade do nosso domínio.
      expect(safeRedirectPath("https://site-falso.com")).toBe(DEFAULT_REDIRECT);
      expect(safeRedirectPath("http://site-falso.com/login")).toBe(DEFAULT_REDIRECT);
    });

    it("rejeita protocol-relative (//host)", () => {
      // Sem esquema, mas o navegador trata como externo — o bypass que mais
      // escapa de uma checagem ingênua de "começa com /".
      expect(safeRedirectPath("//site-falso.com")).toBe(DEFAULT_REDIRECT);
      expect(safeRedirectPath("//site-falso.com/path")).toBe(DEFAULT_REDIRECT);
    });

    it("rejeita a variante com barra invertida", () => {
      // Alguns navegadores normalizam `\` para `/`, então /\evil.com vira //evil.com.
      expect(safeRedirectPath("/\\site-falso.com")).toBe(DEFAULT_REDIRECT);
      expect(safeRedirectPath("/algo\\..\\outro")).toBe(DEFAULT_REDIRECT);
    });

    it("rejeita percent-encoding que esconde o //", () => {
      expect(safeRedirectPath("%2F%2Fsite-falso.com")).toBe(DEFAULT_REDIRECT);
      expect(safeRedirectPath("%2f%2fsite-falso.com")).toBe(DEFAULT_REDIRECT);
    });

    it("rejeita esquemas executáveis e dados embutidos", () => {
      expect(safeRedirectPath("javascript:alert(1)")).toBe(DEFAULT_REDIRECT);
      expect(safeRedirectPath("data:text/html,<script>")).toBe(DEFAULT_REDIRECT);
    });

    it("rejeita URL com credenciais", () => {
      expect(safeRedirectPath("https://user:pass@site-falso.com")).toBe(DEFAULT_REDIRECT);
    });

    it("rejeita percent-encoding inválido em vez de estourar", () => {
      expect(safeRedirectPath("%E0%A4%A")).toBe(DEFAULT_REDIRECT);
    });
  });

  it("evita o laço de voltar para o próprio login", () => {
    // O middleware carimba callbackUrl na rota barrada; se por algum caminho o
    // valor for o próprio /auth/signin, redirecionar para lá após autenticar
    // devolveria o usuário ao login recém-concluído.
    expect(safeRedirectPath("/auth/signin")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("/auth/signin?callbackUrl=%2Fdashboard")).toBe(DEFAULT_REDIRECT);
  });

  it("usa o primeiro valor quando o param vem repetido", () => {
    expect(safeRedirectPath(["/tasks", "https://site-falso.com"])).toBe("/tasks");
  });

  it("aceita um fallback customizado", () => {
    expect(safeRedirectPath("https://site-falso.com", "/inicio")).toBe("/inicio");
  });

  it("ignora espaço em volta sem virar caminho inválido", () => {
    expect(safeRedirectPath("  /tasks  ")).toBe("/tasks");
  });
});
