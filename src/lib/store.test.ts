import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { LocalDataExport } from "./store";

async function loadStore() {
  process.env.PROJECT_OS_DB_PATH = ":memory:";
  vi.resetModules();
  return import("./store");
}

async function loadStoreAt(dbPath: string) {
  process.env.PROJECT_OS_DB_PATH = dbPath;
  vi.resetModules();
  return import("./store");
}

describe("store project set lifecycle", () => {
  beforeEach(() => {
    delete process.env.PROJECT_OS_DB_PATH;
  });

  it("creates project sets and stores project start date and membership", async () => {
    const store = await loadStore();
    const projectSet = store.createProjectSet({ name: "  Banking program  " });
    const project = store.createProject({
      name: "Mobile banking assessment",
      startDate: "2026-06-01T00:00:00.000Z",
      projectSetId: projectSet.id,
    });

    expect(projectSet.name).toBe("Banking program");
    expect(store.getProjectSets()).toContainEqual(projectSet);
    expect(project).toMatchObject({
      startDate: "2026-06-01T00:00:00.000Z",
      projectSetId: projectSet.id,
    });
  });

  it("allows duplicate names, renames project sets, and rejects blank names", async () => {
    const store = await loadStore();
    const first = store.createProjectSet({ name: "Delivery" });
    const second = store.createProjectSet({ name: "Delivery" });

    expect(first.id).not.toBe(second.id);
    expect(store.updateProjectSet(first.id, { name: "  Delivery 2026  " })?.name).toBe(
      "Delivery 2026",
    );
    expect(() => store.createProjectSet({ name: "   " })).toThrow(
      "项目集名称不能为空",
    );
    expect(() => store.updateProjectSet(second.id, { name: "" })).toThrow(
      "项目集名称不能为空",
    );
  });

  it("moves a project between project sets and then to unassigned", async () => {
    const store = await loadStore();
    const first = store.createProjectSet({ name: "First" });
    const second = store.createProjectSet({ name: "Second" });
    const project = store.createProject({ name: "Movable", projectSetId: first.id });

    expect(store.updateProject(project?.id ?? "", { projectSetId: second.id })?.projectSetId).toBe(
      second.id,
    );
    expect(store.updateProject(project?.id ?? "", { projectSetId: null })?.projectSetId).toBeNull();
  });

  it("keeps existing membership when projectSetId is undefined", async () => {
    const store = await loadStore();
    const projectSet = store.createProjectSet({ name: "Stable" });
    const project = store.createProject({ name: "Stable project", projectSetId: projectSet.id });

    expect(store.updateProject(project?.id ?? "", { name: "Renamed" })?.projectSetId).toBe(
      projectSet.id,
    );
  });

  it("updates and clears a project start date", async () => {
    const store = await loadStore();
    const project = store.createProject({ name: "Scheduled project" });

    expect(
      store.updateProject(project?.id ?? "", {
        startDate: "2026-06-15T00:00:00.000Z",
      })?.startDate,
    ).toBe("2026-06-15T00:00:00.000Z");
    expect(store.updateProject(project?.id ?? "", { startDate: null })?.startDate).toBeNull();
  });

  it("deletes a project set while retaining its projects and tasks", async () => {
    const store = await loadStore();
    const projectSet = store.createProjectSet({ name: "Disposable" });
    const project = store.createProject({ name: "Retained project", projectSetId: projectSet.id });
    const task = store.createTask({
      title: "Retained task",
      projectId: project?.id,
      sourceType: "project",
    });

    expect(store.deleteProjectSet(projectSet.id)).toBe(true);
    expect(store.deleteProjectSet(projectSet.id)).toBe(false);
    expect(store.getProjects().find((item) => item.id === project?.id)?.projectSetId).toBeNull();
    expect(store.getTasks().some((item) => item.id === task?.id)).toBe(true);
  });

  it("rejects creating or moving a project into an unknown project set", async () => {
    const store = await loadStore();
    const project = store.createProject({ name: "Valid project" });

    expect(() => store.createProject({ name: "Invalid project", projectSetId: "missing" })).toThrow(
      store.ProjectSetNotFoundError,
    );
    expect(() => store.updateProject(project?.id ?? "", { projectSetId: "missing" })).toThrow(
      store.ProjectSetNotFoundError,
    );
  });

  it("upgrades a legacy projects table with project set columns and index", async () => {
    const dbPath = path.join(
      tmpdir(),
      `project-set-upgrade-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`,
    );
    const legacyDatabase = new DatabaseSync(dbPath);
    let legacyDatabaseOpen = true;
    let migratedDatabase: DatabaseSync | null = null;

    try {
      legacyDatabase.exec(`
        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          due_date TEXT,
          tags TEXT NOT NULL DEFAULT '',
          sort_order INTEGER NOT NULL DEFAULT 0,
          archived INTEGER NOT NULL DEFAULT 0,
          workflow_template_id TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      (legacyDatabase as unknown as { close(): void }).close();
      legacyDatabaseOpen = false;

      const store = await loadStoreAt(dbPath);
      migratedDatabase = store.getDatabase();
      const columns = migratedDatabase.prepare("PRAGMA table_info(projects)").all() as Array<{
        name: string;
      }>;
      const indexes = migratedDatabase.prepare("PRAGMA index_list(projects)").all() as Array<{
        name: string;
      }>;

      expect(columns.map((column) => column.name)).toEqual(
        expect.arrayContaining(["start_date", "project_set_id"]),
      );
      expect(indexes.map((index) => index.name)).toContain("idx_projects_project_set_id");
    } finally {
      try {
        if (legacyDatabaseOpen) {
          (legacyDatabase as unknown as { close(): void }).close();
        }
        if (migratedDatabase) {
          (migratedDatabase as unknown as { close(): void }).close();
        }
      } finally {
        if (existsSync(dbPath)) unlinkSync(dbPath);
      }
    }
  });
});

describe("store project updates", () => {
  beforeEach(() => {
    delete process.env.PROJECT_OS_DB_PATH;
  });

  it("更新项目基础信息、标签和归档状态", async () => {
    const store = await loadStore();
    const project = await store.createProject({ name: "测试项目" });

    const updated = await store.updateProject(project?.id ?? "", {
      name: "测试项目 v2",
      description: "用于验证项目编辑",
      status: "paused",
      dueDate: "2026-06-30T00:00:00.000Z",
      tags: ["测试", "计划"],
      archived: true,
    });

    expect(updated).toMatchObject({
      id: project?.id,
      name: "测试项目 v2",
      description: "用于验证项目编辑",
      status: "paused",
      dueDate: "2026-06-30T00:00:00.000Z",
      tags: ["测试", "计划"],
      archived: true,
    });
  });

  it("删除项目时同步移除项目任务且不可恢复", async () => {
    const store = await loadStore();
    const project = await store.createProject({ name: "待删除项目" });
    const root = await store.createTask({
      title: "项目根任务",
      projectId: project?.id,
      sourceType: "project",
    });
    await store.createTask({
      title: "项目子任务",
      projectId: project?.id,
      parentId: root?.id,
      sourceType: "project",
    });

    expect(await store.deleteProject(project?.id ?? "")).toBe(true);
    expect(store.getProjects().some((item) => item.id === project?.id)).toBe(false);
    expect(store.getTasks().some((task) => task.projectId === project?.id)).toBe(false);
    expect(await store.deleteProject(project?.id ?? "")).toBe(false);
  });
});

describe("store task lifecycle", () => {
  beforeEach(() => {
    delete process.env.PROJECT_OS_DB_PATH;
  });

  it("creates tasks with empty start time and assignee list", async () => {
    const store = await loadStore();
    const task = await store.createTask({ title: "Assessment task" });

    expect(task?.startTime).toBeNull();
    expect(task?.assignees).toEqual([]);
  });

  it("starts with an empty personnel directory", async () => {
    const store = await loadStore();

    expect(store.getPersonnel()).toEqual([]);
  });

  it("records start time once when a task first enters in progress", async () => {
    const store = await loadStore();
    const task = await store.createTask({ title: "Assessment task" });
    const started = await store.updateTask(task?.id ?? "", { statusKey: "in_progress" });

    expect(started?.startTime).not.toBeNull();

    const manualStartTime = "2026-06-01T08:00:00.000Z";
    await store.updateTask(task?.id ?? "", { startTime: manualStartTime });
    await store.updateTask(task?.id ?? "", { statusKey: "todo" });
    const restarted = await store.updateTask(task?.id ?? "", { statusKey: "in_progress" });

    expect(restarted?.startTime).toBe(manualStartTime);
  });

  it("编辑任务详情并阻止循环父子移动", async () => {
    const store = await loadStore();
    const project = await store.createProject({ name: "任务项目" });
    const root = await store.createTask({
      title: "根任务",
      projectId: project?.id,
      sourceType: "project",
    });
    const child = await store.createTask({
      title: "子任务",
      projectId: project?.id,
      parentId: root?.id,
      sourceType: "project",
    });

    const updated = await store.updateTask(root?.id ?? "", {
      title: "根任务 v2",
      priority: "high",
      tags: ["关键"],
      dueDate: "2026-06-08T00:00:00.000Z",
    });
    const invalidMove = await store.updateTask(root?.id ?? "", {
      parentId: child?.id,
    });

    expect(updated).toMatchObject({
      title: "根任务 v2",
      priority: "high",
      tags: ["关键"],
      dueDate: "2026-06-08T00:00:00.000Z",
    });
    expect(invalidMove).toBeNull();
  });

  it("支持同级任务上移和删除任务", async () => {
    const store = await loadStore();
    const project = await store.createProject({ name: "排序项目" });
    const first = await store.createTask({
      title: "第一项",
      projectId: project?.id,
      sourceType: "project",
    });
    const second = await store.createTask({
      title: "第二项",
      projectId: project?.id,
      sourceType: "project",
    });

    const patches = await store.reorderTask(second?.id ?? "", "up");
    const deleted = await store.deleteTask(first?.id ?? "");
    const remainingIds = store.getTasks().map((task) => task.id);

    expect(patches.map((patch) => patch.id)).toEqual([second?.id, first?.id]);
    expect(deleted).toBe(true);
    expect(remainingIds).toContain(second?.id);
    expect(remainingIds).not.toContain(first?.id);
  });

  it("把临时任务整理进项目并保留优先级、截止时间和标签", async () => {
    const store = await loadStore();
    const project = await store.createProject({ name: "收件箱项目" });
    const temporary = await store.createTask({
      title: "临时想法",
      sourceType: "temporary",
      priority: "low",
    });

    await store.assignTaskToProject(temporary?.id ?? "", project?.id ?? "");
    const organized = await store.updateTask(temporary?.id ?? "", {
      priority: "high",
      dueDate: "2026-06-12T00:00:00.000Z",
      tags: ["收件箱", "本周"],
    });

    expect(organized).toMatchObject({
      id: temporary?.id,
      sourceType: "project",
      projectId: project?.id,
      priority: "high",
      dueDate: "2026-06-12T00:00:00.000Z",
      tags: ["收件箱", "本周"],
    });
  });
});

describe("store recurrence management", () => {
  beforeEach(() => {
    delete process.env.PROJECT_OS_DB_PATH;
  });

  it("创建并更新周期规则的频率、间隔、下次触发、结束时间和暂停状态", async () => {
    const store = await loadStore();
    const task = await store.createTask({
      title: "每周复盘",
      sourceType: "temporary",
    });
    const rule = await store.createRecurrence({
      taskId: task?.id ?? "",
      frequency: "weekly",
      interval: 1,
      nextRunAt: "2026-06-08T00:00:00.000Z",
      endsAt: "2026-08-01T00:00:00.000Z",
    });

    const updated = await store.updateRecurrence(rule?.id ?? "", {
      frequency: "monthly",
      interval: 2,
      nextRunAt: "2026-07-01T00:00:00.000Z",
      endsAt: "2026-12-31T00:00:00.000Z",
      paused: true,
    });

    expect(updated).toMatchObject({
      id: rule?.id,
      frequency: "monthly",
      interval: 2,
      nextRunAt: "2026-07-01T00:00:00.000Z",
      endsAt: "2026-12-31T00:00:00.000Z",
      paused: true,
    });
  });

  it("生成周期实例后推进下次触发，并阻止同一规则同一天重复生成", async () => {
    const store = await loadStore();
    const task = await store.createTask({
      title: "每日检查",
      sourceType: "recurring",
      dueDate: "2026-06-02T00:00:00.000Z",
    });
    const rule = await store.createRecurrence({
      taskId: task?.id ?? "",
      frequency: "daily",
      interval: 1,
      nextRunAt: "2026-06-02T00:00:00.000Z",
    });

    const firstInstance = await store.generateRecurringTask(rule?.id ?? "");
    const duplicate = await store.generateRecurringTask(rule?.id ?? "", {
      occurrenceAt: "2026-06-02T00:00:00.000Z",
    });
    const updatedRule = store.getDashboardData().recurringRules.find(
      (item) => item.id === rule?.id,
    );

    expect(firstInstance).toMatchObject({
      title: "每日检查",
      sourceType: "recurring",
      dueDate: "2026-06-02T00:00:00.000Z",
    });
    expect(duplicate).toBeNull();
    expect(updatedRule?.nextRunAt).toBe("2026-06-03T00:00:00.000Z");
  });

  it("使用周期任务名称创建规则并按起始时间自动设置下次触发", async () => {
    const store = await loadStore();
    const rule = await store.createRecurrence({
      taskTitle: "季度复盘",
      frequency: "monthly",
      startAt: "2099-01-01T00:00:00.000Z",
      endsAt: "2099-12-31T00:00:00.000Z",
    });
    const task = store.getTasks().find((item) => item.id === rule?.taskId);

    expect(rule).toMatchObject({
      taskTitle: "季度复盘",
      frequency: "monthly",
      startAt: "2099-01-01T00:00:00.000Z",
      nextRunAt: "2099-01-01T00:00:00.000Z",
      endsAt: "2099-12-31T00:00:00.000Z",
    });
    expect(task).toMatchObject({
      title: "季度复盘",
      sourceType: "recurring",
    });

    const updated = await store.updateRecurrence(rule?.id ?? "", {
      taskTitle: "季度复盘 v2",
      frequency: "weekly",
      startAt: "2099-02-01T00:00:00.000Z",
    });
    const updatedTask = store.getTasks().find((item) => item.id === rule?.taskId);

    expect(updated?.taskTitle).toBe("季度复盘 v2");
    expect(updated?.nextRunAt).toBe("2099-02-01T00:00:00.000Z");
    expect(updatedTask?.title).toBe("季度复盘 v2");
  });
});

describe("store workflow management", () => {
  beforeEach(() => {
    delete process.env.PROJECT_OS_DB_PATH;
  });

  it("创建自定义工作流模板并保留状态顺序和完成状态", async () => {
    const store = await loadStore();

    const workflow = await store.createWorkflowTemplate({
      name: "写作流程",
      description: "适合文章和方案推进",
      states: [
        { key: "idea", label: "想法", color: "#64748b", isDefault: true },
        { key: "draft", label: "草稿", color: "#2563eb" },
        { key: "published", label: "发布", color: "#16a34a", isCompleted: true },
      ],
    });

    expect(workflow).toMatchObject({
      name: "写作流程",
      description: "适合文章和方案推进",
    });
    expect(workflow?.states.map((state) => state.key)).toEqual([
      "idea",
      "draft",
      "published",
    ]);
    expect(workflow?.states.find((state) => state.key === "published")?.isCompleted).toBe(true);
  });

  it("项目可以绑定自定义工作流模板", async () => {
    const store = await loadStore();
    const workflow = await store.createWorkflowTemplate({
      name: "轻量流程",
      states: [
        { key: "todo", label: "待办", color: "#64748b", isDefault: true },
        { key: "done", label: "完成", color: "#16a34a", isCompleted: true },
      ],
    });
    const project = await store.createProject({
      name: "使用自定义流程的项目",
      workflowTemplateId: workflow?.id,
    });

    expect(project?.workflowTemplateId).toBe(workflow?.id);
  });
});

describe("store task tree template management", () => {
  beforeEach(() => {
    delete process.env.PROJECT_OS_DB_PATH;
  });

  it("根据项目类型和标签推荐任务树模板", async () => {
    const store = await loadStore();
    const project = await store.createProject({
      name: "内部合规审计",
      description: "需要完成访谈和审计报告",
      projectType: "合规审计",
      tags: ["审计", "报告"],
    });
    const template = await store.createTaskTreeTemplate({
      name: "合规审计标准任务树",
      description: "适合审计类项目",
      projectType: "合规审计",
      matchKeywords: ["审计", "报告"],
      nodes: [
        { title: "现场测评", sortOrder: 1 },
        { title: "报告编制", sortOrder: 2 },
      ],
    });

    const recommendations = store.recommendTaskTreeTemplatesForProject(project?.id ?? "");

    expect(template?.nodes).toHaveLength(2);
    expect(recommendations[0].template.id).toBe(template?.id);
    expect(recommendations[0].score).toBeGreaterThan(0);
  });

  it("套用任务树模板后生成多级项目任务和前置依赖", async () => {
    const store = await loadStore();
    const project = await store.createProject({
      name: "测评实施项目",
      projectType: "安全测评",
    });
    const template = await store.createTaskTreeTemplate({
      name: "测评任务树",
      projectType: "安全测评",
      nodes: [
        { id: "node-field", title: "现场测评", sortOrder: 1 },
        { id: "node-report", title: "报告编制", sortOrder: 2 },
        {
          id: "node-draft",
          title: "撰写初稿",
          parentId: "node-report",
          sortOrder: 1,
        },
      ],
      dependencies: [
        {
          fromNodeId: "node-field",
          toNodeId: "node-report",
          type: "finish_to_start",
        },
      ],
    });

    const result = await store.applyTaskTreeTemplateToProject(
      project?.id ?? "",
      template?.id ?? "",
    );
    const tasks = store.getTasks().filter((task) => task.projectId === project?.id);
    const dependencies = store.getTaskDependencies(project?.id ?? "");

    expect(result?.createdTasks).toBe(3);
    expect(tasks.find((task) => task.title === "撰写初稿")?.parentId).toBe(
      tasks.find((task) => task.title === "报告编制")?.id,
    );
    expect(dependencies).toHaveLength(1);
    expect(dependencies[0].fromTaskId).toBe(
      tasks.find((task) => task.title === "现场测评")?.id,
    );
    expect(dependencies[0].toTaskId).toBe(
      tasks.find((task) => task.title === "报告编制")?.id,
    );
  });
});

describe("store root task template management", () => {
  beforeEach(() => {
    delete process.env.PROJECT_OS_DB_PATH;
  });

  it("添加根任务时按项目类型和标题匹配模板并生成多级子任务", async () => {
    const store = await loadStore();
    const project = await store.createProject({
      name: "银行密评项目",
      projectType: "安全测评",
    });
    const template = await store.createRootTaskTemplate({
      name: "报告编制模板",
      projectType: "安全测评",
      rootTitle: "报告编制",
      matchKeywords: ["报告", "编制"],
      nodes: [
        { id: "draft", title: "撰写初稿", sortOrder: 1 },
        { id: "review", title: "内部审核", sortOrder: 2 },
        {
          id: "fix",
          parentId: "review",
          title: "修改审核问题",
          sortOrder: 1,
        },
      ],
    });

    const result = await store.createRootTaskFromBestTemplate({
      projectId: project?.id ?? "",
      title: "报告编制",
    });
    const tasks = store.getTasks().filter((task) => task.projectId === project?.id);
    const root = tasks.find((task) => task.title === "报告编制");
    const review = tasks.find((task) => task.title === "内部审核");
    const fix = tasks.find((task) => task.title === "修改审核问题");

    expect(template?.nodes).toHaveLength(2);
    expect(result?.templateId).toBe(template?.id);
    expect(result?.createdTasks).toBe(4);
    expect(review?.parentId).toBe(root?.id);
    expect(fix?.parentId).toBe(review?.id);
  });

  it("没有匹配模板时只创建普通根任务", async () => {
    const store = await loadStore();
    const project = await store.createProject({
      name: "普通项目",
      projectType: "通用",
    });

    const result = await store.createRootTaskFromBestTemplate({
      projectId: project?.id ?? "",
      title: "临时根任务",
    });
    const tasks = store.getTasks().filter((task) => task.projectId === project?.id);

    expect(result?.templateId).toBeNull();
    expect(result?.createdTasks).toBe(1);
    expect(tasks.map((task) => task.title)).toEqual(["临时根任务"]);
  });

  it("添加根任务时可以手动指定根任务模板", async () => {
    const store = await loadStore();
    const project = await store.createProject({
      name: "手动模板项目",
      projectType: "通用",
    });
    const template = await store.createRootTaskTemplate({
      name: "手动根任务模板",
      projectType: "其他类型",
      rootTitle: "上线准备",
      matchKeywords: ["不会自动匹配"],
      nodes: [
        { id: "plan", title: "发布计划", sortOrder: 1 },
        { id: "rollback", parentId: "plan", title: "回滚预案", sortOrder: 1 },
      ],
    });

    const result = await store.createRootTaskFromBestTemplate({
      projectId: project?.id ?? "",
      title: "自定义根任务",
      rootTaskTemplateId: template?.id,
    });
    const tasks = store.getTasks().filter((task) => task.projectId === project?.id);
    const plan = tasks.find((task) => task.title === "发布计划");
    const rollback = tasks.find((task) => task.title === "回滚预案");

    expect(result?.templateId).toBe(template?.id);
    expect(result?.createdTasks).toBe(3);
    expect(rollback?.parentId).toBe(plan?.id);
  });

  it("编辑和删除根任务模板时同步替换节点结构", async () => {
    const store = await loadStore();
    const template = await store.createRootTaskTemplate({
      name: "原模板",
      projectType: "交付项目",
      rootTitle: "上线准备",
      matchKeywords: ["上线"],
      nodes: [{ id: "check", title: "检查清单", sortOrder: 1 }],
    });

    const updated = await store.updateRootTaskTemplate(template?.id ?? "", {
      name: "上线准备模板",
      projectType: "交付项目",
      rootTitle: "上线准备",
      matchKeywords: ["上线", "发布"],
      nodes: [
        { id: "plan", title: "发布计划", sortOrder: 1, tags: ["计划"] },
        { id: "rollback", parentId: "plan", title: "回滚预案", sortOrder: 1 },
      ],
    });

    expect(updated?.name).toBe("上线准备模板");
    expect(updated?.matchKeywords).toEqual(["上线", "发布"]);
    expect(updated?.nodes).toHaveLength(1);
    expect(updated?.nodes[0].children?.[0].title).toBe("回滚预案");

    expect(await store.deleteRootTaskTemplate(template?.id ?? "")).toBe(true);
    expect(store.getRootTaskTemplates().some((item) => item.id === template?.id)).toBe(false);
  });

  it("stores root template flow positions and applies sequence dependencies", async () => {
    const store = await loadStore();
    const project = await store.createProject({
      name: "Flow project",
      projectType: "Flow",
    });
    const template = await store.createRootTaskTemplate({
      name: "Flow template",
      projectType: "Flow",
      rootTitle: "Launch",
      nodes: [
        {
          id: "design",
          title: "Design",
          sortOrder: 1,
          positionX: 120,
          positionY: 80,
        },
        {
          id: "review",
          title: "Review",
          sortOrder: 2,
          positionX: 420,
          positionY: 80,
        },
      ],
      dependencies: [
        {
          id: "edge-sequence",
          fromNodeId: "design",
          toNodeId: "review",
          type: "sequence",
          label: "after",
        },
        {
          id: "edge-binding",
          fromNodeId: "review",
          toNodeId: "design",
          type: "strong_binding",
        },
      ],
    });

    const result = await store.createRootTaskFromBestTemplate({
      projectId: project?.id ?? "",
      title: "Launch",
      rootTaskTemplateId: template?.id,
    });
    const storedTemplate = store
      .getRootTaskTemplates()
      .find((item) => item.id === template?.id);
    const flatNodes = storedTemplate?.nodes.flatMap((node) => [
      node,
      ...(node.children ?? []),
    ]);
    const tasks = store.getTasks().filter((task) => task.projectId === project?.id);
    const designTask = tasks.find((task) => task.title === "Design");
    const reviewTask = tasks.find((task) => task.title === "Review");
    const dependencies = store.getTaskDependencies(project?.id ?? "");

    expect(result?.createdTasks).toBe(3);
    expect(flatNodes?.find((node) => node.title === "Design")).toMatchObject({
      positionX: 120,
      positionY: 80,
    });
    expect(storedTemplate?.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromNodeId: "design",
          toNodeId: "review",
          type: "sequence",
          label: "after",
        }),
        expect.objectContaining({
          fromNodeId: "review",
          toNodeId: "design",
          type: "strong_binding",
        }),
      ]),
    );
    expect(dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromTaskId: designTask?.id,
          toTaskId: reviewTask?.id,
          type: "finish_to_start",
        }),
        expect.objectContaining({
          fromTaskId: reviewTask?.id,
          toTaskId: designTask?.id,
          type: "strong_binding",
        }),
      ]),
    );
  });
});

describe("store personnel lifecycle", () => {
  beforeEach(() => {
    delete process.env.PROJECT_OS_DB_PATH;
  });

  it("creates and edits personnel records", async () => {
    const store = await loadStore();
    const person = store.createPersonnel({
      name: "Zhang San",
      certificateNumber: "CERT-001",
    });
    const updated = store.updatePersonnel(person.id, {
      name: "Zhang San Updated",
      certificateNumber: "CERT-002",
    });

    expect(updated).toMatchObject({
      id: person.id,
      name: "Zhang San Updated",
      certificateNumber: "CERT-002",
      deletedAt: null,
    });
  });

  it("keeps certificate numbers unique across active and deleted personnel", async () => {
    const store = await loadStore();
    const person = store.createPersonnel({
      name: "Zhang San",
      certificateNumber: "CERT-001",
    });
    store.deletePersonnel(person.id);

    expect(() =>
      store.createPersonnel({ name: "Li Si", certificateNumber: "CERT-001" }),
    ).toThrow("证书编号已存在");
  });

  it("soft deletes personnel and prevents further editing", async () => {
    const store = await loadStore();
    const person = store.createPersonnel({
      name: "Zhang San",
      certificateNumber: "CERT-001",
    });
    const deleted = store.deletePersonnel(person.id);

    expect(deleted?.deletedAt).not.toBeNull();
    expect(store.getPersonnel()).toHaveLength(1);
    expect(() => store.updatePersonnel(person.id, { name: "New Name" })).toThrow(
      "已删除人员不可编辑",
    );
  });

  it("assigns multiple personnel and retains deleted historical assignees", async () => {
    const store = await loadStore();
    const task = await store.createTask({ title: "Assessment task" });
    const first = store.createPersonnel({ name: "Zhang San", certificateNumber: "CERT-001" });
    const second = store.createPersonnel({ name: "Li Si", certificateNumber: "CERT-002" });

    const assigned = await store.updateTask(task?.id ?? "", {
      personnelIds: [first.id, second.id],
    });
    expect(assigned?.assignees.map((person) => person.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );

    store.deletePersonnel(first.id);
    const retained = await store.updateTask(task?.id ?? "", { personnelIds: [first.id] });
    expect(retained?.assignees[0]).toMatchObject({ id: first.id });
    expect(retained?.assignees[0].deletedAt).not.toBeNull();
  });

  it("rejects newly assigning deleted or unknown personnel", async () => {
    const store = await loadStore();
    const firstTask = await store.createTask({ title: "First task" });
    const secondTask = await store.createTask({ title: "Second task" });
    const person = store.createPersonnel({ name: "Zhang San", certificateNumber: "CERT-001" });
    await store.updateTask(firstTask?.id ?? "", { personnelIds: [person.id] });
    store.deletePersonnel(person.id);

    expect(() =>
      store.updateTask(secondTask?.id ?? "", { personnelIds: [person.id] }),
    ).toThrow("已删除人员不能新增分配");
    expect(() =>
      store.updateTask(secondTask?.id ?? "", { personnelIds: ["missing-person"] }),
    ).toThrow("人员不存在");
  });
});

describe("store project set dashboard summaries", () => {
  beforeEach(() => {
    delete process.env.PROJECT_OS_DB_PATH;
  });

  it("summarizes computed project progress, dates, status, and excludes archived projects", async () => {
    const store = await loadStore();
    const projectSet = store.createProjectSet({ name: "Assessment program" });
    const activeProject = store.createProject({
      name: "Active assessment",
      status: "active",
      startDate: "2026-06-10T00:00:00.000Z",
      dueDate: "2026-07-10T00:00:00.000Z",
      projectSetId: projectSet.id,
    });
    const pausedProject = store.createProject({
      name: "Paused assessment",
      status: "paused",
      startDate: "2026-06-01T00:00:00.000Z",
      dueDate: "2026-08-20T00:00:00.000Z",
      projectSetId: projectSet.id,
    });
    const archivedProject = store.createProject({
      name: "Archived assessment",
      status: "done",
      startDate: "2026-05-01T00:00:00.000Z",
      dueDate: "2026-09-01T00:00:00.000Z",
      archived: true,
      projectSetId: projectSet.id,
    });
    await store.createTask({
      title: "Active completed task",
      projectId: activeProject?.id,
      sourceType: "project",
      statusKey: "done",
    });
    await store.createTask({
      title: "Active pending task",
      projectId: activeProject?.id,
      sourceType: "project",
      statusKey: "todo",
    });
    await store.createTask({
      title: "Paused completed task",
      projectId: pausedProject?.id,
      sourceType: "project",
      statusKey: "done",
    });
    await store.createTask({
      title: "Archived pending task",
      projectId: archivedProject?.id,
      sourceType: "project",
      statusKey: "todo",
    });

    const dashboard = store.getDashboardData();

    expect(dashboard.projectSets).toContainEqual({
      ...projectSet,
      projectCount: 2,
      progress: 75,
      status: "active",
      startDate: "2026-06-01T00:00:00.000Z",
      endDate: "2026-08-20T00:00:00.000Z",
    });
  });
});

describe("store data safety", () => {
  beforeEach(() => {
    delete process.env.PROJECT_OS_DB_PATH;
  });

  it("round trips personnel assignments, deleted state, and task start time", async () => {
    const sourceStore = await loadStore();
    const task = await sourceStore.createTask({ title: "Assessment task" });
    const person = sourceStore.createPersonnel({
      name: "Zhang San",
      certificateNumber: "CERT-001",
    });
    await sourceStore.updateTask(task?.id ?? "", {
      personnelIds: [person.id],
      startTime: "2026-06-01T08:00:00.000Z",
    });
    sourceStore.deletePersonnel(person.id);
    const exported = sourceStore.exportLocalData();

    const targetStore = await loadStore();
    targetStore.importLocalData(exported);
    const importedTask = targetStore.getTasks().find((item) => item.id === task?.id);
    const importedPerson = targetStore.getPersonnel().find((item) => item.id === person.id);

    expect(importedPerson).toBeDefined();
    expect(importedPerson?.deletedAt).not.toBeNull();
    expect(importedTask?.startTime).toBe("2026-06-01T08:00:00.000Z");
    expect(importedTask?.assignees[0]).toMatchObject({ id: person.id });
  });

  it("exports and restores project sets before their member projects", async () => {
    const sourceStore = await loadStore();
    const projectSet = sourceStore.createProjectSet({ name: "Banking program" });
    const project = sourceStore.createProject({
      name: "Mobile banking assessment",
      startDate: "2026-06-01T00:00:00.000Z",
      projectSetId: projectSet.id,
    });
    const exported = sourceStore.exportLocalData();

    expect(exported.projectSets).toContainEqual(projectSet);

    const targetStore = await loadStore();
    const summary = targetStore.importLocalData(exported);

    expect(summary.projectSets).toBe(1);
    expect(targetStore.getProjectSets()).toContainEqual(projectSet);
    expect(targetStore.getProjects()).toContainEqual(
      expect.objectContaining({
        id: project?.id,
        startDate: "2026-06-01T00:00:00.000Z",
        projectSetId: projectSet.id,
      }),
    );
  });

  it("imports tasks even when child tasks appear before their parent", async () => {
    const sourceStore = await loadStore();
    const project = sourceStore.createProject({ name: "Nested import project" });
    const rootTask = await sourceStore.createTask({
      title: "Root task",
      projectId: project?.id,
      sourceType: "project",
    });
    const childTask = await sourceStore.createTask({
      title: "Child task",
      projectId: project?.id,
      parentId: rootTask?.id,
      sourceType: "project",
    });
    const exported = sourceStore.exportLocalData();
    const reversedSnapshot = {
      ...exported,
      tasks: [...exported.tasks].sort((left, right) => {
        if (left.id === childTask?.id) return -1;
        if (right.id === childTask?.id) return 1;
        if (left.id === rootTask?.id) return 1;
        if (right.id === rootTask?.id) return -1;
        return 0;
      }),
    };

    const targetStore = await loadStore();
    const summary = targetStore.importLocalData(reversedSnapshot);
    const importedChild = targetStore.getTasks().find((item) => item.id === childTask?.id);

    expect(summary.tasks).toBe(reversedSnapshot.tasks.length);
    expect(importedChild).toMatchObject({ parentId: rootTask?.id });
  });

  it("imports version 1 snapshots without project sets or new project fields", async () => {
    const sourceStore = await loadStore();
    const project = sourceStore.createProject({ name: "Legacy project" });
    expect(project).toBeDefined();
    const exported = sourceStore.exportLocalData();
    const legacyProject: LocalDataExport["projects"][number] = { ...project! };
    delete legacyProject.startDate;
    delete legacyProject.projectSetId;
    const legacySnapshot: LocalDataExport = {
      ...exported,
      projects: [legacyProject],
      tasks: [],
      recurrenceRules: [],
    };
    delete legacySnapshot.projectSets;

    const targetStore = await loadStore();
    const summary = targetStore.importLocalData(legacySnapshot);
    const imported = targetStore.getProjects().find((item) => item.id === project?.id);

    expect(summary.projectSets).toBe(0);
    expect(imported).toMatchObject({ startDate: null, projectSetId: null });
  });

  it("reports the real project set count in safety information", async () => {
    const store = await loadStore();
    store.createProjectSet({ name: "First program" });
    store.createProjectSet({ name: "Second program" });

    expect(store.getDataSafetyInfo().counts.projectSets).toBe(2);
  });

  it("导出本地数据快照并包含项目、任务、工作流和周期规则", async () => {
    const store = await loadStore();
    const project = await store.createProject({ name: "导出项目" });
    await store.createTask({
      title: "导出任务",
      projectId: project?.id,
      sourceType: "project",
      tags: ["备份"],
    });

    const exported = store.exportLocalData();

    expect(exported.version).toBe(1);
    expect(exported.projects.some((item) => item.name === "导出项目")).toBe(true);
    expect(exported.tasks.some((item) => item.title === "导出任务")).toBe(true);
    expect(exported.workflows.length).toBeGreaterThan(0);
    expect(exported.recurrenceRules.length).toBeGreaterThan(0);
  });

  it("导入数据时合并同 ID 数据，不清空现有数据", async () => {
    const store = await loadStore();
    const existing = await store.createProject({ name: "保留项目" });
    const exported = store.exportLocalData();
    const importedProject = {
      ...exported.projects[0],
      id: "imported-project",
      name: "导入项目",
      description: "从 JSON 导入",
      tags: ["导入"],
    };

    const result = store.importLocalData({
      ...exported,
      projects: [importedProject],
      tasks: [],
      recurrenceRules: [],
    });
    const projectNames = store.getProjects().map((project) => project.name);

    expect(result.projects).toBe(1);
    expect(projectNames).toContain(existing?.name);
    expect(projectNames).toContain("导入项目");
  });

  it("为文件型 SQLite 数据库创建备份副本并返回备份路径", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "project-os-backup-"));
    const dbPath = path.join(tempDir, `test-backup-${Date.now()}.sqlite`);
    let store: Awaited<ReturnType<typeof loadStoreAt>> | null = null;
    try {
      store = await loadStoreAt(dbPath);
    await store.createProject({ name: "需要备份的项目" });

    const backup = store.createDatabaseBackup();

      expect(backup.databasePath).toBe(dbPath);
      expect(backup.backupPath.endsWith(".sqlite")).toBe(true);
      expect(backup.createdAt).toMatch(/^\d{4}-/);
    } finally {
      store?.closeDatabase();
      const backupDir = path.join(tempDir, "backups");
      if (existsSync(dbPath)) unlinkSync(dbPath);
      if (existsSync(backupDir)) {
        for (const fileName of readdirSync(backupDir)) {
          unlinkSync(path.join(backupDir, fileName));
        }
        rmdirSync(backupDir);
      }
      if (existsSync(tempDir)) rmdirSync(tempDir);
    }
  });
});
