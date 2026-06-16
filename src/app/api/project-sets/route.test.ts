import { beforeEach, describe, expect, it, vi } from "vitest";

describe("project set routes", () => {
  beforeEach(() => {
    process.env.PROJECT_OS_DB_PATH = ":memory:";
    vi.resetModules();
  });

  it("validates project set name and creates a project set", async () => {
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

  it("renames and deletes a project set", async () => {
    const store = await import("../../../lib/store");
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
    expect(renamed.status).toBe(200);
    expect(await renamed.json()).toMatchObject({ name: "新名称" });

    const deleted = await item.DELETE(
      new Request("http://localhost/api/project-sets/id"),
      context,
    );
    expect(deleted.status).toBe(200);
  });

  it("stores start date and project set membership on project routes", async () => {
    const store = await import("../../../lib/store");
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
    expect(created.status).toBe(201);
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
