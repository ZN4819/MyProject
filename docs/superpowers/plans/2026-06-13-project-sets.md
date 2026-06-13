# 项目集功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在项目管理中增加“项目集列表 → 项目列表 → 项目详情”三级管理能力，并自动汇总项目集状态、进度和起止时间。

**Architecture:** 运行时继续使用 `src/lib/store.ts` 管理本地 SQLite；新增 `project_sets` 表，并在 `projects` 表上增加可空的 `project_set_id` 与 `start_date`。项目集汇总由 `src/lib/domain.ts` 的纯函数动态计算，dashboard 统一返回项目集和项目数据；前端新增一个聚焦项目集列表与成员管理的组件，现有项目详情和任务区保持在主组件中。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Node `node:sqlite`、CSS Modules、Vitest、Lucide React、Codex in-app Browser。

---

## 文件结构

- Modify: `src/lib/types.ts`：增加项目集类型，并扩展项目与 dashboard 数据结构。
- Modify: `src/lib/domain.ts`：增加项目集状态、进度、日期汇总和项目分组纯函数。
- Modify: `src/lib/domain.test.ts`：覆盖项目集汇总和分组规则。
- Modify: `src/lib/store.ts`：建表、旧库补列、项目集 CRUD、项目归属校验、dashboard 聚合、导入导出。
- Modify: `src/lib/store.test.ts`：覆盖项目集生命周期、项目移动、删除、归档和备份兼容。
- Modify: `prisma/schema.prisma`：同步参考数据模型。
- Create: `src/app/api/project-sets/route.ts`：项目集查询与创建接口。
- Create: `src/app/api/project-sets/[id]/route.ts`：项目集重命名与删除接口。
- Create: `src/app/api/project-sets/route.test.ts`：项目集接口行为测试。
- Modify: `src/app/api/projects/route.ts`：接收项目开始时间和项目集归属。
- Modify: `src/app/api/projects/[id]/route.ts`：更新项目开始时间和项目集归属并返回明确错误。
- Create: `src/components/project-set-browser.tsx`：项目集列表、项目列表和成员批量管理界面。
- Modify: `src/components/project-manager-app.tsx`：接入项目集导航状态、项目详情字段和新组件回调。
- Modify: `src/components/project-manager-app.module.css`：项目集卡片、成员选择器及响应式样式。

### Task 1: 项目集领域类型与自动汇总规则

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/domain.ts`
- Test: `src/lib/domain.test.ts`

- [ ] **Step 1: 编写项目集汇总和分组的失败测试**

在 `src/lib/domain.test.ts` 的导入列表加入 `calculateProjectSetSummary`、`filterProjectsByProjectSet`，并添加：

```ts
describe("calculateProjectSetSummary", () => {
  const project = (
    overrides: Partial<{
      status: string;
      progress: number;
      startDate: string | null;
      dueDate: string | null;
      archived: boolean;
    }> = {},
  ) => ({
    status: "active",
    progress: 0,
    startDate: null,
    dueDate: null,
    archived: false,
    ...overrides,
  });

  it("对未归档项目计算平均进度和日期范围", () => {
    expect(
      calculateProjectSetSummary([
        project({
          progress: 33,
          startDate: "2026-06-10T00:00:00.000Z",
          dueDate: "2026-07-10T00:00:00.000Z",
        }),
        project({
          status: "paused",
          progress: 66,
          startDate: "2026-06-01T00:00:00.000Z",
          dueDate: "2026-08-20T00:00:00.000Z",
        }),
        project({ status: "done", progress: 100, archived: true }),
      ]),
    ).toEqual({
      projectCount: 2,
      progress: 50,
      status: "active",
      startDate: "2026-06-01T00:00:00.000Z",
      endDate: "2026-08-20T00:00:00.000Z",
    });
  });

  it("全部完成、全部暂停和空项目集得到对应状态", () => {
    expect(
      calculateProjectSetSummary([
        project({ status: "done", progress: 100 }),
        project({ status: "done", progress: 100 }),
      ]).status,
    ).toBe("done");
    expect(
      calculateProjectSetSummary([
        project({ status: "paused" }),
        project({ status: "paused" }),
      ]).status,
    ).toBe("paused");
    expect(calculateProjectSetSummary([])).toEqual({
      projectCount: 0,
      progress: 0,
      status: "not_started",
      startDate: null,
      endDate: null,
    });
  });
});

