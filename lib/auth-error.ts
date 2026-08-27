/**
 * Códigos de erro que a tela de login sabe explicar.
 *
 * O Auth.js redireciona para `/auth/signin?error=<código>` e, até aqui, a página **ignorava o
 * parâmetro**: a pessoa via `?error=OAuthAccountNotLinked` na barra de endereços e uma tela de login
 * idêntica à normal, sem uma palavra sobre o que houve. Quem não conhece o Auth.js não tem como
 * adivinhar — e quem conhece perde tempo confirmando.
 *
 * Aos códigos do próprio Auth.js somam-se os nossos, devolvidos pelo callback `signIn`
 * (`NotInvited`, `AccountDisabled`, `NoEmail`), que existem para separar "você não foi cadastrado"
 * de "seu acesso foi desativado" — reações completamente diferentes de quem lê.
 */

export const AUTH_ERROR_KEYS = {
  // --- nossos, do callback signIn ---
  NotInvited: "notInvited",
  AccountDisabled: "accountDisabled",
  NoEmail: "noEmail",
  // --- do Auth.js ---
  OAuthAccountNotLinked: "oauthAccountNotLinked",
  AccessDenied: "accessDenied",
  Verification: "verification",
  Configuration: "configuration",
  OAuthSignin: "providerError",
  OAuthCallback: "providerError",
  OAuthCreateAccount: "providerError",
  Callback: "providerError",
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERROR_KEYS;

/** Traduz o `?error=` em chave de i18n. Código desconhecido cai numa mensagem genérica em vez de
 *  sumir — um erro sem texto foi justamente o problema original. */
export function authErrorKey(raw: string | string[] | undefined): string | null {
  const code = Array.isArray(raw) ? raw[0] : raw;
  if (!code) return null;
  return AUTH_ERROR_KEYS[code as AuthErrorCode] ?? "unknown";
}

/** Erros em que faz sentido oferecer "tentar de novo": os transitórios do provedor. Recusa por
 *  cadastro ou desativação não melhora com insistência — oferecer o botão ali só faria a pessoa
 *  repetir o mesmo caminho até desistir. */
export function isRetryableAuthError(key: string | null): boolean {
  return key === "providerError" || key === "unknown";
}
