import { notFound } from "next/navigation";
import { TeamProfileView } from "@/components/help/TeamProfileView";
import { getProfileBySlug, TEAM_PROFILES } from "@/lib/team-profiles/catalog";
import { loadTeamProfileMessages } from "@/lib/team-profiles/content";

export function generateStaticParams() {
  return TEAM_PROFILES.map((profile) => ({ slug: profile.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { profiles } = await loadTeamProfileMessages();
  return { title: profiles[slug]?.title };
}

export default async function TeamProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = getProfileBySlug(slug);
  const { profiles, ui } = await loadTeamProfileMessages();
  const content = profile ? profiles[profile.slug] : undefined;

  // Slug fora do catálogo, ou catálogo sem conteúdo escrito: 404. O guard de
  // conteúdo impede o segundo caso em CI, mas a rota não confia nisso.
  if (!profile || !content) notFound();

  return <TeamProfileView profile={profile} content={content} ui={ui} />;
}
