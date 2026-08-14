import { TeamProfileIndex } from "@/components/help/TeamProfileIndex";
import { loadTeamProfileMessages } from "@/lib/team-profiles/content";

export async function generateMetadata() {
  const { index } = await loadTeamProfileMessages();
  return { title: index.title };
}

export default async function TeamProfilesIndexPage() {
  const messages = await loadTeamProfileMessages();
  return <TeamProfileIndex messages={messages} />;
}
