# AGENTS.md

## 沟通与安全要求

- 始终使用中文和用户沟通。
- 不要批量删除文件；涉及删除、移动大量文件或清理目录时，必须先说明范围并获得明确确认。
- 当前项目位于 `F:\Codex\XMGL\project-manager-platform`。
- 这是用户的本地个人项目管理平台，优先保护本地数据与现有改动。
- 工作区可能存在用户未提交改动；不要回滚、覆盖或重置用户改动，除非用户明确要求。

## 项目定位

本项目是一个本地/内网使用的个人项目管理平台 MVP，视觉风格为清爽、专业、简洁。核心产品模型是“统一任务池”：

- 项目任务、周期性任务、临时任务底层都属于任务。
- 通过 `sourceType`、`projectId`、`parentId`、`recurrenceRule`、`workflow` 等字段区分来源和行为。
- 重点功能包括主页概览、项目管理、多级子任务、任务工作流、周期任务、临时任务、任务详情面板和项目集管理。

## 技术栈与运行环境

- 框架：Next.js App Router、React、TypeScript。
- UI：CSS Modules，图标使用 `lucide-react`。
- 测试：Vitest。
- 数据库：运行层使用 Node 24 内置 `node:sqlite`，数据文件默认在 `data/project-manager.sqlite`。
- Prisma：当前保留 `prisma/schema.prisma` 作为数据模型参考；不要默认依赖 Prisma CLI 完成运行时数据读写。

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 常用命令

在项目根目录执行：

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3000
npm test
npm run lint
npm run build
```

本地访问地址：

```text
http://127.0.0.1:3000/
```

## 主要目录

- `src/app/page.tsx`：主页入口，服务端读取 dashboard 初始数据。
- `src/components/project-manager-app.tsx`：核心客户端应用界面与交互。
- `src/components/project-set-browser.tsx`：项目集列表、项目集内项目列表与成员管理界面。
- `src/components/project-manager-app.module.css`：主要 UI 样式。
- `src/app/api/**/route.ts`：项目、任务、周期规则、工作流、项目集、人员和概览接口。
- `src/lib/store.ts`：本地 SQLite 建表、种子数据、查询和写入逻辑。
- `src/lib/domain.ts`：任务树、进度计算、周期时间计算、项目集筛选等纯领域逻辑。
- `src/lib/project-set-ui.ts`：项目集 UI 相关纯函数与提交流程辅助逻辑。
- `src/lib/types.ts`：前后端共享类型。
- `src/types/node-sqlite.d.ts`：Node 内置 SQLite 类型声明。
- `prisma/schema.prisma`：数据模型参考，不是当前运行时的唯一事实来源。

## 数据层约定

- `store.ts` 首次访问会自动创建 SQLite 表并写入种子数据。
- `data/` 是本地运行数据目录，已加入 `.gitignore`，不要提交其中的数据库文件。
- 如果修改任务、项目、项目集、周期规则、人员的数据结构，应同步考虑：
  - SQLite 建表 SQL；
  - 种子数据；
  - `src/lib/types.ts`；
  - API 输入输出；
  - 相关领域测试和存储测试。
- 优先把可独立验证的业务规则放在 `src/lib/domain.ts` 或 `src/lib/project-set-ui.ts`，并为它们补测试。

## UI 与交互约定

- 应用第一屏应是实际可用的工作台，不要改成营销页或说明页。
- 保持清爽专业风格：浅色背景、克制色彩、小圆角、轻边框、少阴影。
- 不要使用装饰性渐变球、过重阴影、大面积营销 hero 或无关插图。
- 主要布局保持：左侧导航、顶部搜索/标题、中间主工作区、按需出现的右侧详情区。
- 移动端必须避免横向溢出，文字和按钮不能相互遮挡。
- 按钮和工具操作优先使用图标加必要短文本；图标优先使用 `lucide-react`。
- 项目管理当前采用三级视图：项目集列表 -> 项目列表 -> 项目详情。
- 项目集相关交互必须注意：
  - 项目只允许属于一个项目集，或处于“未分组项目”；
  - 项目移组后，当前详情上下文必须同步更新；
  - 批量调整项目集成员后，需要统一刷新，避免前端停留在旧状态；
  - 项目集相关提交按钮必须有真实 pending 禁用态，避免重复提交。

## 开发流程

- 修改功能前先阅读相关文件，不要凭记忆改 Next.js 或 React API。
- 对领域逻辑、状态流转、进度计算、项目集归属、批量保存行为等变化，先补或更新测试。
- 小改动后至少运行 `npm run lint`；涉及逻辑或数据层时运行 `npm test`；交付前运行 `npm run build`。
- 前端界面改动后，启动本地服务并在浏览器检查桌面和移动端视口。
- 不要把生成截图、临时调试脚本、数据库文件或缓存目录提交进项目。
- 如果 `next build` 重新写回 `tsconfig.json`，需要重新确认变更是否合理，避免把错误的开发态类型配置长期保留在项目里。

## 当前已实现能力

- 主页概览：顶部统计、项目进度、临时任务列表、周期任务列表。
- 项目管理：
  - 项目集列表与未分组入口；
  - 项目集内项目列表；
  - 项目详情编辑；
  - 项目归档与永久删除；
  - 推荐/手动选择根任务模板；
  - 根任务分列展示与右侧任务详情面板。
- 项目集管理：
  - 新建、重命名、删除项目集；
  - 在项目集内新建项目；
  - 批量将已有项目加入或移出项目集；
  - 项目集统计自动汇总项目数量、状态、进度、起止时间。
- 任务中心：根任务模板管理，支持列表视图与流转图视图。
- 周期任务：规则维护、下一次触发计算、任务生成。
- 临时任务：快速捕获、保留在临时任务列表、可关联项目。
- 工作流模板：内置工作流及项目选择。
- 设置：归档项目管理、人员录入与数据导入导出。

## 测试与验收重点

- 项目集变更后：
  - 当前项目详情不能继续停留在旧项目集上下文；
  - 部分成功部分失败时也要刷新一次，保证前端与数据库状态一致；
  - pending 状态要能真正禁用项目集相关按钮。
- 项目管理视图要重点验证：
  - 根任务筛选、状态筛选和详情联动；
  - 删除任务、删除项目、归档项目后的右侧详情一致性；
  - 项目集切换后页面上下文是否正确回退或跳转。
- 每次涉及项目集、项目详情、任务详情联动的修改后，至少人工验证一次 `http://127.0.0.1:3000/projects`。

## 注意事项

- 当前依赖包含 `@prisma/client` 和 `prisma`，但运行时数据库访问在 `src/lib/store.ts`。
- 如果未来要恢复 Prisma 作为运行时 ORM，需要先确认 Prisma CLI 在当前路径和 Node 版本下可以稳定执行迁移、生成客户端和访问 SQLite。
- 如果本地服务占用端口 3000，先定位并停止对应开发服务，不要随意杀无关进程。
