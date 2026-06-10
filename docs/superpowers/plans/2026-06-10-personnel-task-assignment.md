# Personnel Management and Task Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add editable and soft-deletable assessment personnel records, multi-person task assignment, automatic/manual task start time, and read-only project ownership in task details.

**Architecture:** Extend the existing `node:sqlite` store with `personnel`, `task_personnel`, and `tasks.start_time`. Keep personnel and assignments in the dashboard payload so the current single-page client can render settings and inspectors without a second client-side data layer. Enforce start-time and project-ownership rules in the store/API, then expose focused UI controls in the existing settings and task inspector surfaces.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Node 24 `node:sqlite`, CSS Modules, Vitest.

---

## File Structure

- Modify `src/lib/types.ts`: shared `Personnel`, task assignment, start-time, dashboard, and export types.
- Modify `src/lib/store.ts`: SQLite migration, personnel CRUD, task assignment transaction, start-time rule, project assignment operation, dashboard/export/import support.
- Modify `src/lib/store.test.ts`: data-layer behavior tests.
- Create `src/app/api/personnel/route.ts`: list and create personnel.
- Create `src/app/api/personnel/[id]/route.ts`: edit and soft-delete personnel.
- Modify `src/app/api/tasks/[id]/route.ts`: task validation and structured errors.
- Create `src/app/api/tasks/[id]/assign-project/route.ts`: explicit temporary-task project assignment.
- Modify `src/components/project-manager-app.tsx`: personnel settings UI, assignment selector, start-time editor, read-only project field, and dedicated project assignment call.
- Modify `src/components/project-manager-app.module.css`: personnel table and multi-select styling.
- Modify `prisma/schema.prisma`: reference schema parity with runtime SQLite.

