import { getOneOnOneCadence } from "@/lib/actions/team-health";
import OneOnOneCard from "@/components/admin/OneOnOneCard";

// Server wrapper: fetches the full cadence (manager/admin, team-scoped) and
// hands it to the interactive card (overdue list + all-members modal).
export default async function OneOnOneCadence() {
  const rows = await getOneOnOneCadence();
  if (rows.length === 0) return null;
  return <OneOnOneCard rows={rows} />;
}
