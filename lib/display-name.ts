/**
 * Nome de exibição: o que aparece em comentários, etapas e relatórios.
 *
 * A regra é "letras e espaço" — sem números, emojis ou símbolos —, com duas exceções que a regra
 * literal quebraria: **apóstrofo e hífen**. "Ana Luísa D'Ávila" e "Anne-Marie" são nomes reais, e um
 * validador que os recusa não protege ninguém, só obriga a pessoa a escrever o próprio nome errado.
 *
 * Acentuação entra naturalmente porque a checagem é por categoria Unicode (`\p{L}`), não por A-Z:
 * exigir ASCII excluiria metade dos nomes em português e espanhol, que são os dois idiomas do app.
 */

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 60;

export type DisplayNameError = "empty" | "tooShort" | "tooLong" | "invalidChars";

/** Espaços colapsados e pontas aparadas. Aplicado ANTES de validar, para que "  Ana   Maria  " seja
 *  aceito como "Ana Maria" em vez de recusado por algo que o usuário nem vê. */
export function normalizeDisplayName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

// Começa e termina em letra; no meio, letras, espaço, apóstrofo (reto ou tipográfico) e hífen.
// Ancorar as pontas em letra recusa "-Ana", "Ana-" e " '' " sem precisar de regra extra.
const VALID = /^\p{L}[\p{L} '’-]*\p{L}$/u;

/** Devolve o motivo da recusa, ou null quando o nome serve. Puro — a mesma função valida no
 *  servidor (onde vale) e na tela (onde avisa antes de enviar). */
export function validateDisplayName(raw: string): DisplayNameError | null {
  const name = normalizeDisplayName(raw);
  if (name.length === 0) return "empty";
  if (name.length < DISPLAY_NAME_MIN) return "tooShort";
  if (name.length > DISPLAY_NAME_MAX) return "tooLong";
  if (!VALID.test(name)) return "invalidChars";
  return null;
}

export function isValidDisplayName(raw: string): boolean {
  return validateDisplayName(raw) === null;
}
