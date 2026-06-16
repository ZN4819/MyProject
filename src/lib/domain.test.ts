import { describe, expect, it } from "vitest";
import {
  buildTaskTree,
  buildTemplateTaskTree,
  calculateProjectSetSummary,
  calculateProjectProgress,
  calculateRootTaskProgress,
  canMoveTaskToParent,
  filterTasks,
  filterProjectsByProjectSet,
  filterTasksByRoot,
  filterTasksByStatusKeepingRoots,
  formatAssigneeNames,
  formatTaskDetailSubtitle,
  getNextOccurrence,
  getNextSelectedTaskIdAfterDelete,
  recommendTaskTreeTemplates,
  reorderTaskWithinSiblings,
  type FlatTask,
  type RecurrenceRuleInput,
} from "./domain";

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

  it("对未归档项目计算四舍五入后的平均进度和日期范围", () => {
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
        project({
          status: "done",
          progress: 100,
          startDate: "2026-01-01T00:00:00.000Z",
          dueDate: "2026-12-31T00:00:00.000Z",
          archived: true,
        }),
      ]),
    ).toEqual({
      projectCount: 2,
      progress: 50,
      status: "active",
      startDate: "2026-06-01T00:00:00.000Z",
      endDate: "2026-08-20T00:00:00.000Z",
    });
  });

  it("全部完成时状态为完成", () => {
    expect(
      calculateProjectSetSummary([
        project({ status: "done", progress: 100 }),
        project({ status: "done", progress: 100 }),
      ]).status,
    ).toBe("done");
  });

  it("没有进行中项目且存在暂停项目时状态为暂停", () => {
    expect(
      calculateProjectSetSummary([
        project({ status: "paused" }),
        project({ status: "paused" }),
      ]).status,
    ).toBe("paused");
  });

  it("空项目集返回未开始和空日期", () => {
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
    { id: "d", projectSetId: null, archived: true },
    { id: "e", projectSetId: "set-2", archived: false },
  ];

  it("按具体项目集筛选并排除归档项目", () => {
    expect(
      filterProjectsByProjectSet(projects, "set-1").map((item) => item.id),
    ).toEqual(["a"]);
  });

  it("未分组入口只返回没有项目集的未归档项目", () => {
    expect(
      filterProjectsByProjectSet(projects, "unassigned").map(
        (item) => item.id,
      ),
    ).toEqual(["b"]);
  });
});

describe("formatTaskDetailSubtitle", () => {
  it("按项目名称和任务名称生成任务详情副标题", () => {
    expect(
      formatTaskDetailSubtitle("XX银行商用密码应用安全性评估", "核心系统"),
    ).toBe("XX银行商用密码应用安全性评估-核心系统");
  });

  it("未归属项目时使用明确的占位名称", () => {
    expect(formatTaskDetailSubtitle(null, "临时检查")).toBe(
      "未归属项目-临时检查",
    );
  });
});

describe("formatAssigneeNames", () => {
  it("显示根任务自身分配的人员并标识已删除人员", () => {
    expect(
      formatAssigneeNames([
        { name: "张三", deletedAt: null },
        { name: "李四", deletedAt: "2026-06-13T00:00:00.000Z" },
      ]),
    ).toBe("张三、李四！");
  });

  it("没有分配人员时显示未分配", () => {
    expect(formatAssigneeNames([])).toBe("未分配");
  });
});

const tasks: FlatTask[] = [
  {
    id: "task-1",
    title: "项目启动",
    parentId: null,
    statusKey: "in_progress",
    sortOrder: 1,
  },
  {
    id: "task-1-1",
    title: "整理需求",
    parentId: "task-1",
    statusKey: "done",
    sortOrder: 1,
  },
  {
    id: "task-1-1-1",
    title: "确认周期任务",
    parentId: "task-1-1",
    statusKey: "todo",
    sortOrder: 1,
  },
  {
    id: "task-2",
    title: "独立临时任务",
    parentId: null,
    statusKey: "todo",
    sortOrder: 2,
  },
];

describe("buildTaskTree", () => {
  it("按 parentId 递归构建多级任务树并保留排序", () => {
    const tree = buildTaskTree(tasks);

    expect(tree).toHaveLength(2);
    expect(tree[0].id).toBe("task-1");
    expect(tree[0].children[0].id).toBe("task-1-1");
    expect(tree[0].children[0].children[0].id).toBe("task-1-1-1");
    expect(tree[1].id).toBe("task-2");
  });
});

