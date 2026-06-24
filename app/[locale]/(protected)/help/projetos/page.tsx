import { getTranslations } from "next-intl/server";
import { GuideView } from "@/components/help/GuideView";

export async function generateMetadata() {
  const t = await getTranslations("help");
  return { title: t("guides.projetos.title") };
}

export default async function HelpProjetosPage() {
  const t = await getTranslations("help");
  return <GuideView guide={t.raw("guides.projetos")} ui={t.raw("ui")} />;
}
