import { ProjectManagerApp } from "@/components/project-manager-app";
import { getDashboardData } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return <ProjectManagerApp initialData={getDashboardData()} initialView="settings" />;
}
