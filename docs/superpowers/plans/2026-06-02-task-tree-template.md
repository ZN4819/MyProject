# 项目任务树模板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build project-type-driven task tree templates that can be recommended for a project and applied to generate a real project task tree with prerequisite dependencies.

**Architecture:** Keep existing workflow templates as status-flow templates. Add task tree templates as a separate domain with template nodes and dependency edges, then expose recommendation and apply endpoints. The UI stays in the existing project manager component but separates “状态工作流模板” from “项目任务树模板”.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Node SQLite, Vitest, CSS Modules.

---

### Task 1: Domain Types And Recommendation Logic

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/domain.ts`
- Test: `src/lib/domain.test.ts`

- [ ] Add task tree template and dependency types.
- [ ] Write failing tests for template recommendation and dependency mapping helpers.
- [ ] Implement `recommendTaskTreeTemplates`.
- [ ] Implement `buildTemplateTaskTree`.
- [ ] Run `npm test -- src/lib/domain.test.ts`.

### Task 2: SQLite Store And API

**Files:**
- Modify: `src/lib/store.ts`
- Modify: `src/lib/store.test.ts`
- Create: `src/app/api/task-tree-templates/route.ts`
- Create: `src/app/api/projects/[id]/recommended-templates/route.ts`
- Create: `src/app/api/projects/[id]/apply-template/route.ts`

- [ ] Write failing store tests for template creation, recommendation and applying a template.
- [ ] Add schema tables for task tree templates, nodes, template dependencies and task dependencies.
- [ ] Add `project_type` and `template_node_id` migration columns.
- [ ] Implement store functions.
- [ ] Add API routes.
- [ ] Run `npm test -- src/lib/store.test.ts`.

### Task 3: UI Integration

**Files:**
- Modify: `src/components/project-manager-app.tsx`
- Modify: `src/components/project-manager-app.module.css`

- [ ] Add project type field in project detail form.
- [ ] Add task tree template creation panel to the workflows page.
- [ ] Add recommended template panel in project detail.
- [ ] Add apply-template action and refresh data after apply.
- [ ] Render task prerequisite chips in task detail or task tree.

### Task 4: Verification

**Files:**
- Verify only.

- [ ] Run `npm test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Start or reuse local dev server.
- [ ] Verify `/projects` and `/workflows` in browser.

