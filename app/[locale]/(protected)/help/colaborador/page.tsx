import { getTranslations } from "next-intl/server";
import { GuideView } from "@/components/help/GuideView";

export async function generateMetadata() {
  const t = await getTranslations("help");
  return { title: t("guides.colaborador.title") };
}

export default async function HelpColaboradorPage() {
  const t = await getTranslations("help");
  return <GuideView guide={t.raw("guides.colaborador")} ui={t.raw("ui")} />;
}
