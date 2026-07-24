import { getTranslations } from "next-intl/server";
import { FundamentoView } from "@/components/help/FundamentoView";

export async function generateMetadata() {
  const t = await getTranslations("help");
  return { title: t("fundamentos.principios.title") };
}

export default async function HelpPrinciplesPage() {
  const t = await getTranslations("help");
  return <FundamentoView page={t.raw("fundamentos.principios")} ui={t.raw("ui")} />;
}
