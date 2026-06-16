import { ProjectManagerApp } from "@/components/project-manager-app";
import { getDashboardData } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function WorkflowsPage() {
  return <ProjectManagerApp initialData={getDashboardData()} initialView="workflows" />;
}
