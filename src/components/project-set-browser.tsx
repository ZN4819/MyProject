"use client";

import { FormEvent, useMemo, useState } from "react";
import { CalendarRange, FolderKanban, Pencil, Plus, Trash2 } from "lucide-react";
import { filterProjectsByProjectSet } from "@/lib/domain";
import type { Project, ProjectSetSummary } from "@/lib/types";
import styles from "./project-manager-app.module.css";

export type ProjectSetSelection = string | "unassigned";

type ProjectListItem = Project & {
  progress: number;
  taskCount: number;
};

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

export function ProjectSetBrowser({
  projectSets,
  projects,
  selection,
  pending,
  onSelectSet,
  onBack,
  onOpenProject,
  onCreateSet,
  onRenameSet,
  onDeleteSet,
  onCreateProject,
  onSaveMembership,
}: {
  projectSets: ProjectSetSummary[];
  projects: ProjectListItem[];
  selection: ProjectSetSelection | null;
  pending: boolean;
  onSelectSet: (selection: ProjectSetSelection) => void;
  onBack: () => void;
  onOpenProject: (projectId: string) => void;
  onCreateSet: (name: string) => Promise<void>;
  onRenameSet: (id: string, name: string) => Promise<void>;
  onDeleteSet: (id: string) => Promise<void>;
  onCreateProject: (name: string, selection: ProjectSetSelection) => Promise<void>;
  onSaveMembership: (projectSetId: string, projectIds: string[]) => Promise<void>;
}) {
  const [newSetName, setNewSetName] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [showMembership, setShowMembership] = useState(false);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());

  const selectedProjectSet = useMemo(
    () =>
      selection && selection !== "unassigned"
        ? projectSets.find((projectSet) => projectSet.id === selection) ?? null
        : null,
    [projectSets, selection],
  );
  const visibleProjects = useMemo(
    () => (selection ? filterProjectsByProjectSet(projects, selection) : []),
    [projects, selection],
  );
  const unassignedCount = useMemo(
    () => projects.filter((project) => !project.archived && !project.projectSetId).length,
    [projects],
  );

  async function submitNewSet(event: FormEvent) {
    event.preventDefault();
    if (!newSetName.trim()) return;
    await onCreateSet(newSetName.trim());
    setNewSetName("");
  }

  async function submitRenameSet(event: FormEvent) {
    event.preventDefault();
    if (!editingSetId || !editingName.trim()) return;
    await onRenameSet(editingSetId, editingName.trim());
    setEditingSetId(null);
    setEditingName("");
  }

  async function submitNewProject(event: FormEvent) {
    event.preventDefault();
    if (!selection || !newProjectName.trim()) return;
    await onCreateProject(newProjectName.trim(), selection);
    setNewProjectName("");
  }

  async function submitMembershipChanges() {
    if (!selectedProjectSet) return;
    await onSaveMembership(selectedProjectSet.id, [...memberIds]);
    setShowMembership(false);
  }

  if (selection) {
    return (
      <section className={styles.projectSetBrowser}>
        <div className={styles.projectSetListPanel}>
          <div className={styles.projectSetListHeader}>
            <div>
              <h3>{selection === "unassigned" ? "未分组项目" : selectedProjectSet?.name ?? "项目集"}</h3>
              <p>{visibleProjects.length} 个项目</p>
            </div>
            <div className={styles.projectSetHeaderActions}>
              <button
                type="button"
                className={styles.headerActionButton}
                onClick={onBack}
              >
                返回项目集列表
              </button>
              {selectedProjectSet ? (
                <>
                  <button
                    type="button"
                    className={styles.headerActionButton}
                    onClick={() => {
                      setMemberIds(
                        new Set(
                          projects
                            .filter((project) => project.projectSetId === selectedProjectSet.id)
                            .map((project) => project.id),
                        ),
                      );
                      setShowMembership(true);
                    }}
                  >
                    管理项目
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    title="重命名项目集"
                    onClick={() => {
                      setEditingSetId(selectedProjectSet.id);
                      setEditingName(selectedProjectSet.name);
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    title="删除项目集"
                    onClick={() => void onDeleteSet(selectedProjectSet.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {editingSetId && selectedProjectSet ? (
            <form className={styles.projectSetInlineForm} onSubmit={submitRenameSet}>
              <input
                value={editingName}
                onChange={(event) => setEditingName(event.target.value)}
                placeholder="输入项目集名称"
              />
              <button type="submit" disabled={pending || !editingName.trim()}>
                保存
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setEditingSetId(null);
                  setEditingName("");
                }}
              >
                取消
              </button>
            </form>
          ) : null}

          <form className={styles.projectSetInlineForm} onSubmit={submitNewProject}>
            <input
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
              placeholder="新项目名称"
            />
            <button type="submit" disabled={pending || !newProjectName.trim()}>
              <Plus size={14} />
              <span>新建项目</span>
            </button>
          </form>

          {showMembership && selectedProjectSet ? (
            <div className={styles.membershipPanel}>
              <div className={styles.formSectionTitle}>
                <strong>管理项目成员</strong>
                <span>勾选后会加入当前项目集；取消勾选会移出当前项目集。</span>
              </div>
              <div className={styles.membershipList}>
                {projects
                  .filter((project) => !project.archived)
                  .map((project) => {
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
                              if (event.target.checked) {
                                next.add(project.id);
                              } else {
                                next.delete(project.id);
                              }
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
              <div className={styles.formActions}>
                <button type="button" onClick={() => void submitMembershipChanges()} disabled={pending}>
                  保存项目归属
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setShowMembership(false)}
                >
                  取消
                </button>
              </div>
            </div>
          ) : null}

          <div className={styles.projectRail}>
            {visibleProjects.map((project) => (
              <button
                className={styles.projectButton}
                key={project.id}
                onClick={() => onOpenProject(project.id)}
                type="button"
              >
                <span>{project.name}</span>
                <strong>{project.progress}%</strong>
                <i style={{ width: `${project.progress}%` }} />
              </button>
            ))}
            {visibleProjects.length === 0 ? (
              <div className={styles.emptySelection}>
                <FolderKanban size={20} />
                <strong>当前项目集暂无项目</strong>
                <span>先在这里新建项目，或通过上方“管理项目”补充已有项目。</span>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.projectSetBrowser}>
      <div className={styles.projectSetListHeader}>
        <div>
          <h3>项目集</h3>
          <p>{projectSets.length} 个项目集</p>
        </div>
        <form className={styles.projectSetInlineForm} onSubmit={submitNewSet}>
          <input
            value={newSetName}
            onChange={(event) => setNewSetName(event.target.value)}
            placeholder="新项目集名称"
          />
          <button type="submit" disabled={pending || !newSetName.trim()}>
            <Plus size={14} />
            <span>新建项目集</span>
          </button>
        </form>
      </div>

      <div className={styles.projectSetGrid}>
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
            <div className={styles.projectSetMeta}>
              <span>{unassignedCount} 个项目</span>
              <span>独立管理</span>
            </div>
            <div className={styles.projectSetProgress}>
              <i style={{ width: unassignedCount > 0 ? "100%" : "0%" }} />
            </div>
            <span className={styles.projectSetRange}>
              <CalendarRange size={14} />
              待组织
            </span>
          </button>
        </article>

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
            {editingSetId === projectSet.id ? (
              <form className={styles.projectSetRenameForm} onSubmit={submitRenameSet}>
                <input
                  value={editingName}
                  onChange={(event) => setEditingName(event.target.value)}
                  placeholder="输入项目集名称"
                />
                <div>
                  <button type="submit" disabled={pending || !editingName.trim()}>
                    保存
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      setEditingSetId(null);
                      setEditingName("");
                    }}
                  >
                    取消
                  </button>
                </div>
              </form>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
