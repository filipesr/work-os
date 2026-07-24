import { getTranslations } from "next-intl/server";
import { FundamentoView } from "@/components/help/FundamentoView";

export async function generateMetadata() {
  const t = await getTranslations("help");
  return { title: t("fundamentos.glossario.title") };
}

export default async function HelpGlossaryPage() {
  const t = await getTranslations("help");
  return <FundamentoView page={t.raw("fundamentos.glossario")} ui={t.raw("ui")} />;
}
