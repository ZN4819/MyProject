import { describe, expect, it, vi } from "vitest";
import {
  applyProjectSetMembershipChanges,
  buildProjectSetMembershipUpdates,
  createProjectFormDraft,
  runProjectSetOperation,
  resolveProjectSelection,
  resolveProjectSetSelection,
} from "./project-set-ui";

describe("buildProjectSetMembershipUpdates", () => {
  const projects = [
    {
      id: "project-1",
      name: "项目一",
      description: null,
      projectType: null,
      status: "active",
      startDate: null,
      dueDate: null,
      tags: [],
      sortOrder: 1,
      archived: false,
      workflowTemplateId: null,
      projectSetId: "set-a",
      progress: 20,
      taskCount: 3,
    },
    {
      id: "project-2",
      name: "项目二",
      description: null,
      projectType: null,
      status: "active",
      startDate: null,
      dueDate: null,
      tags: [],
      sortOrder: 2,
      archived: false,
      workflowTemplateId: null,
      projectSetId: null,
      progress: 40,
      taskCount: 5,
    },
    {
      id: "project-3",
      name: "项目三",
      description: null,
      projectType: null,
      status: "active",
      startDate: null,
      dueDate: null,
      tags: [],
      sortOrder: 3,
      archived: true,
      workflowTemplateId: null,
      projectSetId: "set-a",
      progress: 80,
      taskCount: 8,
    },
  ];

  it("builds only the membership changes needed for one project set", () => {
    expect(
      buildProjectSetMembershipUpdates(projects, "set-a", ["project-2"]),
    ).toEqual([
      { projectId: "project-1", projectSetId: null },
      { projectId: "project-2", projectSetId: "set-a" },
    ]);
  });

  it("returns an empty list when selection already matches current membership", () => {
    expect(
      buildProjectSetMembershipUpdates(projects, "set-a", ["project-1"]),
    ).toEqual([]);
  });
});

describe("createProjectFormDraft", () => {
  it("maps project start date and project set into editable form fields", () => {
    expect(
      createProjectFormDraft({
        id: "project-1",
        name: "项目一",
        description: "测试项目",
        projectType: "安全测评",
        status: "active",
        startDate: "2026-06-01T00:00:00.000Z",
        dueDate: "2026-06-15T00:00:00.000Z",
        tags: ["测评", "核心"],
        sortOrder: 1,
        archived: false,
        workflowTemplateId: "workflow-1",
        projectSetId: "set-a",
      }),
    ).toMatchObject({
      startDate: "2026-06-01",
      dueDate: "2026-06-15",
      projectSetId: "set-a",
      tags: "测评, 核心",
    });
  });

  it("returns empty editable fields for a null project", () => {
    expect(createProjectFormDraft(null)).toMatchObject({
      id: "",
      startDate: "",
      dueDate: "",
      projectSetId: "",
    });
  });
});

describe("resolveProjectSetSelection", () => {
  const projectSets = [
    {
      id: "set-a",
      name: "项目集A",
      sortOrder: 1,
      createdAt: "2026-06-16T00:00:00.000Z",
      updatedAt: "2026-06-16T00:00:00.000Z",
      projectCount: 1,
      progress: 20,
      status: "active" as const,
      startDate: null,
      endDate: null,
    },
  ];

  it("keeps the unassigned entry and existing project set selection", () => {
    expect(resolveProjectSetSelection("unassigned", projectSets)).toBe("unassigned");
    expect(resolveProjectSetSelection("set-a", projectSets)).toBe("set-a");
  });

  it("returns null when the selected project set no longer exists", () => {
    expect(resolveProjectSetSelection("set-missing", projectSets)).toBeNull();
  });
});

describe("resolveProjectSelection", () => {
  const projects = [
    {
      id: "project-1",
      name: "项目一",
      description: null,
      projectType: null,
      status: "active",
      startDate: null,
      dueDate: null,
      tags: [],
      sortOrder: 1,
      archived: false,
      workflowTemplateId: null,
      projectSetId: "set-a",
      progress: 20,
      taskCount: 3,
    },
    {
      id: "project-2",
      name: "项目二",
      description: null,
      projectType: null,
      status: "active",
      startDate: null,
      dueDate: null,
      tags: [],
      sortOrder: 2,
      archived: false,
      workflowTemplateId: null,
      projectSetId: null,
      progress: 40,
      taskCount: 5,
    },
  ];

  it("keeps the current project only when it is still visible in the selected project set", () => {
    expect(
      resolveProjectSelection({
        currentProjectId: "project-1",
        currentProjectSetId: "set-a",
        initialView: "projects",
        projects,
      }),
    ).toBe("project-1");

    expect(
      resolveProjectSelection({
        currentProjectId: "project-1",
        currentProjectSetId: "unassigned",
        initialView: "projects",
        projects,
      }),
    ).toBeNull();
  });

  it("clears the project detail when no project set is selected in the project view", () => {
    expect(
      resolveProjectSelection({
        currentProjectId: "project-1",
        currentProjectSetId: null,
        initialView: "projects",
        projects,
      }),
    ).toBeNull();
  });
});

describe("applyProjectSetMembershipChanges", () => {
  it("refreshes once after all membership updates succeed", async () => {
    const requestUpdate = vi.fn().mockResolvedValue({ ok: true });
    const refresh = vi.fn().mockResolvedValue(undefined);

    await applyProjectSetMembershipChanges({
      changes: [
        { projectId: "project-1", projectSetId: "set-a" },
        { projectId: "project-2", projectSetId: null },
      ],
      requestUpdate,
      refresh,
    });

    expect(requestUpdate).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("still refreshes once before surfacing a partial failure", async () => {
    const requestUpdate = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, error: "第二个项目更新失败" });
    const refresh = vi.fn().mockResolvedValue(undefined);

    await expect(
      applyProjectSetMembershipChanges({
        changes: [
          { projectId: "project-1", projectSetId: "set-a" },
          { projectId: "project-2", projectSetId: null },
        ],
        requestUpdate,
        refresh,
      }),
    ).rejects.toThrow("第二个项目更新失败");

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("runProjectSetOperation", () => {
  it("marks pending during the operation and clears it after success", async () => {
    const states: boolean[] = [];

    const result = await runProjectSetOperation({
      setPending: (value) => states.push(value),
      operation: async () => "done",
    });

    expect(result).toBe("done");
    expect(states).toEqual([true, false]);
  });

  it("clears pending after a failed operation too", async () => {
    const states: boolean[] = [];

    await expect(
      runProjectSetOperation({
        setPending: (value) => states.push(value),
        operation: async () => {
          throw new Error("保存失败");
        },
      }),
    ).rejects.toThrow("保存失败");

    expect(states).toEqual([true, false]);
  });
});
