import { useTranslations } from "next-intl";

/**
 * A linha que conta que o campo aceita formatação.
 *
 * Existe porque a exibição passou a renderizar markdown (ver `components/ui/RichText.tsx`) e, sem
 * isto, o recurso ficaria invisível: ninguém digita `**` por acaso. É uma DICA, não uma exigência —
 * quem escreve texto simples continua vendo texto simples, e nada do que já estava escrito muda.
 *
 * Deliberadamente uma linha de texto, e não uma barra de botões: o uso real aqui é instrução curta
 * de etapa, e uma barra de formatação em cada um dos campos custaria mais espaço do que o texto que
 * eles costumam receber.
 */
export function FormattingHint({ className = "" }: { className?: string }) {
  const t = useTranslations("forms");
  return <p className={`mt-1 text-xs text-muted-foreground ${className}`}>{t("formattingHint")}</p>;
}
