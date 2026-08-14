import { notFound } from "next/navigation";
import { ReportModelView } from "@/components/help/ReportModelView";
import { REPORT_MODELS, getReportModelBySlug } from "@/lib/team-profiles/reports";
import { loadReportModelMessages, loadTeamProfileMessages } from "@/lib/team-profiles/content";

export function generateStaticParams() {
  return REPORT_MODELS.map((model) => ({ slug: model.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { models } = await loadReportModelMessages();
  return { title: models[slug]?.titulo };
}

export default async function ReportModelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const model = getReportModelBySlug(slug);

  const [{ models, ui }, profileMessages] = await Promise.all([
    loadReportModelMessages(),
    loadTeamProfileMessages(),
  ]);

  const content = model ? models[model.slug] : undefined;
  if (!model || !content) notFound();

  return (
    <ReportModelView
      model={model}
      content={content}
      ui={ui}
      profileSlug={model.profileSlug}
      profileTitle={profileMessages.profiles[model.profileSlug]?.title ?? model.profileSlug}
      destinationLabel={profileMessages.ui.destino[model.destino]}
      sensitivityLabel={profileMessages.ui.sensitivity[model.sensibilidade]}
    />
  );
}
