import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  buildTaskTree,
  buildTemplateTaskTree,
  calculateProjectProgress,
  calculateProjectSetSummary,
  canMoveTaskToParent,
  getNextOccurrence,
  getNextOccurrenceFromStart,
  recommendTaskTreeTemplates,
  reorderTaskWithinSiblings,
  type SortPatch,
} from "./domain";
import type {
  DashboardData,
  Personnel,
  Project,
  ProjectSet,
  RecurrenceRule,
  RootTaskTemplate,
  RootTaskTemplateDependency,
  RootTaskTemplateNode,
  Task,
  TaskDependency,
  TaskSourceType,
  TaskTemplateDependency,
  TaskTemplateNode,
  TaskTreeTemplate,
  TaskTreeTemplateRecommendation,
  WorkflowState,
  WorkflowTemplate,
} from "./types";

type Row = Record<string, unknown>;

type RootTaskTemplateInput = {
  name: string;
  description?: string | null;
  projectType?: string | null;
  rootTitle: string;
  matchKeywords?: string[];
  nodes: Array<{
    id?: string;
    title: string;
    description?: string | null;
    parentId?: string | null;
    defaultStatusKey?: string;
    priority?: Task["priority"];
    sortOrder?: number;
    positionX?: number;
    positionY?: number;
    tags?: string[];
  }>;
  dependencies?: Array<{
    id?: string;
    fromNodeId: string;
    toNodeId: string;
    type?: RootTaskTemplateDependency["type"];
    label?: string | null;
    sortOrder?: number;
  }>;
};

type ImportedProjectSnapshot = Omit<Project, "startDate" | "projectSetId"> &
  Partial<Pick<Project, "startDate" | "projectSetId">>;

export type LocalDataExport = {
  version: 1;
  exportedAt: string;
  projectSets?: ProjectSet[];
  projects: ImportedProjectSnapshot[];
  tasks: Task[];
  workflows: WorkflowTemplate[];
  recurrenceRules: RecurrenceRule[];
  personnel?: Personnel[];
};

export type ImportSummary = {
  projectSets: number;
  projects: number;
  tasks: number;
  workflows: number;
  recurrenceRules: number;
  personnel: number;
};

export type BackupResult = {
  databasePath: string;
  backupPath: string;
  createdAt: string;
};

export class ProjectSetNotFoundError extends Error {
  constructor() {
    super("项目集不存在");
    this.name = "ProjectSetNotFoundError";
  }
}

const workspaceRoot = /*turbopackIgnore: true*/ process.cwd();
const dataDir = path.join(workspaceRoot, "data");
const configuredDbPath =
  process.env.NODE_ENV === "test" ? process.env.PROJECT_OS_DB_PATH : undefined;
const dbPath = configuredDbPath === ":memory:"
  ? ":memory:"
  : configuredDbPath
  ? path.isAbsolute(configuredDbPath)
    ? configuredDbPath
    : path.join(workspaceRoot, configuredDbPath)
  : path.join(dataDir, "project-manager.sqlite");

let db: DatabaseSync | null = null;

export function closeDatabase() {
  (db as (DatabaseSync & { close?: () => void }) | null)?.close?.();
  db = null;
}

export function getDatabase() {
  if (dbPath !== ":memory:") {
    const dbDir = path.dirname(dbPath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }
  }

  db ??= new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  createSchema(db);
  seedIfEmpty(db);
  seedTaskTreeTemplatesIfEmpty(db);
  seedRootTaskTemplatesIfEmpty(db);
  return db;
}

export function getDashboardData(): DashboardData {
  const database = getDatabase();
  const workflows = getWorkflows();
  const workflowStates = workflows.flatMap((workflow) => workflow.states);
  const doneStates = workflowStates
    .filter((state) => state.isCompleted)
    .map((state) => state.key);
  const tasks = getTasks();
  const projects = getProjects().map((project) => {
    const projectTasks = tasks.filter((task) => task.projectId === project.id);
    const progress = calculateProjectProgress(projectTasks, doneStates).percent;

    return {
      ...project,
      progress,
      taskCount: projectTasks.length,
    };
  });
  const projectSets = getProjectSets().map((projectSet) => ({
    ...projectSet,
    ...calculateProjectSetSummary(
      projects.filter((project) => project.projectSetId === projectSet.id),
    ),
  }));
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayTasks = tasks.filter(
    (task) => task.dueDate?.slice(0, 10) === todayIso && !doneStates.includes(task.statusKey),
  );
  const upcomingTasks = tasks
    .filter((task) => task.dueDate && !doneStates.includes(task.statusKey))
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
    .slice(0, 8);
  const recurringRules = mapRecurrenceRows(
    database.prepare(recurrenceSelectSql).all(),
  );

  return {
    projectSets,
    projects,
    tasks,
    taskTree: buildTaskTree(tasks).map(mapTreeNode),
    temporaryTasks: tasks.filter((task) => task.sourceType === "temporary"),
    todayTasks,
    upcomingTasks,
    recurringRules,
    workflows,
    taskTreeTemplates: getTaskTreeTemplates(),
    rootTaskTemplates: getRootTaskTemplates(),
    taskDependencies: getTaskDependencies(),
    personnel: getPersonnel(),
    safetyInfo: getDataSafetyInfo(),
    stats: {
      activeProjects: projects.filter((project) => !project.archived).length,
      todayTasks: todayTasks.length,
      temporaryTasks: tasks.filter((task) => task.sourceType === "temporary").length,
      recurringRules: recurringRules.filter((rule) => !rule.paused).length,
      completedTasks: tasks.filter((task) => doneStates.includes(task.statusKey)).length,
      totalTasks: tasks.length,
    },
  };
}

export function getProjects(): Project[] {
  return (getDatabase().prepare("SELECT * FROM projects ORDER BY sort_order, name").all() as Row[]).map(
    mapProject,
  );
}

export function getProjectSets(): ProjectSet[] {
  return (
    getDatabase()
      .prepare("SELECT * FROM project_sets ORDER BY sort_order, created_at, name")
      .all() as Row[]
  ).map(mapProjectSet);
}

export function createProjectSet(input: { name: string }) {
  const id = randomUUID();
  const name = input.name.trim();
  if (!name) throw new Error("项目集名称不能为空");

  getDatabase()
    .prepare("INSERT INTO project_sets (id, name, sort_order) VALUES (?, ?, ?)")
    .run(id, name, Date.now());

  return getProjectSets().find((projectSet) => projectSet.id === id)!;
}

