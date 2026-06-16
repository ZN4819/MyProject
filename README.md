# Project Manager Platform

一个本地 / 内网使用的个人项目管理平台 MVP。  
当前重点围绕“统一任务池 + 项目集 + 多级任务树 + 周期/临时任务”展开，界面风格偏清爽、专业、轻量。

## 项目概览

核心模型是“统一任务池”：

- 项目任务、周期任务、临时任务底层统一为任务。
- 通过 `sourceType`、`projectId`、`parentId`、`workflow`、`recurrenceRule` 等字段区分来源和行为。
- 项目管理当前已经扩展到“项目集 -> 项目 -> 任务”的三级管理结构。

## 当前功能

### 主页概览

- 顶部统计信息
- 项目整体进度
- 临时任务列表
- 周期任务列表

### 项目管理

- 项目集列表
- 固定“未分组项目”入口
- 项目集内项目列表
- 项目详情编辑
- 项目归档与永久删除
- 项目开始时间、截止日期、标签、工作流、所属项目集维护
- 根任务与子任务树展示
- 根任务按列并列展示
- 右侧任务详情面板

### 项目集管理

- 新建、重命名、删除项目集
- 在项目集内新建项目
- 将已有项目批量加入 / 移出项目集
- 项目集自动汇总：
  - 项目数量
  - 进度
  - 状态
  - 最早开始时间 / 最晚结束时间

### 任务中心

- 根任务模板管理
- 列表视图
- 流转图视图
- 模板节点与关系维护的基础能力

### 周期任务

- 周期规则维护
- 起始时间 / 结束时间 / 频率 / 下次触发
- 生成任务实例

### 临时任务

- 快速录入
- 保持在临时任务列表中展示
- 可关联项目

### 工作流模板

- 内置工作流模板
- 项目选择工作流

### 设置

- 归档项目管理
- 人员录入、编辑、删除
- 本地数据导出 / 导入 / 备份

## 技术栈

- Next.js 16 App Router
- React 19
- TypeScript
- CSS Modules
- `lucide-react`
- `@xyflow/react`
- Vitest
- Node 24 内置 `node:sqlite`

> 当前运行时数据访问在 `src/lib/store.ts`，`prisma/schema.prisma` 主要保留为数据模型参考。

## 本地运行

建议在项目根目录执行：

```powershell
npm install
npm run dev -- --hostname 127.0.0.1 --port 3000
```

打开：

```text
http://127.0.0.1:3000/
```

## 常用命令

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3000
npm test
npm run lint
npm run build
```

## 数据存储

- 本地 SQLite 数据文件默认在：
  - `data/project-manager.sqlite`
- 首次运行时会自动建表并写入初始数据。
- 项目集、项目归属、项目开始时间、任务、人员等数据都保存在本地 SQLite 中。
- 设置页导出的数据快照会包含：
  - 项目集
  - 项目
  - 任务
  - 周期规则
  - 工作流
  - 根任务模板
  - 人员信息

## 主要目录

- `src/app/page.tsx`：主页入口
- `src/components/project-manager-app.tsx`：核心界面与交互
- `src/components/project-set-browser.tsx`：项目集相关浏览与成员管理
- `src/components/project-manager-app.module.css`：主样式文件
- `src/app/api/**/route.ts`：API 路由
- `src/lib/store.ts`：SQLite 读写与数据聚合
- `src/lib/domain.ts`：领域纯函数
- `src/lib/project-set-ui.ts`：项目集 UI 辅助逻辑
- `src/lib/types.ts`：共享类型定义

## 当前约束与说明

- 一个项目只能属于一个项目集，或处于“未分组项目”。
- 项目集删除后，项目不会被删除，只会移回未分组。
- 项目集相关批量操作会统一刷新，避免前端状态滞后。
- 项目集相关提交按钮有真实 pending 禁用态，避免重复提交。
- 本项目优先面向本地单人使用场景，当前不包含多人权限系统。

## 测试

当前使用 Vitest 进行逻辑与接口层验证。

```powershell
npm test
```

最近重点覆盖的内容包括：

- 项目集汇总与筛选规则
- 项目集成员批量变更
- 项目详情中的项目集归属与开始时间映射
- 项目移组后的上下文联动
- 项目集操作的 pending 生命周期

## 开发提示

- 前端交互改动后，建议至少手动验证一次：
  - `http://127.0.0.1:3000/projects`
- 如果 `next build` 自动修改了 `tsconfig.json`，需要重新检查变更是否合理。
- 不要提交 `data/` 目录下的数据库文件。