describe("filterProjectsByProjectSet", () => {
  const projects = [
    { id: "a", projectSetId: "set-1", archived: false },
    { id: "b", projectSetId: null, archived: false },
    { id: "c", projectSetId: "set-1", archived: true },
  ];

  it("按项目集筛选并排除归档项目", () => {
    expect(filterProjectsByProjectSet(projects, "set-1").map((item) => item.id)).toEqual(["a"]);
  });

  it("未分组入口只返回没有项目集的未归档项目", () => {
    expect(filterProjectsByProjectSet(projects, "unassigned").map((item) => item.id)).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: 运行领域测试并确认失败原因**

Run: `npm test -- src/lib/domain.test.ts`

Expected: FAIL，提示 `calculateProjectSetSummary` 或 `filterProjectsByProjectSet` 尚未导出。

- [ ] **Step 3: 增加共享类型**

在 `src/lib/types.ts` 扩展 `Project` 并增加项目集类型：

```ts
export type Project = {
  id: string;
  name: string;
  description: string | null;
  projectType: string | null;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  tags: string[];
  sortOrder: number;
  archived: boolean;
  workflowTemplateId: string | null;
  projectSetId: string | null;
};

export type ProjectSetStatus = "not_started" | "active" | "paused" | "done";

export type ProjectSet = {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectSetSummary = ProjectSet & {
  projectCount: number;
  progress: number;
  status: ProjectSetStatus;
  startDate: string | null;
  endDate: string | null;
};
```

在 `DashboardData` 增加：

```ts
projectSets: ProjectSetSummary[];
```

在 `safetyInfo.counts` 增加：

```ts
projectSets: number;
```

- [ ] **Step 4: 实现最小领域逻辑**

在 `src/lib/domain.ts` 增加：

```ts
import type { ProjectSetStatus } from "./types";

type ProjectSetProject = {
  status: string;
  progress: number;
  startDate: string | null;
  dueDate: string | null;
  archived: boolean;
};

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
  const status: ProjectSetStatus = activeProjects.every((project) => project.status === "done")
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
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- src/lib/domain.test.ts`

Expected: PASS，新增项目集领域测试与原有领域测试全部通过。

- [ ] **Step 6: 提交领域规则**

```powershell
git add src/lib/types.ts src/lib/domain.ts src/lib/domain.test.ts
git commit -m "feat: add project set summary rules"
```

### Task 2: SQLite 模型、项目集 CRUD 与项目归属

**Files:**
- Modify: `src/lib/store.ts`
- Modify: `src/lib/store.test.ts`
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 编写项目集生命周期失败测试**

在 `src/lib/store.test.ts` 增加：

```ts
describe("store project set lifecycle", () => {
  beforeEach(() => {
    delete process.env.PROJECT_OS_DB_PATH;
  });

  it("创建项目集并保存项目开始时间与唯一归属", async () => {
    const store = await loadStore();
    const projectSet = store.createProjectSet({ name: "银行测评项目集" });
    const project = store.createProject({
      name: "手机银行测评",
      startDate: "2026-06-01T00:00:00.000Z",
      projectSetId: projectSet.id,
    });

    expect(store.getProjectSets()).toContainEqual(
      expect.objectContaining({ id: projectSet.id, name: "银行测评项目集" }),
    );
    expect(project).toMatchObject({
      startDate: "2026-06-01T00:00:00.000Z",
      projectSetId: projectSet.id,
    });
  });

  it("项目可以移动到其他项目集或未分组", async () => {
    const store = await loadStore();
    const first = store.createProjectSet({ name: "第一项目集" });
    const second = store.createProjectSet({ name: "第二项目集" });
    const project = store.createProject({ name: "迁移项目", projectSetId: first.id });

    expect(store.updateProject(project?.id ?? "", { projectSetId: second.id })?.projectSetId).toBe(second.id);
    expect(store.updateProject(project?.id ?? "", { projectSetId: null })?.projectSetId).toBeNull();
  });

  it("删除项目集后项目和任务保留且项目变为未分组", async () => {
    const store = await loadStore();
    const projectSet = store.createProjectSet({ name: "待删除项目集" });
    const project = store.createProject({ name: "保留项目", projectSetId: projectSet.id });
    const task = store.createTask({
      title: "保留任务",
      projectId: project?.id,
      sourceType: "project",
    });

    expect(store.deleteProjectSet(projectSet.id)).toBe(true);
    expect(store.getProjects().find((item) => item.id === project?.id)?.projectSetId).toBeNull();
    expect(store.getTasks().some((item) => item.id === task?.id)).toBe(true);
  });

  it("拒绝关联不存在的项目集", async () => {
    const store = await loadStore();
    expect(() => store.createProject({ name: "无效项目", projectSetId: "missing" })).toThrow("项目集不存在");
  });
});
```

- [ ] **Step 2: 运行存储测试并确认失败**

Run: `npm test -- src/lib/store.test.ts`

Expected: FAIL，提示 `createProjectSet` 不存在或 `Project` 尚无 `projectSetId`。

- [ ] **Step 3: 建立 SQLite 表和旧库增量升级**

在 `createSchema()` 的 `projects` 建表语句之前加入：

```sql
CREATE TABLE IF NOT EXISTS project_sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

将新建数据库的 `projects` 表扩展为：

```sql
start_date TEXT,
project_set_id TEXT,
FOREIGN KEY(project_set_id) REFERENCES project_sets(id) ON DELETE SET NULL,
```

在 `createSchema()` 末尾增加旧库兼容补列：

```ts
ensureColumn(database, "projects", "start_date", "TEXT");
ensureColumn(database, "projects", "project_set_id", "TEXT REFERENCES project_sets(id) ON DELETE SET NULL");
database.exec("CREATE INDEX IF NOT EXISTS idx_projects_project_set_id ON projects(project_set_id)");
```

- [ ] **Step 4: 实现项目集 CRUD 和归属校验**

在 `src/lib/store.ts` 导入 `ProjectSet`，并增加：

```ts
export class ProjectSetNotFoundError extends Error {
  constructor() {
    super("项目集不存在");
    this.name = "ProjectSetNotFoundError";
  }
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
  return getProjectSets().find((item) => item.id === id)!;
}

export function updateProjectSet(id: string, input: { name?: string }) {
  const current = getProjectSets().find((item) => item.id === id);
  if (!current) return null;
  const name = input.name === undefined ? current.name : input.name.trim();
  if (!name) throw new Error("项目集名称不能为空");
  getDatabase()
    .prepare("UPDATE project_sets SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(name, id);
  return getProjectSets().find((item) => item.id === id) ?? null;
}

export function deleteProjectSet(id: string) {
  if (!getProjectSets().some((item) => item.id === id)) return false;
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

function assertProjectSetExists(projectSetId: string | null | undefined) {
  if (projectSetId == null) return;
  const exists = getDatabase()
    .prepare("SELECT 1 FROM project_sets WHERE id = ? LIMIT 1")
    .get(projectSetId);
  if (!exists) throw new ProjectSetNotFoundError();
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
```

扩展 `createProject()`、`updateProject()`、`mapProject()` 的字段和 SQL：

```ts
startDate?: string | null;
projectSetId?: string | null;
```

写入前调用：

```ts
assertProjectSetExists(input.projectSetId);
```

`mapProject()` 增加：

```ts
startDate: asString(row.start_date),
projectSetId: asString(row.project_set_id),
```

- [ ] **Step 5: 同步 Prisma 参考模型**

在 `prisma/schema.prisma` 增加：

```prisma
model ProjectSet {
  id        String    @id @default(cuid())
  name      String
  sortOrder Int       @default(0)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  projects  Project[]
}
```

在 `Project` 增加：

```prisma
startDate    DateTime?
projectSetId String?
projectSet   ProjectSet? @relation(fields: [projectSetId], references: [id], onDelete: SetNull)

@@index([projectSetId])
```

- [ ] **Step 6: 运行存储测试确认通过**

Run: `npm test -- src/lib/store.test.ts`

Expected: PASS，项目集生命周期测试及原有存储测试全部通过。

- [ ] **Step 7: 提交数据库与 CRUD**

```powershell
git add src/lib/store.ts src/lib/store.test.ts prisma/schema.prisma
git commit -m "feat: add project set persistence"
```

### Task 3: Dashboard 汇总与备份导入兼容

**Files:**
- Modify: `src/lib/store.ts`
- Modify: `src/lib/store.test.ts`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: 编写 dashboard 与导入导出失败测试**

在 `src/lib/store.test.ts` 增加：

```ts
it("dashboard 返回排除归档项目后的项目集汇总", async () => {
  const store = await loadStore();
  const projectSet = store.createProjectSet({ name: "汇总项目集" });
  const first = store.createProject({
    name: "项目一",
    status: "active",
    startDate: "2026-06-10T00:00:00.000Z",
    dueDate: "2026-07-01T00:00:00.000Z",
    projectSetId: projectSet.id,
  });
  store.createProject({
    name: "归档项目",
    archived: true,
    projectSetId: projectSet.id,
  });
  store.createTask({
    title: "已完成",
    statusKey: "done",
    sourceType: "project",
    projectId: first?.id,
  });

  expect(store.getDashboardData().projectSets[0]).toMatchObject({
    id: projectSet.id,
    projectCount: 1,
    progress: 100,
    status: "active",
    startDate: "2026-06-10T00:00:00.000Z",
    endDate: "2026-07-01T00:00:00.000Z",
  });
});

it("导出并恢复项目集和项目归属，同时兼容没有项目集字段的旧快照", async () => {
  const source = await loadStore();
  const projectSet = source.createProjectSet({ name: "备份项目集" });
  source.createProject({ name: "备份项目", projectSetId: projectSet.id });
  const exported = source.exportLocalData();

  const target = await loadStore();
  target.importLocalData(exported);
  expect(target.getProjectSets().map((item) => item.name)).toContain("备份项目集");
  expect(target.getProjects().find((item) => item.name === "备份项目")?.projectSetId).toBe(projectSet.id);

  const legacy = { ...exported, projectSets: undefined, projects: [] };
  expect(() => target.importLocalData(legacy)).not.toThrow();
});
```

- [ ] **Step 2: 运行目标测试并确认失败**

Run: `npm test -- src/lib/store.test.ts`

Expected: FAIL，dashboard 尚无 `projectSets`，导出数据尚无项目集。

- [ ] **Step 3: 在 dashboard 中动态计算项目集汇总**

在 `src/lib/store.ts` 导入 `calculateProjectSetSummary`，在项目进度计算后增加：

```ts
const projectSets = getProjectSets().map((projectSet) => ({
  ...projectSet,
  ...calculateProjectSetSummary(
    projects.filter((project) => project.projectSetId === projectSet.id),
  ),
}));
```

并在 dashboard 返回值加入：

```ts
projectSets,
```

- [ ] **Step 4: 扩展本地导入导出与安全统计**

将 `LocalDataExport` 和 `ImportSummary` 扩展为：

```ts
export type LocalDataExport = {
  version: 1;
  exportedAt: string;
  projectSets?: ProjectSet[];
  projects: Project[];
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
```

`exportLocalData()` 增加：

```ts
projectSets: getProjectSets(),
```

`importLocalData()` 必须先导入项目集，再导入项目：

```ts
for (const projectSet of input.projectSets ?? []) {
  upsertProjectSet(database, projectSet);
  summary.projectSets += 1;
}
for (const project of input.projects ?? []) {
  upsertProject(database, project);
  summary.projects += 1;
}
```

增加：

```ts
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
```

同步扩展 `upsertProject()` 的 `start_date`、`project_set_id`；对于旧快照使用 `project.startDate ?? null` 与 `project.projectSetId ?? null`。`getDataSafetyInfo().counts` 增加 `projectSets: getProjectSets().length`。

- [ ] **Step 5: 运行存储测试确认通过**

Run: `npm test -- src/lib/store.test.ts`

Expected: PASS，项目集汇总与导入导出测试通过。

- [ ] **Step 6: 提交 dashboard 和数据安全改动**

```powershell
git add src/lib/types.ts src/lib/store.ts src/lib/store.test.ts
git commit -m "feat: include project sets in dashboard and backups"
```

### Task 4: 项目集与项目归属 API

**Files:**
- Create: `src/app/api/project-sets/route.ts`
- Create: `src/app/api/project-sets/[id]/route.ts`
- Create: `src/app/api/project-sets/route.test.ts`
- Modify: `src/app/api/projects/route.ts`
- Modify: `src/app/api/projects/[id]/route.ts`

- [ ] **Step 1: 编写 API 失败测试**

创建 `src/app/api/project-sets/route.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("project set routes", () => {
  beforeEach(() => {
    process.env.PROJECT_OS_DB_PATH = ":memory:";
    vi.resetModules();
  });

  it("校验名称并创建项目集", async () => {
    const collection = await import("./route");
    const invalid = await collection.POST(
      new Request("http://localhost/api/project-sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: " " }),
      }),
    );
    expect(invalid.status).toBe(400);

    const created = await collection.POST(
      new Request("http://localhost/api/project-sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "银行测评项目集" }),
      }),
    );
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ name: "银行测评项目集" });
  });

  it("重命名和删除项目集", async () => {
    const store = await import("@/lib/store");
    const projectSet = store.createProjectSet({ name: "旧名称" });
    const item = await import("./[id]/route");
    const context = { params: Promise.resolve({ id: projectSet.id }) };

    const renamed = await item.PATCH(
      new Request("http://localhost/api/project-sets/id", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "新名称" }),
      }),
      context,
    );
    expect(await renamed.json()).toMatchObject({ name: "新名称" });

    const deleted = await item.DELETE(new Request("http://localhost"), context);
    expect(deleted.status).toBe(200);
  });

  it("项目接口保存开始时间和项目集归属并拒绝无效项目集", async () => {
    const store = await import("@/lib/store");
    const projectSet = store.createProjectSet({ name: "接口项目集" });
    const projects = await import("../projects/route");

    const created = await projects.POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "接口项目",
          startDate: "2026-06-01T00:00:00.000Z",
          projectSetId: projectSet.id,
        }),
      }),
    );
    expect(await created.json()).toMatchObject({
      startDate: "2026-06-01T00:00:00.000Z",
      projectSetId: projectSet.id,
    });

    const invalid = await projects.POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "错误项目", projectSetId: "missing" }),
      }),
    );
    expect(invalid.status).toBe(400);
  });
});
```

- [ ] **Step 2: 运行 API 测试并确认失败**

Run: `npm test -- src/app/api/project-sets/route.test.ts`

Expected: FAIL，项目集路由文件尚不存在。

- [ ] **Step 3: 创建项目集集合路由**

创建 `src/app/api/project-sets/route.ts`：

```ts
import { NextResponse } from "next/server";
import { createProjectSet, getDashboardData } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getDashboardData().projectSets);
}

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "项目集名称不能为空" }, { status: 400 });
  }
  return NextResponse.json(createProjectSet({ name: body.name }), { status: 201 });
}
```

- [ ] **Step 4: 创建项目集单项路由**

创建 `src/app/api/project-sets/[id]/route.ts`：

```ts
import { NextResponse } from "next/server";
import { deleteProjectSet, updateProjectSet } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = (await request.json()) as { name?: string };
  if (body.name !== undefined && !body.name.trim()) {
    return NextResponse.json({ error: "项目集名称不能为空" }, { status: 400 });
  }
  const projectSet = updateProjectSet(id, body);
  return projectSet
    ? NextResponse.json(projectSet)
    : NextResponse.json({ error: "项目集不存在" }, { status: 404 });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return deleteProjectSet(id)
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "项目集不存在" }, { status: 404 });
}
```

- [ ] **Step 5: 扩展项目路由字段与错误处理**

在 `src/app/api/projects/route.ts` 的 body 类型和 `createProject()` 参数中增加：

```ts
startDate?: string | null;
projectSetId?: string | null;
```

用以下错误处理包裹创建：

```ts
try {
  return NextResponse.json(createProject({
    name: body.name,
    description: body.description,
    projectType: body.projectType,
    status: body.status,
    startDate: body.startDate,
    dueDate: body.dueDate,
    tags: body.tags,
    archived: body.archived,
    workflowTemplateId: body.workflowTemplateId,
    projectSetId: body.projectSetId,
  }), { status: 201 });
} catch (error) {
  const message = error instanceof Error ? error.message : "项目创建失败";
  return NextResponse.json({ error: message }, { status: 400 });
}
```

在 `src/app/api/projects/[id]/route.ts` 的 `PATCH` 中捕获 `ProjectSetNotFoundError`，返回 `400`；不存在的项目仍返回 `404`。

- [ ] **Step 6: 运行 API 与完整测试**

Run: `npm test -- src/app/api/project-sets/route.test.ts`

Expected: PASS。

Run: `npm test`

Expected: PASS，全部测试通过。

- [ ] **Step 7: 提交 API**

```powershell
git add src/app/api/project-sets src/app/api/projects
git commit -m "feat: expose project set APIs"
```

### Task 5: 项目集三级浏览与基础管理界面

**Files:**
- Create: `src/components/project-set-browser.tsx`
- Modify: `src/components/project-manager-app.tsx`
- Modify: `src/components/project-manager-app.module.css`

- [ ] **Step 1: 创建聚焦项目集浏览的组件**

创建 `src/components/project-set-browser.tsx`，定义以下接口：

```tsx
"use client";

