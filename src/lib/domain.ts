import type { ProjectSetStatus } from "./types";

export type TaskStatusKey = "todo" | "in_progress" | "blocked" | "done";

export type FlatTask = {
  id: string;
  title: string;
  parentId: string | null;
  statusKey: string;
  sortOrder: number;
};

export type TaskTreeNode<T extends FlatTask = FlatTask> = T & {
  children: TaskTreeNode<T>[];
};

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "custom";

export type RecurrenceRuleInput = {
  frequency: RecurrenceFrequency;
  interval: number;
  nextRunAt: Date;
};

export type RecurrenceStartInput = {
  frequency: RecurrenceFrequency;
  interval: number;
  startAt: Date;
  now?: Date;
};

export type ProjectProgress = {
  total: number;
  completed: number;
  percent: number;
};

type ProjectSetProject = {
  status: string;
  progress: number;
  startDate: string | null;
  dueDate: string | null;
  archived: boolean;
};

export type TaskFilter = {
  query?: string;
  statusKey?: string;
  sourceType?: string;
  priority?: string;
  projectId?: string;
};

export type SortPatch = {
  id: string;
  sortOrder: number;
};

export type TaskSelectionCandidate = {
  id: string;
  parentId: string | null;
  projectId?: string | null;
};

export type TemplateRecommendationProject = {
  name: string;
  description: string | null;
  projectType: string | null;
  tags: string[];
};

export type TemplateRecommendationCandidate = {
  id: string;
  name: string;
  projectType: string | null;
  matchKeywords: string[];
};

export type TemplateRecommendation<T extends TemplateRecommendationCandidate> = {
  template: T;
  score: number;
  reasons: string[];
};

export function formatTaskDetailSubtitle(
  projectName: string | null | undefined,
  taskTitle: string,
) {
  return `${projectName?.trim() || "未归属项目"}-${taskTitle}`;
}

export function formatAssigneeNames(
  assignees: Array<{ name: string; deletedAt: string | null }>,
) {
  if (assignees.length === 0) return "未分配";
  return assignees
    .map((person) => `${person.name}${person.deletedAt ? "！" : ""}`)
    .join("、");
}

