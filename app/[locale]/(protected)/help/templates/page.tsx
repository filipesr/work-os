import { getTranslations } from "next-intl/server";
import { GuideView } from "@/components/help/GuideView";

export async function generateMetadata() {
  const t = await getTranslations("help");
  return { title: t("guides.templates.title") };
}

export default async function HelpTemplatesPage() {
  const t = await getTranslations("help");
  return <GuideView guide={t.raw("guides.templates")} ui={t.raw("ui")} />;
}