import { FormEvent, useState } from "react";
import { CalendarRange, FolderKanban, Pencil, Plus, Trash2 } from "lucide-react";
import type { Project, ProjectSetSummary } from "@/lib/types";
import styles from "./project-manager-app.module.css";

export type ProjectSetSelection = string | "unassigned";

type Props = {
  projectSets: ProjectSetSummary[];
  projects: Array<Project & { progress: number; taskCount: number }>;
  selection: ProjectSetSelection | null;
  pending: boolean;
  onSelectSet: (selection: ProjectSetSelection) => void;
  onBack: () => void;
  onOpenProject: (projectId: string) => void;
  onCreateSet: (name: string) => Promise<void>;
  onRenameSet: (id: string, name: string) => Promise<void>;
  onDeleteSet: (id: string) => Promise<void>;
  onCreateProject: (name: string, selection: ProjectSetSelection) => Promise<void>;
};
```

组件内部使用 `newSetName`、`newProjectName`、`editingSetId` 和 `editingName` 四个本地状态。项目集列表必须渲染一个固定的未分组卡片：

```tsx
<article className={styles.projectSetCard}>
  <button
    type="button"
    className={styles.projectSetCardMain}
    onClick={() => onSelectSet("unassigned")}
  >
    <div className={styles.projectSetCardTitle}>
      <FolderKanban size={17} />
      <strong>未分组项目</strong>
    </div>
    <span>
      {projects.filter((project) => !project.archived && !project.projectSetId).length} 个项目
    </span>
  </button>