export function buildTaskTree<T extends FlatTask>(tasks: T[]): TaskTreeNode<T>[] {
  const nodes = new Map<string, TaskTreeNode<T>>();
  const roots: TaskTreeNode<T>[] = [];

  for (const task of tasks) {
    nodes.set(task.id, { ...task, children: [] });
  }

  for (const task of [...tasks].sort(compareTasks)) {
    const node = nodes.get(task.id);
    if (!node) continue;

    if (task.parentId && nodes.has(task.parentId)) {
      nodes.get(task.parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  }

  sortTree(roots);
  return roots;
}

export function canMoveTaskToParent(
  tasks: Pick<FlatTask, "id" | "parentId">[],
  taskId: string,
  nextParentId: string | null,
) {
  if (!nextParentId) return true;
  if (taskId === nextParentId) return false;

  const parentById = new Map(tasks.map((task) => [task.id, task.parentId]));
  let cursor: string | null | undefined = nextParentId;

  while (cursor) {
    if (cursor === taskId) return false;
    cursor = parentById.get(cursor);
  }

  return true;
}

export function reorderTaskWithinSiblings<T extends FlatTask>(
  tasks: T[],
  taskId: string,
  direction: "up" | "down",
): SortPatch[] {
  const current = tasks.find((task) => task.id === taskId);
  if (!current) return [];

  const siblings = tasks
    .filter((task) => task.parentId === current.parentId)
    .sort(compareTasks);
  const currentIndex = siblings.findIndex((task) => task.id === taskId);
  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= siblings.length) {
    return [];
  }

  const reordered = [...siblings];
  [reordered[currentIndex], reordered[nextIndex]] = [
    reordered[nextIndex],
    reordered[currentIndex],
  ];

  return reordered.map((task, index) => ({
    id: task.id,
    sortOrder: index + 1,
  }));
}

export function calculateProjectProgress(
  tasks: Pick<FlatTask, "statusKey">[],
  doneStatusKeys: string[],
): ProjectProgress {
  const total = tasks.length;
  const completed = tasks.filter((task) =>
    doneStatusKeys.includes(task.statusKey),
  ).length;

  return {
    total,
    completed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

export function calculateProjectSetSummary(projects: ProjectSetProject[]) {
  const activeProjects = projects.filter((project) => !project.archived);

  if (activeProjects.length === 0) {
    return {
      projectCount: 0,
      progress: 0,
      status: "not_started" as ProjectSetStatus,
      startDate: null,
      endDate: null,
    };
  }

  const startDates = activeProjects
    .map((project) => project.startDate)
    .filter((value): value is string => Boolean(value))
    .sort();
  const endDates = activeProjects
    .map((project) => project.dueDate)
    .filter((value): value is string => Boolean(value))
    .sort();
  const status: ProjectSetStatus = activeProjects.every(
    (project) => project.status === "done",
  )
    ? "done"
    : activeProjects.some((project) => project.status === "active")
      ? "active"
      : activeProjects.some((project) => project.status === "paused")
        ? "paused"
        : "not_started";

  return {
    projectCount: activeProjects.length,
    progress: Math.round(
      activeProjects.reduce((total, project) => total + project.progress, 0) /
        activeProjects.length,
    ),
    status,
    startDate: startDates[0] ?? null,
    endDate: endDates.at(-1) ?? null,
  };
}

export function filterProjectsByProjectSet<
  T extends { projectSetId: string | null; archived: boolean },
>(projects: T[], selection: string | "unassigned") {
  return projects.filter(
    (project) =>
      !project.archived &&
      (selection === "unassigned"
        ? project.projectSetId === null
        : project.projectSetId === selection),
  );
}

type ProgressTaskNode = {
  statusKey: string;
  children?: ProgressTaskNode[];
};

export function calculateRootTaskProgress(
  rootTask: ProgressTaskNode,
  doneStatusKeys: string[],
): ProjectProgress {
  const descendants: ProgressTaskNode[] = [];

  function collect(tasks: ProgressTaskNode[] | undefined) {
    for (const task of tasks ?? []) {
      descendants.push(task);
      collect(task.children);
    }
  }

  collect(rootTask.children);
  return calculateProjectProgress(
    descendants.length > 0 ? descendants : [rootTask],
    doneStatusKeys,
  );
}

export function filterTasks<
  T extends {
    title: string;
    description: string | null;
    statusKey: string;
    sourceType: string;
    priority: string;
    tags: string[];
    projectId: string | null;
  },
>(tasks: T[], filter: TaskFilter): T[] {
  const query = filter.query?.trim().toLowerCase() ?? "";

  return tasks.filter((task) => {
    const searchableText = [
      task.title,
      task.description ?? "",
      ...task.tags,
    ]
      .join(" ")
      .toLowerCase();

    return (
      (!query || searchableText.includes(query)) &&
      (!filter.statusKey || task.statusKey === filter.statusKey) &&
      (!filter.sourceType || task.sourceType === filter.sourceType) &&
      (!filter.priority || task.priority === filter.priority) &&
      (!filter.projectId || task.projectId === filter.projectId)
    );
  });
}

export function filterTasksByRoot<T extends { id: string; parentId: string | null }>(
  tasks: T[],
  rootTaskId: string,
): T[] {
  if (!rootTaskId) return tasks;

  const includedIds = new Set([rootTaskId]);
  let foundDescendant = true;

  while (foundDescendant) {
    foundDescendant = false;
    for (const task of tasks) {
      if (
        task.parentId &&
        includedIds.has(task.parentId) &&
        !includedIds.has(task.id)
      ) {
        includedIds.add(task.id);
        foundDescendant = true;
      }
    }
  }

  return tasks.filter((task) => includedIds.has(task.id));
}

export function filterTasksByStatusKeepingRoots<
  T extends { id: string; parentId: string | null; statusKey: string },
>(allTasks: T[], candidateTasks: T[], statusKey: string): T[] {
  if (!statusKey) return candidateTasks;

  const tasksById = new Map(allTasks.map((task) => [task.id, task]));
  const includedIds = new Set(
    allTasks.filter((task) => task.parentId === null).map((task) => task.id),
  );

  for (const task of candidateTasks) {
    if (task.parentId === null || task.statusKey !== statusKey) continue;

    let current: T | undefined = task;
    while (current) {
      includedIds.add(current.id);
      current = current.parentId ? tasksById.get(current.parentId) : undefined;
    }
  }

  return allTasks.filter((task) => includedIds.has(task.id));
}

export function getNextSelectedTaskIdAfterDelete<T extends TaskSelectionCandidate>(
  tasks: T[],
  deletedTaskId: string,
  scope?: { projectId?: string | null },
) {
  const deletedIds = collectTaskSubtreeIds(tasks, deletedTaskId);

  return (
    tasks.find((task) => {
      if (deletedIds.has(task.id)) return false;
      if (scope?.projectId !== undefined && task.projectId !== scope.projectId) {
        return false;
      }
      return true;
    })?.id ?? null
  );
}

export function recommendTaskTreeTemplates<T extends TemplateRecommendationCandidate>(
  project: TemplateRecommendationProject,
  templates: T[],
): TemplateRecommendation<T>[] {
  const projectType = normalizeText(project.projectType);
  const projectName = normalizeText(project.name);
  const description = normalizeText(project.description);
  const tags = project.tags.map(normalizeText).filter(Boolean);

  return templates
    .map((template) => {
      let score = 0;
      const reasons: string[] = [];
      const templateType = normalizeText(template.projectType);

      if (projectType && templateType && projectType === templateType) {
        score += 60;
        reasons.push(`项目类型匹配：${template.projectType}`);
      }

      for (const keyword of template.matchKeywords.map(normalizeText).filter(Boolean)) {
        if (projectName.includes(keyword)) {
          score += 15;
          reasons.push(`名称包含关键词：${keyword}`);
        }
        if (description.includes(keyword)) {
          score += 10;
          reasons.push(`描述包含关键词：${keyword}`);
        }
        if (tags.includes(keyword)) {
          score += 20;
          reasons.push(`标签匹配：${keyword}`);
        }
      }

      return { template, score, reasons };
    })
    .filter((recommendation) => recommendation.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.template.name.localeCompare(b.template.name, "zh-CN"),
    );
}

export function buildTemplateTaskTree<
  T extends {
    id: string;
    parentId: string | null;
    title: string;
    sortOrder: number;
  },
>(nodes: T[]): Array<T & { children: Array<T & { children: unknown[] }> }> {
  return buildTaskTree(
    nodes.map((node) => ({
      ...node,
      statusKey: "template",
    })),
  ) as Array<T & { children: Array<T & { children: unknown[] }> }>;
}

export function getNextOccurrence(rule: RecurrenceRuleInput): Date {
  const interval = Math.max(1, rule.interval);

  if (rule.frequency === "monthly") {
    return addUtcMonths(rule.nextRunAt, interval);
  }

  const days =
    rule.frequency === "weekly"
      ? interval * 7
      : rule.frequency === "custom"
        ? interval
        : interval;

  return new Date(rule.nextRunAt.getTime() + days * 24 * 60 * 60 * 1000);
}

export function getNextOccurrenceFromStart(rule: RecurrenceStartInput): Date {
  const now = rule.now ?? new Date();
  let nextRunAt = new Date(rule.startAt.getTime());
  let guard = 0;

  while (nextRunAt <= now && guard < 1000) {
    nextRunAt = getNextOccurrence({
      frequency: rule.frequency,
      interval: rule.interval,
      nextRunAt,
    });
    guard += 1;
  }

  return nextRunAt;
}

function compareTasks(a: Pick<FlatTask, "sortOrder" | "title">, b: FlatTask) {
  return a.sortOrder - b.sortOrder || a.title.localeCompare(b.title);
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function sortTree<T extends FlatTask>(nodes: TaskTreeNode<T>[]) {
  nodes.sort(compareTasks);
  for (const node of nodes) {
    sortTree(node.children);
  }
}

function collectTaskSubtreeIds<T extends TaskSelectionCandidate>(
  tasks: T[],
  rootTaskId: string,
) {
  const deletedIds = new Set([rootTaskId]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const task of tasks) {
      if (task.parentId && deletedIds.has(task.parentId) && !deletedIds.has(task.id)) {
        deletedIds.add(task.id);
        changed = true;
      }
    }
  }

  return deletedIds;
}

function addUtcMonths(date: Date, months: number) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const targetMonth = month + months;
  const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
  const next = new Date(date);

  next.setUTCFullYear(year, targetMonth, Math.min(day, lastDay));
  return next;
}