describe("calculateProjectProgress", () => {
  it("只按完成状态统计项目进度百分比", () => {
    const progress = calculateProjectProgress(tasks, ["done"]);

    expect(progress.total).toBe(4);
    expect(progress.completed).toBe(1);
    expect(progress.percent).toBe(25);
  });

  it("空任务项目进度为 0", () => {
    expect(calculateProjectProgress([], ["done"]).percent).toBe(0);
  });
});

describe("calculateRootTaskProgress", () => {
  it("递归统计根任务下所有层级子任务的完成比例", () => {
    const progress = calculateRootTaskProgress(
      {
        statusKey: "todo",
        children: [
          { statusKey: "done" },
          {
            statusKey: "in_progress",
            children: [{ statusKey: "done" }, { statusKey: "todo" }],
          },
        ],
      },
      ["done"],
    );

    expect(progress).toEqual({ total: 4, completed: 2, percent: 50 });
  });

  it("没有子任务时根据根任务自身状态计算", () => {
    expect(
      calculateRootTaskProgress({ statusKey: "done" }, ["done"]),
    ).toEqual({ total: 1, completed: 1, percent: 100 });
  });
});

describe("getNextOccurrence", () => {
  it("计算每日周期任务的下一次触发时间", () => {
    const rule: RecurrenceRuleInput = {
      frequency: "daily",
      interval: 2,
      nextRunAt: new Date("2026-06-02T01:00:00.000Z"),
    };

    expect(getNextOccurrence(rule).toISOString()).toBe(
      "2026-06-04T01:00:00.000Z",
    );
  });

  it("计算每周周期任务的下一次触发时间", () => {
    const rule: RecurrenceRuleInput = {
      frequency: "weekly",
      interval: 1,
      nextRunAt: new Date("2026-06-02T01:00:00.000Z"),
    };

    expect(getNextOccurrence(rule).toISOString()).toBe(
      "2026-06-09T01:00:00.000Z",
    );
  });

  it("计算每月周期任务时保留目标日并处理短月", () => {
    const rule: RecurrenceRuleInput = {
      frequency: "monthly",
      interval: 1,
      nextRunAt: new Date("2026-01-31T01:00:00.000Z"),
    };

    expect(getNextOccurrence(rule).toISOString()).toBe(
      "2026-02-28T01:00:00.000Z",
    );
  });
});

describe("canMoveTaskToParent", () => {
  it("阻止把任务移动到自己或自己的后代任务下", () => {
    expect(canMoveTaskToParent(tasks, "task-1", "task-1")).toBe(false);
    expect(canMoveTaskToParent(tasks, "task-1", "task-1-1-1")).toBe(false);
  });

  it("允许移动到无循环风险的父任务或根层级", () => {
    expect(canMoveTaskToParent(tasks, "task-2", "task-1-1")).toBe(true);
    expect(canMoveTaskToParent(tasks, "task-1-1", null)).toBe(true);
  });
});

describe("reorderTaskWithinSiblings", () => {
  it("按同级任务上移并返回重新编号后的排序", () => {
    const result = reorderTaskWithinSiblings(tasks, "task-2", "up");

    expect(result).toEqual([
      { id: "task-2", sortOrder: 1 },
      { id: "task-1", sortOrder: 2 },
    ]);
  });

  it("位于边界时不产生排序变更", () => {
    expect(reorderTaskWithinSiblings(tasks, "task-1", "up")).toEqual([]);
    expect(reorderTaskWithinSiblings(tasks, "missing", "down")).toEqual([]);
  });
});

describe("filterTasks", () => {
  const searchableTasks = [
    {
      id: "search-1",
      title: "设计首页搜索",
      description: "支持标签和描述匹配",
      statusKey: "todo",
      sourceType: "project",
      priority: "high",
      tags: ["前端", "搜索"],
      projectId: "project-1",
    },
    {
      id: "search-2",
      title: "每周复盘",
      description: null,
      statusKey: "done",
      sourceType: "recurring",
      priority: "medium",
      tags: ["习惯"],
      projectId: "project-2",
    },
  ];

  it("按关键词匹配标题、描述和标签", () => {
    expect(filterTasks(searchableTasks, { query: "标签" }).map((task) => task.id)).toEqual([
      "search-1",
    ]);
    expect(filterTasks(searchableTasks, { query: "习惯" }).map((task) => task.id)).toEqual([
      "search-2",
    ]);
  });

  it("组合过滤状态、来源、优先级和项目", () => {
    const result = filterTasks(searchableTasks, {
      statusKey: "todo",
      sourceType: "project",
      priority: "high",
      projectId: "project-1",
    });

    expect(result.map((task) => task.id)).toEqual(["search-1"]);
  });
});