</article>
```

在组件顶部定义状态和日期格式：

```tsx
const projectSetStatusLabels = {
  not_started: "未开始",
  active: "进行中",
  paused: "暂停",
  done: "完成",
} as const;

function formatProjectSetRange(startDate: string | null, endDate: string | null) {
  const start = startDate?.slice(0, 10) ?? "待确定";
  const end = endDate?.slice(0, 10) ?? "待确定";
  return `${start} 至 ${end}`;
}
```

每个项目集使用以下结构，确保名称、数量、状态、进度、日期和操作都可见：

```tsx
{projectSets.map((projectSet) => (
  <article className={styles.projectSetCard} key={projectSet.id}>
    <button
      type="button"
      className={styles.projectSetCardMain}
      onClick={() => onSelectSet(projectSet.id)}
    >
      <div className={styles.projectSetCardTitle}>
        <FolderKanban size={17} />
        <strong>{projectSet.name}</strong>
      </div>
      <div className={styles.projectSetMeta}>
        <span>{projectSet.projectCount} 个项目</span>
        <span>{projectSetStatusLabels[projectSet.status]}</span>
        <strong>{projectSet.progress}%</strong>
      </div>
      <div className={styles.projectSetProgress}>
        <i style={{ width: `${projectSet.progress}%` }} />
      </div>
      <span className={styles.projectSetRange}>
        <CalendarRange size={14} />
        {formatProjectSetRange(projectSet.startDate, projectSet.endDate)}
      </span>
    </button>
    <div className={styles.projectSetActions}>
      <button
        type="button"
        className={styles.iconButton}
        title="重命名项目集"
        onClick={() => {
          setEditingSetId(projectSet.id);
          setEditingName(projectSet.name);
        }}
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        className={styles.iconButton}
        title="删除项目集"
        onClick={() => void onDeleteSet(projectSet.id)}
      >
        <Trash2 size={14} />
      </button>
    </div>
  </article>
))}
```

项目集详情的项目列表使用 `projects.filter()` 按当前 `selection` 筛选，每个项目按钮显示名称和进度并调用 `onOpenProject(project.id)`。空列表显示“当前项目集暂无项目”。

- [ ] **Step 2: 在主组件中加入项目集导航状态**

在 `src/components/project-manager-app.tsx` 导入 `ProjectSetBrowser` 和 `ProjectSetSelection`，增加：

```ts
const [selectedProjectSetId, setSelectedProjectSetId] =
  useState<ProjectSetSelection | null>(null);
