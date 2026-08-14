import { ReportModelIndex } from "@/components/help/ReportModelIndex";
import { loadReportModelMessages, loadTeamProfileMessages } from "@/lib/team-profiles/content";

export async function generateMetadata() {
  const { index } = await loadReportModelMessages();
  return { title: index.title };
}

export default async function ReportModelsIndexPage() {
  const [messages, profileMessages] = await Promise.all([
    loadReportModelMessages(),
    loadTeamProfileMessages(),
  ]);

  return <ReportModelIndex messages={messages} profileMessages={profileMessages} />;
}
