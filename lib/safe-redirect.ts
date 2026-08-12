// Validação de destino de redirect pós-login. Puro e testável: é a fronteira
// entre um parâmetro de URL controlado por quem clica no link e um redirect que
// o navegador vai seguir.

/** Para onde o login manda quando não há destino válido a preservar. */
export const DEFAULT_REDIRECT = "/dashboard";

/**
 * Normaliza um `callbackUrl` em um caminho INTERNO seguro, ou devolve o padrão.
 *
 * Sem isso, `?callbackUrl=https://site-falso.com` viraria um **open redirect**:
 * a vítima veria o domínio real na tela de login, autenticaria, e sairia num
 * site de terceiros — o padrão clássico de phishing, com a credibilidade do
 * nosso domínio emprestada ao atacante.
 *
 * Aceita **somente** caminhos relativos à raiz (`/algo`). Rejeitados:
 *  - absolutos (`https://…`, `//host` protocol-relative — que o navegador trata
 *    como externo mesmo sem esquema);
 *  - esquemas embutidos (`javascript:`, `data:`) e URLs com credenciais;
 *  - `\` no lugar de `/`, que alguns navegadores normalizam para `//`;
 *  - caminhos que voltam para o próprio login, que criariam um laço.
 */
export function safeRedirectPath(
  value: string | string[] | undefined | null,
  fallback: string = DEFAULT_REDIRECT
): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || raw.length === 0) return fallback;

  // Decodifica uma vez para pegar tentativas como `%2F%2Fevil.com`. Se a
  // decodificação falhar (percent-encoding inválido), o valor não é confiável.
  let candidate: string;
  try {
    candidate = decodeURIComponent(raw);
  } catch {
    return fallback;
  }

  candidate = candidate.trim();

  if (!candidate.startsWith("/")) return fallback; // absoluto ou relativo solto
  if (candidate.startsWith("//")) return fallback; // protocol-relative
  if (candidate.startsWith("/\\") || candidate.includes("\\")) return fallback;
  if (candidate.includes("://")) return fallback;
  // Voltar para o login depois de logar é um laço; manda para o padrão.
  if (candidate === "/auth/signin" || candidate.startsWith("/auth/signin?")) return fallback;

  return candidate;
}