```

调整 `refresh()`：如果当前项目集被删除，则回到项目集列表；如果项目仍存在则保持项目详情选择。

增加回调：

```ts
async function createProjectSet(name: string) {
  await postJson("/api/project-sets", { name });
}

async function renameProjectSet(id: string, name: string) {
  await postJson(`/api/project-sets/${id}`, { name }, "PATCH");
}

async function deleteProjectSet(id: string) {
  const projectSet = data.projectSets.find((item) => item.id === id);
  if (!projectSet) return;
  if (!window.confirm(
    `确认删除项目集“${projectSet.name}”吗？\n\n所属项目会移入未分组项目，项目及任务不会被删除。`,
  )) return;
  await postJson(`/api/project-sets/${id}`, {}, "DELETE");
  setSelectedProjectSetId(null);
  setSelectedProjectId(null);
}

async function createProjectInSet(name: string, selection: ProjectSetSelection) {
  await postJson("/api/projects", {
    name,
    description: "新项目",
    projectSetId: selection === "unassigned" ? null : selection,
  });
}
```

- [ ] **Step 3: 重构项目管理渲染分支**

保持主页概览的现有项目进度卡不变。在 `initialView === "projects"` 且未选择项目时，改为：

```tsx
<ProjectSetBrowser
  projectSets={data.projectSets}
  projects={activeProjects}
  selection={selectedProjectSetId}
  pending={isPending}
  onSelectSet={(selection) => {
    setSelectedProjectSetId(selection);
    setSelectedProjectId(null);
  }}
  onBack={() => {
    setSelectedProjectSetId(null);
    setSelectedProjectId(null);
  }}
  onOpenProject={selectProject}
  onCreateSet={createProjectSet}
  onRenameSet={renameProjectSet}
  onDeleteSet={deleteProjectSet}
  onCreateProject={createProjectInSet}