### Task 1: Shared Types and Runtime Schema

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/store.ts`
- Modify: `prisma/schema.prisma`
- Test: `src/lib/store.test.ts`

- [ ] **Step 1: Write failing schema and mapping tests**

Add tests asserting a created task exposes `startTime: null` and `assignees: []`, and that personnel tables can be queried through the planned store API.

```ts
const task = store.createTask({ title: "现场测评" });
expect(task?.startTime).toBeNull();
expect(task?.assignees).toEqual([]);
expect(store.getPersonnel()).toEqual([]);
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- src/lib/store.test.ts`

Expected: FAIL because `Task.startTime`, `Task.assignees`, and `getPersonnel` do not exist.

- [ ] **Step 3: Add shared types and SQLite migration**

Add:

```ts
export type Personnel = {
  id: string;
  name: string;
  certificateNumber: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskAssignee = Personnel;
```

Extend `Task` with `startTime: string | null` and `assignees: TaskAssignee[]`; extend `DashboardData` with `personnel: Personnel[]` and personnel count.

Create runtime tables and indexes:

```sql
ALTER TABLE tasks ADD COLUMN start_time TEXT;
CREATE TABLE IF NOT EXISTS personnel (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  certificate_number TEXT NOT NULL UNIQUE,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS task_personnel (
  task_id TEXT NOT NULL,
  personnel_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (task_id, personnel_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (personnel_id) REFERENCES personnel(id)
);
```

Use the existing safe column-add helper for `start_time`. Update the Prisma reference schema with matching `Personnel`, `TaskPersonnel`, and `Task.startTime` fields.

- [ ] **Step 4: Map task assignments efficiently**

Read all `task_personnel JOIN personnel` rows once in `getTasks()`, group them by task ID, and pass the map into `mapTask` rather than querying per task.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npm test -- src/lib/store.test.ts`

Expected: new schema/mapping tests pass.

### Task 2: Personnel CRUD

**Files:**
- Modify: `src/lib/store.ts`
- Modify: `src/lib/store.test.ts`
- Create: `src/app/api/personnel/route.ts`
- Create: `src/app/api/personnel/[id]/route.ts`

- [ ] **Step 1: Write failing personnel behavior tests**

Cover create, update, duplicate certificate rejection, soft delete, deleted-person edit rejection, and retained task assignment.

```ts
const person = store.createPersonnel({ name: "张三", certificateNumber: "CERT-001" });
expect(person.name).toBe("张三");
expect(() => store.createPersonnel({ name: "李四", certificateNumber: "CERT-001" }))
  .toThrow("证书编号已存在");
const deleted = store.deletePersonnel(person.id);
expect(deleted?.deletedAt).not.toBeNull();
expect(() => store.updatePersonnel(person.id, { name: "新姓名" }))
  .toThrow("已删除人员不可编辑");
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/lib/store.test.ts`

Expected: FAIL because personnel CRUD functions do not exist.

- [ ] **Step 3: Implement personnel store functions**

Implement `getPersonnel`, `createPersonnel`, `updatePersonnel`, and `deletePersonnel`. Trim inputs, require both fields, preserve certificate uniqueness across deleted records, set `deleted_at`/`updated_at` on delete, and return mapped rows.

- [ ] **Step 4: Add route handlers**

Use Next.js 16 async dynamic params:

```ts
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // validate and return NextResponse.json(...)
}
```

Map validation conflicts to status `400` or `409`, and missing personnel to `404`.

- [ ] **Step 5: Run tests, lint, and verify GREEN**

Run: `npm test -- src/lib/store.test.ts && npm run lint`

Expected: personnel tests pass and lint reports no errors.

### Task 3: Task Assignment and Start Time Rules

**Files:**
- Modify: `src/lib/store.ts`
- Modify: `src/lib/store.test.ts`
- Modify: `src/app/api/tasks/[id]/route.ts`

- [ ] **Step 1: Write failing assignment tests**

Cover multiple active assignees, retaining/removing an already assigned deleted person, rejecting a newly assigned deleted person, and rejecting unknown personnel IDs.

```ts
const updated = store.updateTask(task.id, { personnelIds: [first.id, second.id] });
expect(updated?.assignees.map((item) => item.id)).toEqual([first.id, second.id]);
store.deletePersonnel(first.id);
expect(store.updateTask(task.id, { personnelIds: [first.id] })?.assignees[0].deletedAt)
  .not.toBeNull();
```

- [ ] **Step 2: Write failing start-time tests**

```ts
const started = store.updateTask(task.id, { statusKey: "in_progress" });
expect(started?.startTime).not.toBeNull();
const manual = store.updateTask(task.id, { startTime: "2026-06-01T08:00:00.000Z" });
store.updateTask(task.id, { statusKey: "todo" });
const restarted = store.updateTask(task.id, { statusKey: "in_progress" });
expect(restarted?.startTime).toBe("2026-06-01T08:00:00.000Z");
```

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test -- src/lib/store.test.ts`

Expected: FAIL because `personnelIds` and `startTime` updates are unsupported.

- [ ] **Step 4: Implement transactional task updates**

Extend `updateTask` input with `personnelIds?: string[]` and `startTime?: string | null`. Before assignment replacement, compare requested IDs with existing assignments: active people may be newly added; deleted people may only remain if already assigned. Update task fields and assignment rows in one SQLite transaction.

When `statusKey === "in_progress"` and stored `start_time` is empty, set it to `new Date().toISOString()` unless the same request supplies an explicit `startTime` value. Never overwrite a non-empty start time automatically.

- [ ] **Step 5: Reject project changes in the regular task route**

If `projectId` is present in the PATCH JSON body, return status `400` with `归属项目不能在任务详情中修改` before calling `updateTask`.

- [ ] **Step 6: Run tests and verify GREEN**

Run: `npm test -- src/lib/store.test.ts`

Expected: assignment, deleted-person, start-time, and project-protection tests pass.

### Task 4: Dedicated Temporary Task Project Assignment

**Files:**
- Modify: `src/lib/store.ts`
- Modify: `src/lib/store.test.ts`
- Create: `src/app/api/tasks/[id]/assign-project/route.ts`
- Modify: `src/components/project-manager-app.tsx`

- [ ] **Step 1: Write failing project-assignment tests**

Assert `assignTaskToProject` updates only project ownership/source type, rejects missing tasks/projects, and leaves the regular `updateTask` contract project-free.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/lib/store.test.ts`

Expected: FAIL because `assignTaskToProject` does not exist.

- [ ] **Step 3: Implement store function and route**

Add `assignTaskToProject(taskId, projectId)` and `PATCH /api/tasks/[id]/assign-project`. Set `project_id` to the validated target and `source_type` to `project`, preserving all other task fields.

- [ ] **Step 4: Update temporary-task client flow**

Replace any task detail PATCH that sends `projectId` with the dedicated endpoint. Refresh dashboard data after success.

- [ ] **Step 5: Run tests and lint**

Run: `npm test -- src/lib/store.test.ts && npm run lint`

Expected: project assignment tests pass.

### Task 5: Settings Personnel Management UI

**Files:**
- Modify: `src/components/project-manager-app.tsx`
- Modify: `src/components/project-manager-app.module.css`

- [ ] **Step 1: Add client state and actions**

Add create/edit drafts, selected edit ID, request error text, and handlers calling `/api/personnel`. Refresh dashboard data after mutations and reset forms only after successful responses.

- [ ] **Step 2: Render personnel management section**

Add a full-width settings section above backup/import controls with name and certificate inputs, an add/save button, and a compact list. Active rows expose edit and delete actions; deleted rows are visually muted, show `已删除`, and expose no edit action.

- [ ] **Step 3: Add deletion confirmation**

Use the explicit message: `删除后该人员将不再出现在新任务分配列表中，历史任务仍会保留人员记录。确认删除吗？`

- [ ] **Step 4: Add responsive styles**

Use a restrained table/list layout on desktop and stacked rows on narrow screens. Keep controls at stable heights and avoid nested cards.

- [ ] **Step 5: Run lint**

Run: `npm run lint`

Expected: PASS.

### Task 6: Task Inspector Assignment, Start Time, and Read-only Project

**Files:**
- Modify: `src/components/project-manager-app.tsx`
- Modify: `src/components/project-manager-app.module.css`

- [ ] **Step 1: Extend the task draft**

Add `startTime` and `personnelIds` to `createTaskDraft`. Convert ISO values to/from `datetime-local` at the UI boundary.

- [ ] **Step 2: Add personnel multi-select control**

Render selected people as removable tags and an active-person native multiple select or checkbox menu. Deleted assigned people remain visible as `姓名！`, with `title="该人员已删除"`, but do not appear in available candidates.

- [ ] **Step 3: Add start-time editor**

Render a `datetime-local` input. After status is changed to `in_progress`, use the returned task or refreshed dashboard so the automatically generated start time appears immediately.

- [ ] **Step 4: Make project ownership read-only**

Replace the inspector project `<select>` with plain project-name text. Keep the separate temporary-task “归入项目” control outside the normal task detail save payload.

- [ ] **Step 5: Update task save payload**

Send editable task fields plus `startTime` and `personnelIds`; omit `projectId` and `sourceType` from the regular task PATCH.

- [ ] **Step 6: Run lint and build**

Run: `npm run lint && npm run build`

Expected: PASS.

### Task 7: Dashboard, Export/Import, and End-to-End Verification

**Files:**
- Modify: `src/lib/store.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/store.test.ts`

- [ ] **Step 1: Write failing export/import tests**

Export personnel, assignments, and task start time; import into a clean test database; assert all three survive the round trip, including a deleted person assigned to a task.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/lib/store.test.ts`

Expected: FAIL because export/import omits the new entities.

- [ ] **Step 3: Extend dashboard and local data format**

Include `personnel` in `getDashboardData`, add personnel counts to safety info, and extend `LocalDataExport`. Keep import version `1` compatible by treating absent personnel/assignment/start-time fields as empty/null.

- [ ] **Step 4: Run full automated verification**

Run:

```powershell
npm test
npm run lint
npm run build
```

Expected: all tests, lint, TypeScript, and production build pass.

- [ ] **Step 5: Verify rendered flows in the browser**

At `http://127.0.0.1:3000/settings`, add/edit/delete a person. At a project task detail, assign multiple active people, change status to in-progress, confirm start time appears, manually change it, and verify project ownership is text-only. Delete an assigned person and confirm the task displays `姓名！`. Check browser console for errors and capture desktop screenshots outside committed source.

- [ ] **Step 6: Review changed files and report residual risk**

Confirm no local database, screenshot, temporary script, or unrelated user change is staged. Report any browser interaction that could not be automated reliably.
