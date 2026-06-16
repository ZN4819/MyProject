# Task Detail Project Title Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将任务详情中的项目归属移动到标题区，并按“项目名称-任务名称”展示。

**Architecture:** 在领域工具中增加纯格式化函数，由任务详情组件调用；删除表单中的只读项目字段，不改变任务数据与项目归属接口。

**Tech Stack:** TypeScript、React、Vitest、Next.js

---

### Task 1: 标题格式规则

**Files:**
- Modify: `src/lib/domain.test.ts`
- Modify: `src/lib/domain.ts`

- [x] 写入项目任务和未归属任务的失败测试。
- [x] 运行 `npm test -- src/lib/domain.test.ts`，确认因格式化函数缺失而失败。
- [x] 实现 `formatTaskDetailSubtitle`。
- [x] 再次运行测试并确认通过。

### Task 2: 任务详情布局

**Files:**
- Modify: `src/components/project-manager-app.tsx`

- [x] 使用格式化函数生成任务详情副标题。
- [x] 删除表单中的“归属项目”只读字段。
- [x] 运行 `npm run lint`、`npm test` 和 `npm run build`。
- [x] 在 `/projects` 中验证页面可访问及任务详情渲染代码。