/>
```

项目详情的“返回项目列表”按钮只调用 `clearProjectSelection()`；`clearProjectSelection()` 不再清空 `selectedProjectSetId`。项目集详情中的返回按钮单独调用 `setSelectedProjectSetId(null)`。

- [ ] **Step 4: 增加基础布局样式**

在 CSS Module 增加：

```css
.projectSetGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 14px;
}

.projectSetCard {
  min-height: 142px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  padding: 12px;
  border: 1px solid #dfe5ee;
  border-radius: 8px;
  background: #fbfdff;
  color: #172033;
  text-align: left;
}

.projectSetCard:hover {
  border-color: #93c5fd;
  background: #f8fbff;
}

.projectSetCardMain {
  min-width: 0;
  display: grid;
  align-content: space-between;
  gap: 12px;
  padding: 2px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.projectSetCardTitle,
.projectSetMeta,
.projectSetActions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.projectSetMeta {
  flex-wrap: wrap;
  color: #64748b;
  font-size: 12px;
}

.projectSetProgress {
  height: 4px;
  overflow: hidden;
  border-radius: 4px;
  background: #e2e8f0;
}

.projectSetProgress > i {
  display: block;
  height: 100%;
  background: #2563eb;
}
```

- [ ] **Step 5: 运行静态验证**

Run: `npm run lint`

Expected: PASS，无 ESLint 错误。

Run: `npm run build`

Expected: PASS，Next.js 编译和 TypeScript 检查通过。

- [ ] **Step 6: 提交三级浏览基础界面**

```powershell
git add src/components/project-set-browser.tsx src/components/project-manager-app.tsx src/components/project-manager-app.module.css
git commit -m "feat: add project set navigation"
```

### Task 6: 项目成员批量管理与项目详情字段

**Files:**
- Modify: `src/components/project-set-browser.tsx`
- Modify: `src/components/project-manager-app.tsx`
- Modify: `src/components/project-manager-app.module.css`

- [ ] **Step 1: 在项目集组件中增加成员选择状态**

在 `ProjectSetBrowser` 的 props 增加：

```ts
onSaveMembership: (projectSetId: string, projectIds: string[]) => Promise<void>;
```

组件增加：

```ts
const [showMembership, setShowMembership] = useState(false);
const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
```

点击“管理项目”时，用当前项目集成员初始化：

```ts
setMemberIds(
  new Set(projects.filter((project) => project.projectSetId === selection).map((project) => project.id)),
);
setShowMembership(true);
```

成员面板列出全部未归档项目，显示项目名和当前项目集名称；复选框支持多选。保存时调用：

```ts
await onSaveMembership(selection, [...memberIds]);
setShowMembership(false);
```

成员列表使用以下结构：

```tsx
<div className={styles.membershipList}>
  {projects.filter((project) => !project.archived).map((project) => {
    const currentSetName = project.projectSetId
      ? projectSets.find((item) => item.id === project.projectSetId)?.name ?? "未知项目集"
      : "未分组项目";
    return (
      <label className={styles.membershipOption} key={project.id}>
        <input
          type="checkbox"
          checked={memberIds.has(project.id)}
          onChange={(event) => {
            setMemberIds((current) => {
              const next = new Set(current);
              if (event.target.checked) next.add(project.id);
              else next.delete(project.id);
              return next;
            });
          }}
        />
        <span>
          <strong>{project.name}</strong>
          <small>当前：{currentSetName}</small>
        </span>
      </label>
    );
  })}
</div>
```

- [ ] **Step 2: 实现一次刷新完成的批量归属更新**

在主组件增加：

```ts
async function saveProjectSetMembership(projectSetId: string, selectedIds: string[]) {
  const selected = new Set(selectedIds);
  const changes = activeProjects.filter(
    (project) =>
      (selected.has(project.id) && project.projectSetId !== projectSetId) ||
      (!selected.has(project.id) && project.projectSetId === projectSetId),
  );

  const responses = await Promise.all(
    changes.map((project) =>
      fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSetId: selected.has(project.id) ? projectSetId : null,
        }),
      }),
    ),
  );
  const failed = responses.find((response) => !response.ok);
  if (failed) {
    const payload = (await failed.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "项目归属更新失败");
  }
  await refresh();
}
```

将该函数传给 `ProjectSetBrowser` 的 `onSaveMembership`。

- [ ] **Step 3: 扩展项目详情草稿与保存字段**

在 `createProjectDraft()` 增加：

```ts
startDate: toDateInput(project?.startDate ?? null),
projectSetId: project?.projectSetId ?? "",
```

在项目详情表单增加：

```tsx
<label>
  <span>开始时间</span>
  <input
    type="date"
    value={activeProjectDraft.startDate}
    onChange={(event) =>
      setProjectDraft({ ...activeProjectDraft, startDate: event.target.value })
    }
  />
