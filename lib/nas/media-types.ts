// Política de tipo de mídia — puro, sem `node:crypto` (nem qualquer outro módulo Node), para ser
// seguro num bundle de cliente. `lib/nas/path.ts` importa node:crypto (hash determinístico de
// path/nome) e por isso NÃO pode ser importado por um componente "use client" — o bundler falha ao
// tentar resolver "node:crypto" no browser. Este arquivo existe só para isolar o que um componente
// de cliente (ex.: UploadArtifactForm) precisa — a lista de tipos que aceitam upload — do resto da
// lógica de path-building, que continua node-only. `lib/nas/path.ts` re-exporta tudo daqui, então
// quem já importa de "@/lib/nas/path" (server actions, testes) não muda nada.

export type ArtifactMediaType =
  | "VIDEOS"
  | "FOTOS"
  | "DOCUMENTOS"
  | "LOGOS"
  | "SOCIAL_MEDIA"
  | "FIGMA"
  | "OUTROS";

/**
 * Tipos que existem SÓ COMO LINK: nunca recebem arquivo no NAS.
 * FIGMA é um endereço vivo numa ferramenta de outra pessoa — copiar bytes de lá guarda uma foto de
 * um desenho que continua mudando. OUTROS era o coringa que aceitava a união de todas as listas;
 * um balde sem regra é onde entra o que ninguém quis classificar.
 */
export const LINK_ONLY_MEDIA_TYPES = ["FIGMA", "OUTROS"] as const;

/** Tipos que aceitam arquivo (upload ou importação), na ordem em que aparecem na tela. */
export const UPLOADABLE_MEDIA_TYPES = [
  "FOTOS",
  "VIDEOS",
  "DOCUMENTOS",
  "LOGOS",
  "SOCIAL_MEDIA",
] as const;

export type UploadableMediaType = (typeof UPLOADABLE_MEDIA_TYPES)[number];

export function isUploadableMediaType(m: ArtifactMediaType): m is UploadableMediaType {
  return (UPLOADABLE_MEDIA_TYPES as readonly string[]).includes(m);
}