export function updateProjectSet(id: string, input: { name?: string }) {
  const current = getProjectSets().find((projectSet) => projectSet.id === id);
  if (!current) return null;

  const name = input.name === undefined ? current.name : input.name.trim();
  if (!name) throw new Error("项目集名称不能为空");

  getDatabase()
    .prepare(
      `UPDATE project_sets
       SET name = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .run(name, id);

  return getProjectSets().find((projectSet) => projectSet.id === id) ?? null;
}

export function deleteProjectSet(id: string) {
  if (!getProjectSets().some((projectSet) => projectSet.id === id)) return false;

  const database = getDatabase();
  database.exec("BEGIN TRANSACTION");
  try {
    database.prepare("UPDATE projects SET project_set_id = NULL WHERE project_set_id = ?").run(id);
    database.prepare("DELETE FROM project_sets WHERE id = ?").run(id);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return true;
}

export function createProject(input: {
  name: string;
  description?: string;
  projectType?: string | null;
  status?: string;
  startDate?: string | null;
  dueDate?: string | null;
  tags?: string[];
  archived?: boolean;
  workflowTemplateId?: string | null;
  projectSetId?: string | null;
}) {
  assertProjectSetExists(input.projectSetId);
  const defaultWorkflow = getDatabase()
    .prepare("SELECT id FROM workflow_templates WHERE is_default = 1 LIMIT 1")
    .get() as Row | undefined;
  const workflowId =
    input.workflowTemplateId ?? (defaultWorkflow ? String(defaultWorkflow.id) : null);
  const id = randomUUID();

  getDatabase()
    .prepare(
      `INSERT INTO projects
       (id, name, description, project_type, status, start_date, due_date, tags, archived,
        workflow_template_id, project_set_id, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name.trim(),
      input.description ?? null,
      normalizeNullable(input.projectType),
      input.status ?? "active",
      input.startDate ?? null,
      input.dueDate ?? null,
      joinTags(input.tags),
      input.archived ? 1 : 0,
      workflowId,
      input.projectSetId ?? null,
      Date.now(),
    );

  return getProjects().find((project) => project.id === id);
}

export function updateProject(
  id: string,
  input: Partial<
    Pick<
      Project,
      | "name"
      | "description"
      | "projectType"
      | "status"
      | "startDate"
      | "dueDate"
      | "tags"
      | "archived"
      | "workflowTemplateId"
      | "projectSetId"
    >
  >,
) {
  const current = getProjects().find((project) => project.id === id);
  if (!current) return null;
  assertProjectSetExists(input.projectSetId);

  getDatabase()
    .prepare(
      `UPDATE projects
       SET name = ?, description = ?, status = ?, start_date = ?, due_date = ?, tags = ?,
           archived = ?, workflow_template_id = ?, project_type = ?, project_set_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .run(
      input.name?.trim() ?? current.name,
      input.description === undefined ? current.description : input.description,
      input.status ?? current.status,
      input.startDate === undefined ? current.startDate : input.startDate,
      input.dueDate === undefined ? current.dueDate : input.dueDate,
      input.tags === undefined ? joinTags(current.tags) : joinTags(input.tags),
      input.archived === undefined ? Number(current.archived) : Number(input.archived),
      input.workflowTemplateId === undefined
        ? current.workflowTemplateId
        : input.workflowTemplateId,
      input.projectType === undefined
        ? current.projectType
        : normalizeNullable(input.projectType),
      input.projectSetId === undefined ? current.projectSetId : input.projectSetId,
      id,
    );

  return getProjects().find((project) => project.id === id) ?? null;
}

export function deleteProject(id: string) {
  const current = getProjects().find((project) => project.id === id);
  if (!current) return false;

  const database = getDatabase();
  database.exec("BEGIN TRANSACTION");
  try {
    database.prepare("DELETE FROM tasks WHERE project_id = ?").run(id);
    database.prepare("DELETE FROM projects WHERE id = ?").run(id);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return true;
}

export function getTasks(): Task[] {
  const database = getDatabase();
  const assigneesByTaskId = new Map<string, Personnel[]>();
  const assignmentRows = database
    .prepare(
      `SELECT tp.task_id, p.*
       FROM task_personnel tp
       JOIN personnel p ON p.id = tp.personnel_id
       ORDER BY tp.created_at, p.name`,
    )
    .all() as Row[];

  for (const row of assignmentRows) {
    const taskId = String(row.task_id);
    const assignees = assigneesByTaskId.get(taskId) ?? [];
    assignees.push(mapPersonnel(row));
    assigneesByTaskId.set(taskId, assignees);
  }

  return (database.prepare("SELECT * FROM tasks ORDER BY sort_order, title").all() as Row[]).map(
    (row) => mapTask(row, assigneesByTaskId.get(String(row.id)) ?? []),
  );
}

export function getPersonnel(): Personnel[] {
  return (getDatabase()
    .prepare("SELECT * FROM personnel ORDER BY deleted_at IS NOT NULL, name, certificate_number")
    .all() as Row[]).map(mapPersonnel);
}

export function createPersonnel(input: { name: string; certificateNumber: string }) {
  const name = input.name.trim();
  const certificateNumber = input.certificateNumber.trim();
  if (!name || !certificateNumber) {
    throw new Error("姓名和证书编号不能为空");
  }
  if (findPersonnelByCertificateNumber(certificateNumber)) {
    throw new Error("证书编号已存在");
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO personnel
       (id, name, certificate_number, deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?)`,
    )
    .run(id, name, certificateNumber, now, now);

  return getPersonnel().find((person) => person.id === id)!;
}

export function updatePersonnel(
  id: string,
  input: { name?: string; certificateNumber?: string },
) {
  const current = getPersonnel().find((person) => person.id === id);
  if (!current) return null;
  if (current.deletedAt) {
    throw new Error("已删除人员不可编辑");
  }

  const name = input.name === undefined ? current.name : input.name.trim();
  const certificateNumber =
    input.certificateNumber === undefined
      ? current.certificateNumber
      : input.certificateNumber.trim();
  if (!name || !certificateNumber) {
    throw new Error("姓名和证书编号不能为空");
  }

  const duplicate = findPersonnelByCertificateNumber(certificateNumber);
  if (duplicate && duplicate.id !== id) {
    throw new Error("证书编号已存在");
  }

  getDatabase()
    .prepare(
      `UPDATE personnel
       SET name = ?, certificate_number = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(name, certificateNumber, new Date().toISOString(), id);

  return getPersonnel().find((person) => person.id === id) ?? null;
}

export function deletePersonnel(id: string) {
  const current = getPersonnel().find((person) => person.id === id);
  if (!current) return null;
  if (current.deletedAt) return current;

  const now = new Date().toISOString();
  getDatabase()
    .prepare("UPDATE personnel SET deleted_at = ?, updated_at = ? WHERE id = ?")
    .run(now, now, id);

  return getPersonnel().find((person) => person.id === id) ?? null;
}

function findPersonnelByCertificateNumber(certificateNumber: string) {
  const row = getDatabase()
    .prepare("SELECT * FROM personnel WHERE certificate_number = ?")
    .get(certificateNumber) as Row | undefined;
  return row ? mapPersonnel(row) : null;
}

export function createTask(input: {
  title: string;
  description?: string;
  sourceType?: TaskSourceType;
  priority?: Task["priority"];
  projectId?: string | null;
  parentId?: string | null;
  dueDate?: string | null;
  tags?: string[];
  statusKey?: string;
  templateNodeId?: string | null;
}) {
  const id = randomUUID();
  const siblingRows = getDatabase()
    .prepare(
      `SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order
       FROM tasks
       WHERE parent_id IS ? AND project_id IS ? AND source_type = ?`,
    )
    .get(
      input.parentId ?? null,
      input.projectId ?? null,
      input.sourceType ?? (input.projectId ? "project" : "temporary"),
    ) as Row;
  const sortOrder = Number(siblingRows.max_sort_order) + 1;

  getDatabase()
    .prepare(
      `INSERT INTO tasks
       (id, title, description, source_type, priority, status_key, due_date, sort_order, tags, project_id, parent_id, template_node_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.title.trim(),
      input.description ?? null,
      input.sourceType ?? (input.projectId ? "project" : "temporary"),
      input.priority ?? "medium",
      input.statusKey ?? "todo",
      input.dueDate ?? null,
      sortOrder,
      joinTags(input.tags),
      input.projectId ?? null,
      input.parentId ?? null,
      input.templateNodeId ?? null,
    );

  return getTasks().find((task) => task.id === id);
}

export function updateTask(
  id: string,
  input: Partial<
    Pick<
      Task,
      | "title"
      | "description"
      | "sourceType"
      | "priority"
      | "statusKey"
      | "dueDate"
      | "projectId"
      | "parentId"
      | "tags"
    >
  > & {
    startTime?: string | null;
    personnelIds?: string[];
  },
) {
  const tasks = getTasks();
  const current = tasks.find((task) => task.id === id);
  if (!current) return null;
  const nextParentId = input.parentId === undefined ? current.parentId : input.parentId;
  if (!canMoveTaskToParent(tasks, id, nextParentId ?? null)) return null;

  const completedAt =
    input.statusKey === "done" && current.completedAt === null
      ? new Date().toISOString()
      : input.statusKey && input.statusKey !== "done"
        ? null
        : current.completedAt;

  const startTime =
    input.startTime !== undefined
      ? input.startTime
      : input.statusKey === "in_progress" && current.startTime === null
        ? new Date().toISOString()
        : current.startTime;

  const requestedPersonnelIds = input.personnelIds
    ? [...new Set(input.personnelIds)]
    : null;
  if (requestedPersonnelIds) {
    const personnelById = new Map(getPersonnel().map((person) => [person.id, person]));
    const existingAssigneeIds = new Set(current.assignees.map((person) => person.id));
    for (const personnelId of requestedPersonnelIds) {
      const person = personnelById.get(personnelId);
      if (!person) throw new Error("人员不存在");
      if (person.deletedAt && !existingAssigneeIds.has(personnelId)) {
        throw new Error("已删除人员不能新增分配");
      }
    }
  }

  const database = getDatabase();
  database.exec("BEGIN TRANSACTION");
  try {
    database
      .prepare(
        `UPDATE tasks
         SET title = ?, description = ?, source_type = ?, priority = ?, status_key = ?,
             due_date = ?, start_time = ?, project_id = ?, parent_id = ?, completed_at = ?, tags = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .run(
        input.title?.trim() ?? current.title,
        input.description === undefined ? current.description : input.description,
        input.sourceType ?? current.sourceType,
        input.priority ?? current.priority,
        input.statusKey ?? current.statusKey,
        input.dueDate === undefined ? current.dueDate : input.dueDate,
        startTime,
        input.projectId === undefined ? current.projectId : input.projectId,
        nextParentId,
        completedAt,
        input.tags === undefined ? joinTags(current.tags) : joinTags(input.tags),
        id,
      );

    if (requestedPersonnelIds) {
      database.prepare("DELETE FROM task_personnel WHERE task_id = ?").run(id);
      const insertAssignment = database.prepare(
        `INSERT INTO task_personnel (task_id, personnel_id, created_at)
         VALUES (?, ?, ?)`,
      );
      const now = new Date().toISOString();
      for (const personnelId of requestedPersonnelIds) {
        insertAssignment.run(id, personnelId, now);
      }
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return getTasks().find((task) => task.id === id) ?? null;
}

export function assignTaskToProject(taskId: string, projectId: string) {
  const task = getTasks().find((item) => item.id === taskId);
  if (!task) return null;
  const project = getProjects().find((item) => item.id === projectId);
  if (!project) {
    throw new Error("项目不存在");
  }

  getDatabase()
    .prepare(
      `UPDATE tasks
       SET project_id = ?, source_type = 'project', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .run(projectId, taskId);

  return getTasks().find((item) => item.id === taskId) ?? null;
}

export function reorderTask(id: string, direction: "up" | "down"): SortPatch[] {
  const tasks = getTasks();
  const current = tasks.find((task) => task.id === id);
  if (!current) return [];
  const scope = tasks.filter(
    (task) =>
      task.parentId === current.parentId &&
      task.projectId === current.projectId &&
      task.sourceType === current.sourceType,
  );
  const patches = reorderTaskWithinSiblings(scope, id, direction);

  for (const patch of patches) {
    getDatabase()
      .prepare("UPDATE tasks SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(patch.sortOrder, patch.id);
  }

  return patches;
}

export function deleteTask(id: string) {
  const result = getDatabase().prepare("DELETE FROM tasks WHERE id = ?").run(id);
  return Number(result.changes) > 0;
}

export function getDataSafetyInfo() {
  const database = getDatabase();
  const projects = getProjects();
  const tasks = getTasks();
  const workflows = getWorkflows();
  const recurrenceRules = mapRecurrenceRows(database.prepare(recurrenceSelectSql).all());
  const taskTreeTemplates = getTaskTreeTemplates();
  const personnel = getPersonnel();
  const projectSets = getProjectSets();

  return {
    databasePath: dbPath,
    backupDirectory:
      dbPath === ":memory:" ? null : path.join(path.dirname(dbPath), "backups"),
    counts: {
      projectSets: projectSets.length,
      projects: projects.length,
      tasks: tasks.length,
      workflows: workflows.length,
      taskTreeTemplates: taskTreeTemplates.length,
      recurrenceRules: recurrenceRules.length,
      personnel: personnel.length,
    },
  };
}

export function exportLocalData(): LocalDataExport {
  const database = getDatabase();

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    projectSets: getProjectSets(),
    projects: getProjects(),
    tasks: getTasks(),
    workflows: getWorkflows(),
    recurrenceRules: mapRecurrenceRows(database.prepare(recurrenceSelectSql).all()),
    personnel: getPersonnel(),
  };
}

export function importLocalData(input: LocalDataExport): ImportSummary {
  const database = getDatabase();
  const summary: ImportSummary = {
    projectSets: 0,
    projects: 0,
    tasks: 0,
    workflows: 0,
    recurrenceRules: 0,
    personnel: 0,
  };

  database.exec("BEGIN TRANSACTION");
  try {
    for (const workflow of input.workflows ?? []) {
      upsertWorkflow(database, workflow);
      summary.workflows += 1;
    }
    for (const projectSet of input.projectSets ?? []) {
      upsertProjectSet(database, projectSet);
      summary.projectSets += 1;
    }
    for (const project of input.projects ?? []) {
      upsertProject(database, project);
      summary.projects += 1;
    }
    for (const person of input.personnel ?? []) {
      upsertPersonnel(database, person);
      summary.personnel += 1;
    }
    for (const task of sortTasksForImport(input.tasks ?? [])) {
      upsertTask(database, task);
      summary.tasks += 1;
    }
    for (const rule of input.recurrenceRules ?? []) {
      upsertRecurrence(database, rule);
      summary.recurrenceRules += 1;
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return summary;
}

function sortTasksForImport(tasks: Task[]) {
  const pending = [...tasks];
  const knownTaskIds = new Set(tasks.map((task) => task.id));
  const insertedTaskIds = new Set<string>();
  const ordered: Task[] = [];

  while (pending.length > 0) {
    const readyTasks = pending.filter(
      (task) =>
        task.parentId === null ||
        !knownTaskIds.has(task.parentId) ||
        insertedTaskIds.has(task.parentId),
    );

    if (readyTasks.length === 0) {
      throw new Error("任务导入失败：检测到无效的父子任务引用");
    }

    for (const task of readyTasks) {
      ordered.push(task);
      insertedTaskIds.add(task.id);
    }

    const readyTaskIds = new Set(readyTasks.map((task) => task.id));
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      if (readyTaskIds.has(pending[index].id)) {
        pending.splice(index, 1);
      }
    }
  }

  return ordered;
}

export function createDatabaseBackup(): BackupResult {
  if (dbPath === ":memory:") {
    throw new Error("内存数据库不支持文件备份");
  }

  getDatabase();
  const createdAt = new Date().toISOString();
  const absoluteDbPath = dbPath;
  const backupDirectory = path.join(path.dirname(dbPath), "backups");
  const safeTimestamp = createdAt.replaceAll(":", "-").replaceAll(".", "-");
  const backupPath = path.join(backupDirectory, `project-manager-${safeTimestamp}.sqlite`);

  if (!existsSync(backupDirectory)) {
    mkdirSync(backupDirectory, { recursive: true });
  }
  copyFileSync(absoluteDbPath, backupPath);

  return {
    databasePath: absoluteDbPath,
    backupPath,
    createdAt,
  };
}

export function getWorkflows(): WorkflowTemplate[] {
  const database = getDatabase();
  const templates = database
    .prepare("SELECT * FROM workflow_templates ORDER BY is_default DESC, name")
    .all() as Row[];
  const states = database
    .prepare("SELECT * FROM workflow_states ORDER BY sort_order")
    .all() as Row[];

  return templates.map((template) => ({
    id: String(template.id),
    name: String(template.name),
    description: asString(template.description),
    isDefault: Boolean(template.is_default),
    states: states
      .filter((state) => state.workflow_template_id === template.id)
      .map(mapWorkflowState),
  }));
}

export function getTaskTreeTemplates(): TaskTreeTemplate[] {
  const database = getDatabase();
  const templates = database
    .prepare("SELECT * FROM task_tree_templates ORDER BY project_type, name")
    .all() as Row[];
  const nodes = database
    .prepare("SELECT * FROM task_template_nodes ORDER BY sort_order, title")
    .all() as Row[];
  const dependencies = database
    .prepare("SELECT * FROM task_template_dependencies ORDER BY created_at")
    .all() as Row[];

  return templates.map((template) => {
    const templateId = String(template.id);
    const templateNodes = nodes
      .filter((node) => node.template_id === template.id)
      .map(mapTaskTemplateNode);

    return {
      id: templateId,
      name: String(template.name),
      description: asString(template.description),
      projectType: asString(template.project_type),
      matchKeywords: splitTags(template.match_keywords),
      workflowTemplateId: asString(template.workflow_template_id),
      nodes: buildTemplateTaskTree(templateNodes).map(mapTemplateTreeNode),
      dependencies: dependencies
        .filter((dependency) => dependency.template_id === template.id)
        .map(mapTaskTemplateDependency),
    };
  });
}

export function createTaskTreeTemplate(input: {
  name: string;
  description?: string | null;
  projectType?: string | null;
  matchKeywords?: string[];
  workflowTemplateId?: string | null;
  nodes: Array<{
    id?: string;
    title: string;
    description?: string | null;
    parentId?: string | null;
    workflowTemplateId?: string | null;
    defaultStatusKey?: string;
    priority?: Task["priority"];
    sortOrder?: number;
    tags?: string[];
  }>;
  dependencies?: Array<{
    fromNodeId: string;
    toNodeId: string;
    type?: TaskTemplateDependency["type"];
  }>;
}) {
  const nodes = input.nodes.filter((node) => node.title.trim());
  if (!input.name.trim() || nodes.length === 0) return null;

  const database = getDatabase();
  const templateId = randomUUID();
  const nodeIdMap = new Map<string, string>();
  database.exec("BEGIN TRANSACTION");
  try {
    database
      .prepare(
        `INSERT INTO task_tree_templates
         (id, name, description, project_type, match_keywords, workflow_template_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        templateId,
        input.name.trim(),
        input.description ?? null,
        normalizeNullable(input.projectType),
        joinTags(input.matchKeywords),
        input.workflowTemplateId ?? null,
      );

    nodes.forEach((node, index) => {
      const nextId = node.id ?? randomUUID();
      if (node.id) nodeIdMap.set(node.id, nextId);
      database
        .prepare(
          `INSERT INTO task_template_nodes
           (id, template_id, title, description, parent_id, workflow_template_id,
            default_status_key, priority, sort_order, tags)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          nextId,
          templateId,
          node.title.trim(),
          node.description ?? null,
          node.parentId ? (nodeIdMap.get(node.parentId) ?? node.parentId) : null,
          node.workflowTemplateId ?? input.workflowTemplateId ?? null,
          node.defaultStatusKey ?? "todo",
          node.priority ?? "medium",
          node.sortOrder ?? index + 1,
          joinTags(node.tags),
        );
      if (!node.id) nodeIdMap.set(nextId, nextId);
    });

    for (const dependency of input.dependencies ?? []) {
      const fromNodeId = nodeIdMap.get(dependency.fromNodeId) ?? dependency.fromNodeId;
      const toNodeId = nodeIdMap.get(dependency.toNodeId) ?? dependency.toNodeId;
      if (!fromNodeId || !toNodeId) continue;
      database
        .prepare(
          `INSERT INTO task_template_dependencies
           (id, template_id, from_node_id, to_node_id, type)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          templateId,
          fromNodeId,
          toNodeId,
          dependency.type ?? "finish_to_start",
        );
    }

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return getTaskTreeTemplates().find((template) => template.id === templateId) ?? null;
}

export function recommendTaskTreeTemplatesForProject(
  projectId: string,
): TaskTreeTemplateRecommendation[] {
  const project = getProjects().find((item) => item.id === projectId);
  if (!project) return [];
  return recommendTaskTreeTemplates(project, getTaskTreeTemplates());
}

export function getTaskDependencies(projectId?: string): TaskDependency[] {
  const rows = projectId
    ? getDatabase()
        .prepare("SELECT * FROM task_dependencies WHERE project_id = ? ORDER BY created_at")
        .all(projectId)
    : getDatabase()
        .prepare("SELECT * FROM task_dependencies ORDER BY created_at")
        .all();
  return (rows as Row[]).map(mapTaskDependency);
}

export function applyTaskTreeTemplateToProject(projectId: string, templateId: string) {
  const project = getProjects().find((item) => item.id === projectId);
  const template = getTaskTreeTemplates().find((item) => item.id === templateId);
  if (!project || !template || template.nodes.length === 0) return null;

  const database = getDatabase();
  const nodeToTaskId = new Map<string, string>();
  const createdTaskIds: string[] = [];
  database.exec("BEGIN TRANSACTION");
  try {
    const insertNode = (node: TaskTemplateNode, parentTaskId: string | null) => {
      const taskId = insertTask(database, {
        title: node.title,
        description: node.description ?? undefined,
        sourceType: "project",
        statusKey: node.defaultStatusKey,
        priority: node.priority,
        projectId,
        parentId: parentTaskId,
        sortOrder: node.sortOrder,
        tags: node.tags,
        templateNodeId: node.id,
      });
      nodeToTaskId.set(node.id, taskId);
      createdTaskIds.push(taskId);
      for (const child of node.children ?? []) {
        insertNode(child, taskId);
      }
    };

    for (const node of template.nodes) {
      insertNode(node, null);
    }

    for (const dependency of template.dependencies) {
      const fromTaskId = nodeToTaskId.get(dependency.fromNodeId);
      const toTaskId = nodeToTaskId.get(dependency.toNodeId);
      if (!fromTaskId || !toTaskId) continue;
      database
        .prepare(
          `INSERT INTO task_dependencies
           (id, project_id, from_task_id, to_task_id, type)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(randomUUID(), projectId, fromTaskId, toTaskId, dependency.type);
    }

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return {
    projectId,
    templateId,
    createdTasks: createdTaskIds.length,
    createdTaskIds,
  };
}

export function getRootTaskTemplates(): RootTaskTemplate[] {
  const database = getDatabase();
  const templates = database
    .prepare("SELECT rowid AS created_order, * FROM root_task_templates ORDER BY project_type, name")
    .all() as Row[];
  const nodes = database
    .prepare("SELECT * FROM root_task_template_nodes ORDER BY sort_order, title")
    .all() as Row[];
  const dependencies = database
    .prepare("SELECT * FROM root_task_template_dependencies ORDER BY sort_order, created_at")
    .all() as Row[];

  return templates.map((template) => {
    const templateId = String(template.id);
    const templateNodes = nodes
      .filter((node) => node.template_id === template.id)
      .map(mapRootTaskTemplateNode);
    const templateDependencies = dependencies
      .filter((dependency) => dependency.template_id === template.id)
      .map(mapRootTaskTemplateDependency);

    return {
      id: templateId,
      name: String(template.name),
      description: asString(template.description),
      projectType: asString(template.project_type),
      rootTitle: String(template.root_title),
      matchKeywords: splitTags(template.match_keywords),
      createdOrder: Number(template.created_order),
      nodes: buildTemplateTaskTree(templateNodes).map(mapRootTemplateTreeNode),
      dependencies: templateDependencies,
    };
  });
}

export function createRootTaskTemplate(input: RootTaskTemplateInput) {
  const nodes = input.nodes.filter((node) => node.title.trim());
  if (!input.name.trim() || !input.rootTitle.trim() || nodes.length === 0) return null;

  const database = getDatabase();
  const templateId = randomUUID();
  const nodeIdMap = new Map<string, string>();

  database.exec("BEGIN TRANSACTION");
  try {
    database
      .prepare(
        `INSERT INTO root_task_templates
         (id, name, description, project_type, root_title, match_keywords)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        templateId,
        input.name.trim(),
        input.description ?? null,
        normalizeNullable(input.projectType),
        input.rootTitle.trim(),
        joinTags(input.matchKeywords),
      );

    nodes.forEach((node, index) => {
      const nextId = node.id ?? randomUUID();
      if (node.id) nodeIdMap.set(node.id, nextId);
      database
        .prepare(
          `INSERT INTO root_task_template_nodes
           (id, template_id, title, description, parent_id,
            default_status_key, priority, sort_order, position_x, position_y, tags)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          nextId,
          templateId,
          node.title.trim(),
          node.description ?? null,
          node.parentId ? (nodeIdMap.get(node.parentId) ?? node.parentId) : null,
          node.defaultStatusKey ?? "todo",
          node.priority ?? "medium",
          node.sortOrder ?? index + 1,
          node.positionX ?? index * 260,
          node.positionY ?? 80,
          joinTags(node.tags),
        );
      if (!node.id) nodeIdMap.set(nextId, nextId);
    });

    insertRootTaskTemplateDependencies(database, templateId, input.dependencies, nodeIdMap);

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return getRootTaskTemplates().find((template) => template.id === templateId) ?? null;
}

export function updateRootTaskTemplate(
  templateId: string,
  input: RootTaskTemplateInput,
) {
  const nodes = input.nodes.filter((node) => node.title.trim());
  if (!templateId || !input.name.trim() || !input.rootTitle.trim() || nodes.length === 0) {
    return null;
  }

  const database = getDatabase();
  const existing = database
    .prepare("SELECT id FROM root_task_templates WHERE id = ?")
    .get(templateId) as Row | undefined;
  if (!existing) return null;

  const nodeIdMap = new Map<string, string>();

  database.exec("BEGIN TRANSACTION");
  try {
    database
      .prepare(
        `UPDATE root_task_templates
         SET name = ?, description = ?, project_type = ?, root_title = ?,
             match_keywords = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .run(
        input.name.trim(),
        input.description ?? null,
        normalizeNullable(input.projectType),
        input.rootTitle.trim(),
        joinTags(input.matchKeywords),
        templateId,
      );

    database
      .prepare("DELETE FROM root_task_template_dependencies WHERE template_id = ?")
      .run(templateId);

    database
      .prepare("DELETE FROM root_task_template_nodes WHERE template_id = ?")
      .run(templateId);

    nodes.forEach((node, index) => {
      const nextId = node.id ?? randomUUID();
      if (node.id) nodeIdMap.set(node.id, nextId);
      database
        .prepare(
          `INSERT INTO root_task_template_nodes
           (id, template_id, title, description, parent_id,
            default_status_key, priority, sort_order, position_x, position_y, tags)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          nextId,
          templateId,
          node.title.trim(),
          node.description ?? null,
          node.parentId ? (nodeIdMap.get(node.parentId) ?? node.parentId) : null,
          node.defaultStatusKey ?? "todo",
          node.priority ?? "medium",
          node.sortOrder ?? index + 1,
          node.positionX ?? index * 260,
          node.positionY ?? 80,
          joinTags(node.tags),
        );
      if (!node.id) nodeIdMap.set(nextId, nextId);
    });

    insertRootTaskTemplateDependencies(database, templateId, input.dependencies, nodeIdMap);

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return getRootTaskTemplates().find((template) => template.id === templateId) ?? null;
}

export function deleteRootTaskTemplate(templateId: string) {
  const database = getDatabase();
  const result = database
    .prepare("DELETE FROM root_task_templates WHERE id = ?")
    .run(templateId);

  return result.changes > 0;
}

function insertRootTaskTemplateDependencies(
  database: DatabaseSync,
  templateId: string,
  dependencies: RootTaskTemplateInput["dependencies"],
  nodeIdMap: Map<string, string>,
) {
  const validNodeIds = new Set(nodeIdMap.values());
  for (const [index, dependency] of (dependencies ?? []).entries()) {
    const fromNodeId = nodeIdMap.get(dependency.fromNodeId) ?? dependency.fromNodeId;
    const toNodeId = nodeIdMap.get(dependency.toNodeId) ?? dependency.toNodeId;
    if (!validNodeIds.has(fromNodeId) || !validNodeIds.has(toNodeId) || fromNodeId === toNodeId) {
      continue;
    }

    database
      .prepare(
        `INSERT INTO root_task_template_dependencies
         (id, template_id, from_node_id, to_node_id, type, label, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        dependency.id ?? randomUUID(),
        templateId,
        fromNodeId,
        toNodeId,
        dependency.type ?? "sequence",
        normalizeNullable(dependency.label),
        dependency.sortOrder ?? index + 1,
      );
  }
}

export function createRootTaskFromBestTemplate(input: {
  projectId: string;
  title: string;
  description?: string;
  priority?: Task["priority"];
  tags?: string[];
  rootTaskTemplateId?: string | null;
}) {
  const project = getProjects().find((item) => item.id === input.projectId);
  if (!project || !input.title.trim()) return null;

  const template = input.rootTaskTemplateId
    ? getRootTaskTemplates().find((item) => item.id === input.rootTaskTemplateId) ?? null
    : findBestRootTaskTemplate(project, input.title);
  const root = createTask({
    title: input.title,
    description: input.description,
    sourceType: "project",
    priority: input.priority,
    projectId: project.id,
    tags: input.tags,
  });
  if (!root) return null;

  const createdTaskIds = [root.id];
  if (template) {
    const templateNodeToTaskId = new Map<string, string>();
    const insertChildren = (nodes: RootTaskTemplateNode[], parentTaskId: string) => {
      for (const node of nodes) {
        const child = createTask({
          title: node.title,
          description: node.description ?? undefined,
          sourceType: "project",
          priority: node.priority,
          statusKey: node.defaultStatusKey,
          projectId: project.id,
          parentId: parentTaskId,
          tags: node.tags,
        });
        if (!child) continue;
        templateNodeToTaskId.set(node.id, child.id);
        createdTaskIds.push(child.id);
        insertChildren(node.children ?? [], child.id);
      }
    };

    insertChildren(template.nodes, root.id);

    for (const dependency of template.dependencies) {
      const fromTaskId = templateNodeToTaskId.get(dependency.fromNodeId);
      const toTaskId = templateNodeToTaskId.get(dependency.toNodeId);
      if (!fromTaskId || !toTaskId) continue;
      getDatabase()
        .prepare(
          `INSERT INTO task_dependencies
           (id, project_id, from_task_id, to_task_id, type)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          project.id,
          fromTaskId,
          toTaskId,
          dependency.type === "strong_binding" ? "strong_binding" : "finish_to_start",
        );
    }
  }

  return {
    rootTaskId: root.id,
    templateId: template?.id ?? null,
    createdTasks: createdTaskIds.length,
    createdTaskIds,
  };
}

function findBestRootTaskTemplate(project: Project, rootTitle: string) {
  const normalizedProjectType = normalizeMatchText(project.projectType);
  const normalizedTitle = normalizeMatchText(rootTitle);

  return getRootTaskTemplates()
    .map((template) => {
      let score = 0;
      if (
        normalizedProjectType &&
        normalizeMatchText(template.projectType) === normalizedProjectType
      ) {
        score += 60;
      }
      if (normalizeMatchText(template.rootTitle) === normalizedTitle) {
        score += 40;
      }
      for (const keyword of template.matchKeywords.map(normalizeMatchText).filter(Boolean)) {
        if (normalizedTitle.includes(keyword)) score += 20;
      }
      return { template, score };
    })
    .filter((item) => item.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.template.createdOrder - a.template.createdOrder ||
        a.template.name.localeCompare(b.template.name, "zh-CN"),
    )[0]
    ?.template ?? null;
}

export function createWorkflowTemplate(input: {
  name: string;
  description?: string | null;
  states: Array<{
    key: string;
    label: string;
    color: string;
    isDefault?: boolean;
    isCompleted?: boolean;
  }>;
}) {
  const states = normalizeWorkflowStates(input.states);
  if (!input.name.trim() || states.length < 2) return null;

  const id = randomUUID();
  const database = getDatabase();
  database
    .prepare(
      "INSERT INTO workflow_templates (id, name, description, is_default) VALUES (?, ?, ?, 0)",
    )
    .run(id, input.name.trim(), input.description ?? null);

  insertWorkflowStates(database, id, states);

  return getWorkflows().find((workflow) => workflow.id === id) ?? null;
}

export function createRecurrence(input: {
  taskId?: string;
  taskTitle?: string;
  frequency: RecurrenceRule["frequency"];
  interval?: number;
  startAt?: string;
  nextRunAt?: string;
  endsAt?: string | null;
}) {
  let taskId = input.taskId;
  if (!taskId && input.taskTitle?.trim()) {
    taskId = createTask({
      title: input.taskTitle,
      sourceType: "recurring",
      dueDate: input.startAt ?? null,
    })?.id;
  }
  if (!taskId) return null;

  const id = randomUUID();
  const interval = input.interval ?? 1;
  const startAt = input.startAt ?? input.nextRunAt ?? new Date().toISOString();
  const nextRunAt =
    input.nextRunAt ??
    getNextOccurrenceFromStart({
      frequency: input.frequency,
      interval,
      startAt: new Date(startAt),
    }).toISOString();

  getDatabase()
    .prepare(
      `INSERT INTO recurrence_rules (id, task_id, frequency, interval, start_at, next_run_at, ends_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, taskId, input.frequency, interval, startAt, nextRunAt, input.endsAt ?? null);

  return mapRecurrenceRows(
    getDatabase().prepare(`${recurrenceSelectSql} WHERE r.id = ?`).all(id),
  )[0];
}

export function updateRecurrence(
  id: string,
  input: Partial<Pick<RecurrenceRule, "frequency" | "interval" | "startAt" | "nextRunAt" | "endsAt" | "paused" | "taskTitle">>,
) {
  const rule = mapRecurrenceRows(
    getDatabase().prepare(`${recurrenceSelectSql} WHERE r.id = ?`).all(id),
  )[0];
  if (!rule) return null;

  const nextFrequency = input.frequency ?? rule.frequency;
  const nextInterval = input.interval ?? rule.interval;
  const nextStartAt = input.startAt ?? rule.startAt;
  const nextRunAt =
    input.nextRunAt ??
    (input.startAt !== undefined || input.frequency !== undefined || input.interval !== undefined
      ? getNextOccurrenceFromStart({
          frequency: nextFrequency,
          interval: nextInterval,
          startAt: new Date(nextStartAt),
        }).toISOString()
      : rule.nextRunAt);

  if (input.taskTitle?.trim()) {
    updateTask(rule.taskId, { title: input.taskTitle.trim() });
  }

  getDatabase()
    .prepare(
      `UPDATE recurrence_rules
       SET frequency = ?, interval = ?, start_at = ?, next_run_at = ?, ends_at = ?,
           paused = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .run(
      nextFrequency,
      nextInterval,
      nextStartAt,
      nextRunAt,
      input.endsAt === undefined ? rule.endsAt : input.endsAt,
      input.paused === undefined ? Number(rule.paused) : Number(input.paused),
      id,
    );

  return mapRecurrenceRows(
    getDatabase().prepare(`${recurrenceSelectSql} WHERE r.id = ?`).all(id),
  )[0];
}

export function generateRecurringTask(
  ruleId: string,
  options?: { occurrenceAt?: string },
) {
  const rule = mapRecurrenceRows(
    getDatabase().prepare(`${recurrenceSelectSql} WHERE r.id = ?`).all(ruleId),
  )[0];
  if (!rule || rule.paused) return null;
  const occurrenceAt = options?.occurrenceAt ?? rule.nextRunAt;
  if (rule.endsAt && occurrenceAt > rule.endsAt) return null;
  const duplicate = getDatabase()
    .prepare(
      `SELECT id FROM tasks
       WHERE recurrence_rule_id = ? AND recurrence_occurrence_at = ?
       LIMIT 1`,
    )
    .get(rule.id, occurrenceAt) as Row | undefined;
  if (duplicate) return null;
  if (occurrenceAt !== rule.nextRunAt) return null;

  const sourceTask = getTasks().find((task) => task.id === rule.taskId);
  if (!sourceTask) return null;

  const instance = createTask({
    title: sourceTask.title,
    description: sourceTask.description ?? undefined,
    sourceType: "recurring",
    priority: sourceTask.priority,
    projectId: sourceTask.projectId,
    dueDate: occurrenceAt,
  });
  if (!instance) return null;
  getDatabase()
    .prepare(
      `UPDATE tasks
       SET recurrence_rule_id = ?, recurrence_occurrence_at = ?
       WHERE id = ?`,
    )
    .run(rule.id, occurrenceAt, instance.id);
  const nextRunAt = getNextOccurrence({
    frequency: rule.frequency,
    interval: rule.interval,
    nextRunAt: new Date(occurrenceAt),
  }).toISOString();

  getDatabase()
    .prepare("UPDATE recurrence_rules SET next_run_at = ? WHERE id = ?")
    .run(nextRunAt, rule.id);

  return instance;
}

function createSchema(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS workflow_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS workflow_states (
      id TEXT PRIMARY KEY,
      workflow_template_id TEXT NOT NULL,
      key TEXT NOT NULL,
      label TEXT NOT NULL,
      color TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      is_completed INTEGER NOT NULL DEFAULT 0,
      UNIQUE(workflow_template_id, key),
      FOREIGN KEY(workflow_template_id) REFERENCES workflow_templates(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_sets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      project_type TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      start_date TEXT,
      due_date TEXT,
      tags TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      workflow_template_id TEXT,
      project_set_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(workflow_template_id) REFERENCES workflow_templates(id),
      FOREIGN KEY(project_set_id) REFERENCES project_sets(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      source_type TEXT NOT NULL DEFAULT 'temporary',
      priority TEXT NOT NULL DEFAULT 'medium',
      status_key TEXT NOT NULL DEFAULT 'todo',
      due_date TEXT,
      start_time TEXT,
      completed_at TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      tags TEXT NOT NULL DEFAULT '',
      project_id TEXT,
      parent_id TEXT,
      template_node_id TEXT,
      recurrence_rule_id TEXT,
      recurrence_occurrence_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL,
      FOREIGN KEY(parent_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY(recurrence_rule_id) REFERENCES recurrence_rules(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS personnel (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      certificate_number TEXT NOT NULL UNIQUE,
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS task_personnel (
      task_id TEXT NOT NULL,
      personnel_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (task_id, personnel_id),
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY(personnel_id) REFERENCES personnel(id)
    );

    CREATE TABLE IF NOT EXISTS task_tree_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      project_type TEXT,
      match_keywords TEXT NOT NULL DEFAULT '',
      workflow_template_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(workflow_template_id) REFERENCES workflow_templates(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS task_template_nodes (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      parent_id TEXT,
      workflow_template_id TEXT,
      default_status_key TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'medium',
      sort_order INTEGER NOT NULL DEFAULT 0,
      tags TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(template_id) REFERENCES task_tree_templates(id) ON DELETE CASCADE,
      FOREIGN KEY(parent_id) REFERENCES task_template_nodes(id) ON DELETE CASCADE,
      FOREIGN KEY(workflow_template_id) REFERENCES workflow_templates(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS task_template_dependencies (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      from_node_id TEXT NOT NULL,
      to_node_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'finish_to_start',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(template_id) REFERENCES task_tree_templates(id) ON DELETE CASCADE,
      FOREIGN KEY(from_node_id) REFERENCES task_template_nodes(id) ON DELETE CASCADE,
      FOREIGN KEY(to_node_id) REFERENCES task_template_nodes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_dependencies (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      from_task_id TEXT NOT NULL,
      to_task_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'finish_to_start',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(from_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY(to_task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS root_task_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      project_type TEXT,
      root_title TEXT NOT NULL,
      match_keywords TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS root_task_template_nodes (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      parent_id TEXT,
      default_status_key TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'medium',
      sort_order INTEGER NOT NULL DEFAULT 0,
      position_x REAL NOT NULL DEFAULT 0,
      position_y REAL NOT NULL DEFAULT 0,
      tags TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(template_id) REFERENCES root_task_templates(id) ON DELETE CASCADE,
      FOREIGN KEY(parent_id) REFERENCES root_task_template_nodes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS root_task_template_dependencies (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      from_node_id TEXT NOT NULL,
      to_node_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'sequence',
      label TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(template_id) REFERENCES root_task_templates(id) ON DELETE CASCADE,
      FOREIGN KEY(from_node_id) REFERENCES root_task_template_nodes(id) ON DELETE CASCADE,
      FOREIGN KEY(to_node_id) REFERENCES root_task_template_nodes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recurrence_rules (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL UNIQUE,
      frequency TEXT NOT NULL,
      interval INTEGER NOT NULL DEFAULT 1,
      start_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      next_run_at TEXT NOT NULL,
      ends_at TEXT,
      paused INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );
  `);
  ensureColumn(database, "projects", "project_type", "TEXT");
  ensureColumn(database, "projects", "start_date", "TEXT");
  ensureColumn(
    database,
    "projects",
    "project_set_id",
    "TEXT REFERENCES project_sets(id) ON DELETE SET NULL",
  );
  ensureColumn(database, "tasks", "template_node_id", "TEXT");
  ensureColumn(database, "tasks", "start_time", "TEXT");
  ensureColumn(database, "tasks", "recurrence_rule_id", "TEXT");
  ensureColumn(database, "tasks", "recurrence_occurrence_at", "TEXT");
  ensureColumn(database, "root_task_template_nodes", "position_x", "REAL NOT NULL DEFAULT 0");
  ensureColumn(database, "root_task_template_nodes", "position_y", "REAL NOT NULL DEFAULT 0");
  ensureColumn(database, "recurrence_rules", "start_at", "TEXT");
  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_projects_project_set_id ON projects(project_set_id)",
  );
  ensureUniqueIndex(
    database,
    "idx_tasks_recurrence_occurrence",
    "tasks",
    "recurrence_rule_id, recurrence_occurrence_at",
    "recurrence_rule_id IS NOT NULL AND recurrence_occurrence_at IS NOT NULL",
  );
}

function seedIfEmpty(database: DatabaseSync) {
  const count = database.prepare("SELECT COUNT(*) AS count FROM workflow_templates").get() as Row;
  if (Number(count.count) > 0) return;

  const workflowId = randomUUID();
  database
    .prepare("INSERT INTO workflow_templates (id, name, description, is_default) VALUES (?, ?, ?, 1)")
    .run(workflowId, "标准推进流", "适合个人项目和日常任务的默认流程");

  const states = [
    ["todo", "待办", "#5b6472", 1, 1, 0],
    ["in_progress", "进行中", "#2563eb", 2, 0, 0],
    ["blocked", "阻塞", "#d97706", 3, 0, 0],
    ["done", "完成", "#16a34a", 4, 0, 1],
  ];
  for (const [key, label, color, sortOrder, isDefault, isCompleted] of states) {
    database
      .prepare(
        `INSERT INTO workflow_states
         (id, workflow_template_id, key, label, color, sort_order, is_default, is_completed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), workflowId, key, label, color, sortOrder, isDefault, isCompleted);
  }

  const launchProjectId = randomUUID();
  const personalProjectId = randomUUID();
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

  database
    .prepare(
      `INSERT INTO projects (id, name, description, status, due_date, tags, sort_order, workflow_template_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      launchProjectId,
      "个人项目管理平台 MVP",
      "搭建统一任务池、项目任务树和周期任务能力。",
      "active",
      nextWeek.toISOString(),
      "产品,开发",
      1,
      workflowId,
    );
  database
    .prepare(
      `INSERT INTO projects (id, name, description, status, due_date, tags, sort_order, workflow_template_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      personalProjectId,
      "个人成长系统",
      "整理阅读、复盘和周期习惯任务。",
      "active",
      null,
      "生活,学习",
      2,
      workflowId,
    );

  const root = insertTask(database, {
    title: "完成平台信息架构",
    sourceType: "project",
    statusKey: "in_progress",
    projectId: launchProjectId,
    dueDate: today.toISOString(),
    sortOrder: 1,
  });
  const child = insertTask(database, {
    title: "定义任务与项目数据模型",
    sourceType: "project",
    statusKey: "done",
    projectId: launchProjectId,
    parentId: root,
    sortOrder: 1,
  });
  insertTask(database, {
    title: "确认周期任务字段",
    sourceType: "project",
    statusKey: "todo",
    projectId: launchProjectId,
    parentId: child,
    sortOrder: 1,
  });
  insertTask(database, {
    title: "制作首页概览",
    sourceType: "project",
    statusKey: "todo",
    projectId: launchProjectId,
    dueDate: tomorrow.toISOString(),
    sortOrder: 2,
  });
  insertTask(database, {
    title: "临时整理采购清单",
    sourceType: "temporary",
    statusKey: "todo",
    dueDate: today.toISOString(),
    sortOrder: 3,
  });
  const weeklyReview = insertTask(database, {
    title: "每周项目复盘",
    sourceType: "recurring",
    statusKey: "todo",
    projectId: personalProjectId,
    dueDate: nextWeek.toISOString(),
    sortOrder: 4,
  });
  database
    .prepare(
      "INSERT INTO recurrence_rules (id, task_id, frequency, interval, next_run_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(randomUUID(), weeklyReview, "weekly", 1, nextWeek.toISOString());
}

function seedTaskTreeTemplatesIfEmpty(database: DatabaseSync) {
  const count = database.prepare("SELECT COUNT(*) AS count FROM task_tree_templates").get() as Row;
  if (Number(count.count) > 0) return;

  const workflow = database
    .prepare("SELECT id FROM workflow_templates WHERE is_default = 1 LIMIT 1")
    .get() as Row | undefined;
  const workflowId = workflow ? String(workflow.id) : null;
  const templateId = randomUUID();
  const fieldNodeId = randomUUID();
  const reportNodeId = randomUUID();
  const draftNodeId = randomUUID();

  database
    .prepare(
      `INSERT INTO task_tree_templates
       (id, name, description, project_type, match_keywords, workflow_template_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      templateId,
      "安全测评标准任务树",
      "适合测评、报告、整改复核类项目",
      "安全测评",
      "测评,报告,整改",
      workflowId,
    );

  for (const node of [
    [fieldNodeId, "现场测评", null, 1],
    [reportNodeId, "报告编制", null, 2],
    [draftNodeId, "撰写初稿", reportNodeId, 1],
  ] as const) {
    database
      .prepare(
        `INSERT INTO task_template_nodes
         (id, template_id, title, parent_id, workflow_template_id, default_status_key, priority, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(node[0], templateId, node[1], node[2], workflowId, "todo", "medium", node[3]);
  }

  database
    .prepare(
      `INSERT INTO task_template_dependencies
       (id, template_id, from_node_id, to_node_id, type)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(randomUUID(), templateId, fieldNodeId, reportNodeId, "finish_to_start");
}

function seedRootTaskTemplatesIfEmpty(database: DatabaseSync) {
  const count = database.prepare("SELECT COUNT(*) AS count FROM root_task_templates").get() as Row;
  if (Number(count.count) > 0) return;

  const templateId = randomUUID();
  const reviewNodeId = randomUUID();

  database
    .prepare(
      `INSERT INTO root_task_templates
       (id, name, description, project_type, root_title, match_keywords)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      templateId,
      "安全测评报告编制模板",
      "添加报告编制根任务时自动生成报告子任务",
      "安全测评",
      "报告编制",
      "报告,编制",
    );

  for (const node of [
    [randomUUID(), "撰写初稿", null, 1],
    [reviewNodeId, "内部审核", null, 2],
    [randomUUID(), "修改审核问题", reviewNodeId, 1],
  ] as const) {
    database
      .prepare(
        `INSERT INTO root_task_template_nodes
         (id, template_id, title, parent_id, default_status_key, priority, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(node[0], templateId, node[1], node[2], "todo", "medium", node[3]);
  }
}

function insertTask(database: DatabaseSync, input: {
  title: string;
  description?: string | null;
  sourceType: string;
  statusKey: string;
  priority?: Task["priority"];
  projectId?: string | null;
  parentId?: string | null;
  dueDate?: string | null;
  sortOrder: number;
  tags?: string[];
  templateNodeId?: string | null;
}) {
  const id = randomUUID();
  database
    .prepare(
      `INSERT INTO tasks
       (id, title, description, source_type, priority, status_key, due_date,
        sort_order, tags, project_id, parent_id, template_node_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.title,
      input.description ?? null,
      input.sourceType,
      input.priority ?? "medium",
      input.statusKey,
      input.dueDate ?? null,
      input.sortOrder,
      joinTags(input.tags),
      input.projectId ?? null,
      input.parentId ?? null,
      input.templateNodeId ?? null,
    );
  return id;
}

function normalizeWorkflowStates(
  states: Array<{
    key: string;
    label: string;
    color: string;
    isDefault?: boolean;
    isCompleted?: boolean;
  }>,
) {
  const normalized = states
    .map((state) => ({
      key: state.key.trim(),
      label: state.label.trim(),
      color: state.color.trim() || "#64748b",
      isDefault: Boolean(state.isDefault),
      isCompleted: Boolean(state.isCompleted),
    }))
    .filter((state) => state.key && state.label);

  const defaultIndex = normalized.findIndex((state) => state.isDefault);
  const completedIndex = normalized.findIndex((state) => state.isCompleted);

  return normalized.map((state, index) => ({
    ...state,
    isDefault: defaultIndex === -1 ? index === 0 : index === defaultIndex,
    isCompleted:
      completedIndex === -1 ? index === normalized.length - 1 : index === completedIndex,
  }));
}

function insertWorkflowStates(
  database: DatabaseSync,
  workflowTemplateId: string,
  states: ReturnType<typeof normalizeWorkflowStates>,
) {
  states.forEach((state, index) => {
    database
      .prepare(
        `INSERT INTO workflow_states
         (id, workflow_template_id, key, label, color, sort_order, is_default, is_completed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        workflowTemplateId,
        state.key,
        state.label,
        state.color,
        index + 1,
        Number(state.isDefault),
        Number(state.isCompleted),
      );
  });
}

function upsertWorkflow(database: DatabaseSync, workflow: WorkflowTemplate) {
  database
    .prepare(
      `INSERT INTO workflow_templates
       (id, name, description, is_default)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         description = excluded.description,
         is_default = excluded.is_default,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .run(
      workflow.id,
      workflow.name,
      workflow.description,
      Number(workflow.isDefault),
    );
  for (const state of workflow.states) {
    database
      .prepare(
        `INSERT INTO workflow_states
         (id, workflow_template_id, key, label, color, sort_order, is_default, is_completed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workflow_template_id, key) DO UPDATE SET
           label = excluded.label,
           color = excluded.color,
           sort_order = excluded.sort_order,
           is_default = excluded.is_default,
           is_completed = excluded.is_completed`,
      )
      .run(
        state.id,
        workflow.id,
        state.key,
        state.label,
        state.color,
        state.sortOrder,
        Number(state.isDefault),
        Number(state.isCompleted),
      );
  }
}

function upsertProject(database: DatabaseSync, project: ImportedProjectSnapshot) {
  database
    .prepare(
      `INSERT INTO projects
       (id, name, description, project_type, status, start_date, due_date, tags, sort_order,
        archived, workflow_template_id, project_set_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         description = excluded.description,
         project_type = excluded.project_type,
         status = excluded.status,
         start_date = excluded.start_date,
         due_date = excluded.due_date,
         tags = excluded.tags,
         sort_order = excluded.sort_order,
         archived = excluded.archived,
         workflow_template_id = excluded.workflow_template_id,
         project_set_id = excluded.project_set_id,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .run(
      project.id,
      project.name,
      project.description,
      project.projectType,
      project.status,
      project.startDate ?? null,
      project.dueDate,
      joinTags(project.tags),
      project.sortOrder,
      Number(project.archived),
      project.workflowTemplateId,
      project.projectSetId ?? null,
    );
}

function upsertProjectSet(database: DatabaseSync, projectSet: ProjectSet) {
  database
    .prepare(
      `INSERT INTO project_sets (id, name, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         sort_order = excluded.sort_order,
         updated_at = excluded.updated_at`,
    )
    .run(
      projectSet.id,
      projectSet.name,
      projectSet.sortOrder,
      projectSet.createdAt,
      projectSet.updatedAt,
    );
}

function upsertTask(database: DatabaseSync, task: Task) {
  database
    .prepare(
      `INSERT INTO tasks
       (id, title, description, source_type, priority, status_key, due_date,
        start_time, completed_at, sort_order, tags, project_id, parent_id, template_node_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         description = excluded.description,
         source_type = excluded.source_type,
         priority = excluded.priority,
         status_key = excluded.status_key,
         due_date = excluded.due_date,
         start_time = excluded.start_time,
         completed_at = excluded.completed_at,
         sort_order = excluded.sort_order,
         tags = excluded.tags,
         project_id = excluded.project_id,
         parent_id = excluded.parent_id,
         template_node_id = excluded.template_node_id,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .run(
      task.id,
      task.title,
      task.description,
      task.sourceType,
      task.priority,
      task.statusKey,
      task.dueDate,
      task.startTime ?? null,
      task.completedAt,
      task.sortOrder,
      joinTags(task.tags),
      task.projectId,
      task.parentId,
      task.templateNodeId ?? null,
    );

  if (task.assignees) {
    database.prepare("DELETE FROM task_personnel WHERE task_id = ?").run(task.id);
    const insertAssignment = database.prepare(
      `INSERT INTO task_personnel (task_id, personnel_id, created_at)
       VALUES (?, ?, ?)`,
    );
    for (const person of task.assignees) {
      const exists = database.prepare("SELECT id FROM personnel WHERE id = ?").get(person.id);
      if (exists) insertAssignment.run(task.id, person.id, new Date().toISOString());
    }
  }
}

function upsertPersonnel(database: DatabaseSync, person: Personnel) {
  database
    .prepare(
      `INSERT INTO personnel
       (id, name, certificate_number, deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         certificate_number = excluded.certificate_number,
         deleted_at = excluded.deleted_at,
         updated_at = excluded.updated_at`,
    )
    .run(
      person.id,
      person.name,
      person.certificateNumber,
      person.deletedAt,
      person.createdAt,
      person.updatedAt,
    );
}

function upsertRecurrence(database: DatabaseSync, rule: RecurrenceRule) {
  database
    .prepare(
      `INSERT INTO recurrence_rules
       (id, task_id, frequency, interval, start_at, next_run_at, ends_at, paused)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         task_id = excluded.task_id,
         frequency = excluded.frequency,
         interval = excluded.interval,
         start_at = excluded.start_at,
         next_run_at = excluded.next_run_at,
         ends_at = excluded.ends_at,
         paused = excluded.paused,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .run(
      rule.id,
      rule.taskId,
      rule.frequency,
      rule.interval,
      rule.startAt,
      rule.nextRunAt,
      rule.endsAt,
      Number(rule.paused),
    );
}

function mapProject(row: Row): Project {
  return {
    id: String(row.id),
    name: String(row.name),
    description: asString(row.description),
    projectType: asString(row.project_type),
    status: String(row.status),
    startDate: asString(row.start_date),
    dueDate: asString(row.due_date),
    tags: splitTags(row.tags),
    sortOrder: Number(row.sort_order),
    archived: Boolean(row.archived),
    workflowTemplateId: asString(row.workflow_template_id),
    projectSetId: asString(row.project_set_id),
  };
}

function mapProjectSet(row: Row): ProjectSet {
  return {
    id: String(row.id),
    name: String(row.name),
    sortOrder: Number(row.sort_order),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function assertProjectSetExists(projectSetId: string | null | undefined) {
  if (projectSetId == null) return;
  const projectSet = getDatabase()
    .prepare("SELECT 1 FROM project_sets WHERE id = ? LIMIT 1")
    .get(projectSetId);
  if (!projectSet) throw new ProjectSetNotFoundError();
}

function ensureColumn(
  database: DatabaseSync,
  tableName: string,
  columnName: string,
  definition: string,
) {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all() as Row[];
  if (columns.some((column) => column.name === columnName)) return;
  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function ensureUniqueIndex(
  database: DatabaseSync,
  indexName: string,
  tableName: string,
  columns: string,
  whereClause: string,
) {
  database.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS ${indexName}
     ON ${tableName} (${columns})
     WHERE ${whereClause}`,
  );
}

function mapTask(row: Row, assignees: Personnel[] = []): Task {
  return {
    id: String(row.id),
    title: String(row.title),
    description: asString(row.description),
    sourceType: String(row.source_type) as TaskSourceType,
    priority: String(row.priority) as Task["priority"],
    statusKey: String(row.status_key),
    dueDate: asString(row.due_date),
    startTime: asString(row.start_time),
    completedAt: asString(row.completed_at),
    sortOrder: Number(row.sort_order),
    tags: splitTags(row.tags),
    projectId: asString(row.project_id),
    parentId: asString(row.parent_id),
    templateNodeId: asString(row.template_node_id),
    assignees,
  };
}

function mapPersonnel(row: Row): Personnel {
  return {
    id: String(row.id),
    name: String(row.name),
    certificateNumber: String(row.certificate_number),
    deletedAt: asString(row.deleted_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

type TaskNodeRow = Task & { children: TaskNodeRow[] };

function mapTreeNode(node: TaskNodeRow): Task {
  return {
    ...node,
    sourceType: node.sourceType,
    priority: node.priority,
    children: node.children.map(mapTreeNode),
  };
}

function mapWorkflowState(row: Row): WorkflowState {
  return {
    id: String(row.id),
    workflowTemplateId: String(row.workflow_template_id),
    key: String(row.key),
    label: String(row.label),
    color: String(row.color),
    sortOrder: Number(row.sort_order),
    isDefault: Boolean(row.is_default),
    isCompleted: Boolean(row.is_completed),
  };
}

function mapTaskTemplateNode(row: Row): TaskTemplateNode {
  return {
    id: String(row.id),
    templateId: String(row.template_id),
    title: String(row.title),
    description: asString(row.description),
    parentId: asString(row.parent_id),
    workflowTemplateId: asString(row.workflow_template_id),
    defaultStatusKey: String(row.default_status_key),
    priority: String(row.priority) as Task["priority"],
    sortOrder: Number(row.sort_order),
    tags: splitTags(row.tags),
  };
}

function mapRootTaskTemplateDependency(row: Row): RootTaskTemplateDependency {
  return {
    id: String(row.id),
    templateId: String(row.template_id),
    fromNodeId: String(row.from_node_id),
    toNodeId: String(row.to_node_id),
    type: String(row.type) as RootTaskTemplateDependency["type"],
    label: asString(row.label),
    sortOrder: Number(row.sort_order),
  };
}

function mapTemplateTreeNode(
  node: TaskTemplateNode & { children: Array<TaskTemplateNode & { children: unknown[] }> },
): TaskTemplateNode {
  return {
    ...node,
    children: node.children.map((child) =>
      mapTemplateTreeNode(
        child as TaskTemplateNode & {
          children: Array<TaskTemplateNode & { children: unknown[] }>;
        },
      ),
    ),
  };
}

function mapTaskTemplateDependency(row: Row): TaskTemplateDependency {
  return {
    id: String(row.id),
    templateId: String(row.template_id),
    fromNodeId: String(row.from_node_id),
    toNodeId: String(row.to_node_id),
    type: String(row.type) as TaskTemplateDependency["type"],
  };
}

function mapRootTaskTemplateNode(row: Row): RootTaskTemplateNode {
  return {
    id: String(row.id),
    templateId: String(row.template_id),
    title: String(row.title),
    description: asString(row.description),
    parentId: asString(row.parent_id),
    defaultStatusKey: String(row.default_status_key),
    priority: String(row.priority) as Task["priority"],
    sortOrder: Number(row.sort_order),
    positionX: Number(row.position_x ?? 0),
    positionY: Number(row.position_y ?? 0),
    tags: splitTags(row.tags),
  };
}

function mapRootTemplateTreeNode(
  node: RootTaskTemplateNode & {
    children: Array<RootTaskTemplateNode & { children: unknown[] }>;
  },
): RootTaskTemplateNode {
  return {
    ...node,
    children: node.children.map((child) =>
      mapRootTemplateTreeNode(
        child as RootTaskTemplateNode & {
          children: Array<RootTaskTemplateNode & { children: unknown[] }>;
        },
      ),
    ),
  };
}

function mapTaskDependency(row: Row): TaskDependency {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    fromTaskId: String(row.from_task_id),
    toTaskId: String(row.to_task_id),
    type: String(row.type) as TaskDependency["type"],
  };
}

const recurrenceSelectSql = `
  SELECT r.*, t.title AS task_title
  FROM recurrence_rules r
  JOIN tasks t ON t.id = r.task_id
`;

function mapRecurrenceRows(rows: unknown[]): RecurrenceRule[] {
  return (rows as Row[]).map((row) => ({
    id: String(row.id),
    taskId: String(row.task_id),
    frequency: String(row.frequency) as RecurrenceRule["frequency"],
    interval: Number(row.interval),
    startAt: asString(row.start_at) ?? String(row.next_run_at),
    nextRunAt: String(row.next_run_at),
    endsAt: asString(row.ends_at),
    paused: Boolean(row.paused),
    taskTitle: String(row.task_title),
  }));
}

function splitTags(value: unknown) {
  return String(value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function joinTags(tags: string[] | undefined | null) {
  return (tags ?? []).map((tag) => tag.trim()).filter(Boolean).join(",");
}

function asString(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

function normalizeNullable(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeMatchText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}