</label>
<label>
  <span>所属项目集</span>
  <select
    value={activeProjectDraft.projectSetId}
    onChange={(event) =>
      setProjectDraft({ ...activeProjectDraft, projectSetId: event.target.value })
    }
  >
    <option value="">未分组项目</option>
    {data.projectSets.map((projectSet) => (
      <option key={projectSet.id} value={projectSet.id}>{projectSet.name}</option>
    ))}
  </select>
</label>
```

`handleProjectUpdate()` 的 payload 增加：

```ts
startDate: fromDateInput(activeProjectDraft.startDate),
projectSetId: activeProjectDraft.projectSetId || null,
```

保存成功后执行：

```ts
setSelectedProjectSetId(activeProjectDraft.projectSetId || "unassigned");
```

- [ ] **Step 4: 增加成员面板样式**

```css
.membershipPanel {
  display: grid;
  gap: 10px;
  margin: 0 14px 14px;
  padding: 12px;
  border: 1px solid #dfe5ee;
  border-radius: 8px;
  background: #fbfdff;
}

.membershipList {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.membershipOption {
  min-height: 44px;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid #edf1f6;
  border-radius: 6px;
  background: #ffffff;
}

.membershipOption small {
  display: block;
  overflow: hidden;
  color: #64748b;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 5: 运行完整测试、Lint 和构建**

Run: `npm test`

Expected: PASS。

Run: `npm run lint`

Expected: PASS。

Run: `npm run build`

Expected: PASS。

- [ ] **Step 6: 提交成员管理与项目详情字段**

```powershell
git add src/components/project-set-browser.tsx src/components/project-manager-app.tsx src/components/project-manager-app.module.css
git commit -m "feat: manage project set membership"
```

### Task 7: 响应式适配、错误反馈与浏览器验收

**Files:**
- Modify: `src/components/project-set-browser.tsx`
- Modify: `src/components/project-manager-app.tsx`
- Modify: `src/components/project-manager-app.module.css`

- [ ] **Step 1: 增加可见错误反馈**

在主组件增加：

```ts
const [projectSetMessage, setProjectSetMessage] = useState("");
```

在 `ProjectSetBrowser` 的 props 中增加：

```ts
message: string;
```

增加统一包装函数，项目集创建、重命名、删除、成员保存回调都通过它执行；失败时记录消息并继续抛出，让表单保留输入：

```ts
async function runProjectSetOperation(operation: () => Promise<void>) {
  try {
    setProjectSetMessage("");
    await operation();
  } catch (error) {
    setProjectSetMessage(error instanceof Error ? error.message : "项目集操作失败");
    throw error;
  }
}
```

例如创建回调改为：

```ts
async function createProjectSet(name: string) {
  await runProjectSetOperation(async () => {
    await postJson("/api/project-sets", { name });
  });
}
```

将信息传给 `ProjectSetBrowser`，组件在操作区下方渲染：

```tsx
{message ? <p className={styles.formMessage}>{message}</p> : null}
```

组件的创建表单只在请求成功后清空名称：

```tsx
async function submitNewSet(event: FormEvent) {
  event.preventDefault();
  if (!newSetName.trim()) return;
  try {
    await onCreateSet(newSetName);
    setNewSetName("");
  } catch {
    // 父组件已经展示错误；保留名称供用户修改后重试。
  }
}
```

- [ ] **Step 2: 完成窄屏布局**

在现有移动端媒体查询中加入：

```css
.projectSetGrid,
.membershipList {
  grid-template-columns: 1fr;
}

.projectSetCard {
  min-height: 126px;
}

.projectSetActions {
  justify-content: flex-start;
  flex-wrap: wrap;
}
```

确保项目集卡片、成员名称、日期范围使用 `min-width: 0` 和文本截断，不产生横向滚动。

- [ ] **Step 3: 启动开发服务**

Run: `npm run dev -- --hostname 127.0.0.1 --port 3000`

Expected: 服务持续运行，访问地址为 `http://127.0.0.1:3000/projects`。如果 3000 已由当前项目占用，复用现有服务；不要停止无关进程。

- [ ] **Step 4: 使用 in-app Browser 验收桌面流程**

在 `http://127.0.0.1:3000/projects` 完成并记录以下结果：

1. 首屏展示项目集卡片和“未分组项目”。
2. 创建“银行测评项目集”，名称和 `0%` 汇总正常。
3. 进入项目集，新建项目后只在该项目集列表中出现。
4. 打开“管理项目”，将两个现有项目加入，确认原项目集归属被替换。
5. 打开项目详情，设置开始时间和截止日期，切换所属项目集并保存。
6. 返回项目列表后进入正确的新归属项目集。
7. 归档一个项目后，该项目不再显示且项目集统计排除它。
8. 删除项目集，确认提示文字明确，项目进入未分组，任务仍存在。
9. 浏览器控制台没有 error 日志。

- [ ] **Step 5: 使用 in-app Browser 验收移动视口**

将视口调整为 `390 × 844`，检查：

- 项目集卡片单列展示。
- 新建、重命名、删除和返回按钮不重叠。
- 成员多选列表单列展示。
- 项目详情的开始时间和所属项目集输入框没有横向溢出。

- [ ] **Step 6: 运行最终验证**

Run: `npm test`

Expected: 所有测试通过，失败数为 0。

Run: `npm run lint`

Expected: ESLint 退出码为 0。

Run: `npm run build`

Expected: Next.js 生产构建退出码为 0；若首次因 Google 字体网络请求失败，确认网络恢复后只重试一次并以第二次输出为准。

- [ ] **Step 7: 提交最终 UI 修正**

```powershell
git add src/components/project-set-browser.tsx src/components/project-manager-app.tsx src/components/project-manager-app.module.css
git commit -m "fix: polish project set workflows"
```

### Task 8: 文档与提交范围核对

**Files:**
- Modify: `README.md`
- Reference: `docs/superpowers/specs/2026-06-13-project-sets-design.md`

- [ ] **Step 1: 更新 README 功能和数据说明**

在功能清单增加：

```markdown
- 项目集：按项目集组织多个项目，自动汇总状态、进度和项目时间范围。
```

在本地数据说明增加：

```markdown
项目集、项目归属和项目开始时间与其他项目数据一同保存在本地 SQLite，并包含在设置页导出的数据快照中。
```

- [ ] **Step 2: 核对设计覆盖**

逐项核对设计文档中的范围：唯一归属、未分组入口、自动状态、平均进度、自动日期、归档排除、删除后移入未分组、成员多选、详情切换归属、备份兼容。任何一项未通过不得标记计划完成。

- [ ] **Step 3: 检查工作区只暂存本功能文件**

Run: `git status --short`

Expected: 能区分项目集功能改动与用户已有的其他未提交改动；不得使用 `git add .`，不得回滚其他改动。

- [ ] **Step 4: 提交文档**

```powershell
git add README.md
git commit -m "docs: document project set management"
```

- [ ] **Step 5: 输出交付摘要**

摘要必须包含：实现的三级导航、项目集统计规则、项目归属和日期字段、删除行为、测试数量、Lint/构建结果、浏览器桌面与移动验收结果，以及任何仍存在的限制。