describe("filterTasksByRoot", () => {
  it("选择根任务后保留该根任务及全部层级子任务", () => {
    expect(filterTasksByRoot(tasks, "task-1").map((task) => task.id)).toEqual([
      "task-1",
      "task-1-1",
      "task-1-1-1",
    ]);
  });

  it("未选择根任务时返回全部任务", () => {
    expect(filterTasksByRoot(tasks, "")).toEqual(tasks);
  });
});

describe("filterTasksByStatusKeepingRoots", () => {
  it("筛选状态时始终保留全部根任务", () => {
    expect(
      filterTasksByStatusKeepingRoots(tasks, tasks, "done").map(
        (task) => task.id,
      ),
    ).toEqual(["task-1", "task-1-1", "task-2"]);
  });

  it("深层子任务命中时保留其父级路径", () => {
    expect(
      filterTasksByStatusKeepingRoots(tasks, tasks, "todo").map(
        (task) => task.id,
      ),
    ).toEqual(["task-1", "task-1-1", "task-1-1-1", "task-2"]);
  });

  it("未筛选状态时保持原有候选任务结果", () => {
    expect(filterTasksByStatusKeepingRoots(tasks, [tasks[1]], "")).toEqual([
      tasks[1],
    ]);
  });
});

describe("getNextSelectedTaskIdAfterDelete", () => {
  const deletionTasks = [
    { id: "p1-root", parentId: null, projectId: "project-1" },
    { id: "p1-child", parentId: "p1-root", projectId: "project-1" },
    { id: "p1-other", parentId: null, projectId: "project-1" },
    { id: "p2-root", parentId: null, projectId: "project-2" },
  ];

  it("项目页删除任务后只在当前项目内选择下一条任务", () => {
    expect(
      getNextSelectedTaskIdAfterDelete(deletionTasks, "p1-other", {
        projectId: "project-1",
      }),
    ).toBe("p1-root");
  });

  it("删除父任务后不会选择其被级联删除的子任务", () => {
    expect(
      getNextSelectedTaskIdAfterDelete(deletionTasks, "p1-root", {
        projectId: "project-1",
      }),
    ).toBe("p1-other");
  });

  it("当前项目没有剩余任务时不会跳到其他项目", () => {
    expect(
      getNextSelectedTaskIdAfterDelete(
        deletionTasks.filter((task) => task.id !== "p1-other"),
        "p1-root",
        { projectId: "project-1" },
      ),
    ).toBeNull();
  });
});

describe("recommendTaskTreeTemplates", () => {
  it("按项目类型、名称、描述和标签为任务树模板评分排序", () => {
    const recommendations = recommendTaskTreeTemplates(
      {
        name: "商用密码应用安全测评项目",
        description: "需要完成现场测评和报告编制",
        projectType: "安全测评",
        tags: ["测评", "报告"],
      },
      [
        {
          id: "writing",
          name: "写作任务树",
          projectType: "写作",
          matchKeywords: ["文章"],
        },
        {
          id: "assessment",
          name: "安全测评任务树",
          projectType: "安全测评",
          matchKeywords: ["测评", "报告"],
        },
      ],
    );

    expect(recommendations.map((item) => item.template.id)).toEqual(["assessment"]);
    expect(recommendations[0].score).toBe(135);
    expect(recommendations[0].reasons).toContain("项目类型匹配：安全测评");
  });
});

describe("buildTemplateTaskTree", () => {
  it("按模板节点 parentId 构建模板任务树", () => {
    const tree = buildTemplateTaskTree([
      { id: "report", title: "报告编制", parentId: null, sortOrder: 2 },
      { id: "draft", title: "撰写初稿", parentId: "report", sortOrder: 1 },
      { id: "field", title: "现场测评", parentId: null, sortOrder: 1 },
    ]);

    expect(tree.map((node) => node.id)).toEqual(["field", "report"]);
    expect(tree[1].children.map((node) => node.id)).toEqual(["draft"]);
  });
});
