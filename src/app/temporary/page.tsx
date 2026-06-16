import { ProjectManagerApp } from "@/components/project-manager-app";
import { getDashboardData } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function TemporaryPage() {
  return <ProjectManagerApp initialData={getDashboardData()} initialView="temporary" />;
}
