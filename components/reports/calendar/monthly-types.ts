export interface MonthDay {
  iso: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
}

export interface MonthEvent {
  id: string;
  iso: string;
  title: string;
  countries: ("AR" | "BR" | "PY")[];
  type: "holiday" | "commercial";
}

export interface DemandTask {
  id: string;
  title: string;
  status: "BACKLOG" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED";
  projectId: string;
  projectName: string;
  stageName: string | null;
  assigneeName: string | null;
}

export interface ClientDemands {
  clientId: string;
  clientName: string;
  tasks: DemandTask[];
}

export interface ProjectOption {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
}

export interface ClientOption {
  id: string;
  name: string;
}

export interface DayAnniversaries {
  birthdays: { name: string }[];
  workAnniversaries: { name: string; years: number }[];
}

export interface TemplateOption {
  id: string;
  name: string;
}

export const COUNTRY_FLAG: Record<MonthEvent["countries"][number], string> = {
  AR: "🇦🇷",
  BR: "🇧🇷",
  PY: "🇵🇾",
};

/** iso (YYYY-MM-DD) → DD/MM/YYYY */
export function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
