import { filterProjectsByProjectSet } from "./domain";
import type { Project, ProjectSetSummary } from "./types";

export type ProjectListItem = Project & {
  progress: number;
  taskCount: number;
};

export type ProjectSetSelection = string | "unassigned";
export type ProjectSetMembershipChange = {
  projectId: string;
  projectSetId: string | null;
};

export type ProjectFormDraft = {
  id: string;
  name: string;
  description: string;
  status: string;
  startDate: string;
  dueDate: string;
  tags: string;
  projectType: string;
  workflowTemplateId: string;
  projectSetId: string;
};

export function buildProjectSetMembershipUpdates(
  projects: ProjectListItem[],
  projectSetId: string,
  selectedIds: string[],
) {
  const selectedIdSet = new Set(selectedIds);

  return projects
    .filter((project) => !project.archived)
    .filter(
      (project) =>
        (selectedIdSet.has(project.id) && project.projectSetId !== projectSetId) ||
        (!selectedIdSet.has(project.id) && project.projectSetId === projectSetId),
    )
    .map((project) => ({
      projectId: project.id,
      projectSetId: selectedIdSet.has(project.id) ? projectSetId : null,
    }));
}

export function createProjectFormDraft(project: Project | null): ProjectFormDraft {
  return {
    id: project?.id ?? "",
    name: project?.name ?? "",
    description: project?.description ?? "",
    status: project?.status ?? "active",
    startDate: toDateInput(project?.startDate ?? null),
    dueDate: toDateInput(project?.dueDate ?? null),
    tags: project?.tags.join(", ") ?? "",
    projectType: project?.projectType ?? "",
    workflowTemplateId: project?.workflowTemplateId ?? "",
    projectSetId: project?.projectSetId ?? "",
  };
}

export function resolveProjectSetSelection(
  currentProjectSetId: ProjectSetSelection | null,
  projectSets: ProjectSetSummary[],
) {
  if (currentProjectSetId === "unassigned") return currentProjectSetId;
  if (currentProjectSetId && projectSets.some((projectSet) => projectSet.id === currentProjectSetId)) {
    return currentProjectSetId;
  }
  return currentProjectSetId ? null : currentProjectSetId;
}

export function resolveProjectSelection({
  currentProjectId,
  currentProjectSetId,
  initialView,
  projects,
}: {
  currentProjectId: string | null;
  currentProjectSetId: ProjectSetSelection | null;
  initialView: string;
  projects: ProjectListItem[];
}) {
  if (!currentProjectId) {
    return initialView === "projects" ? null : projects[0]?.id ?? null;
  }

  const activeProjects = projects.filter((project) => !project.archived);
  const visibleProjects = currentProjectSetId
    ? filterProjectsByProjectSet(activeProjects, currentProjectSetId)
    : [];

  if (visibleProjects.some((project) => project.id === currentProjectId)) {
    return currentProjectId;
  }

  return initialView === "projects" ? null : projects[0]?.id ?? null;
}

export async function applyProjectSetMembershipChanges({
  changes,
  requestUpdate,
  refresh,
}: {
  changes: ProjectSetMembershipChange[];
  requestUpdate: (
    change: ProjectSetMembershipChange,
  ) => Promise<{ ok: boolean; error?: string }>;
  refresh: () => Promise<void> | void;
}) {
  if (changes.length === 0) return;

  const results = await Promise.all(changes.map((change) => requestUpdate(change)));
  await refresh();

  const failed = results.find((result) => !result.ok);
  if (failed) {
    throw new Error(failed.error ?? "项目归属更新失败");
  }
}

export async function runProjectSetOperation<T>({
  setPending,
  operation,
}: {
  setPending: (pending: boolean) => void;
  operation: () => Promise<T>;
}) {
  setPending(true);
  try {
    return await operation();
  } finally {
    setPending(false);
  }
}

function toDateInput(value: string | null) {
  return value ? value.slice(0, 10) : "";
}
