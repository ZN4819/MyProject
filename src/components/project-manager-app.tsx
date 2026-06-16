"use client";

import {
  ArrowLeft,
  Archive,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  Download,
  FolderKanban,
  Gauge,
  HardDrive,
  Layers3,
  ListTree,
  PanelRight,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  Repeat2,
  Save,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  X,
  Workflow,
} from "lucide-react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  applyNodeChanges,
  Background,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  SelectionMode,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type Viewport,
} from "@xyflow/react";
import {
  calculateRootTaskProgress,
  filterProjectsByProjectSet,
  filterTasks,
  filterTasksByRoot,
  filterTasksByStatusKeepingRoots,
  formatAssigneeNames,
  formatTaskDetailSubtitle,
  getNextOccurrenceFromStart,
  getNextSelectedTaskIdAfterDelete,
} from "@/lib/domain";
import {
  applyProjectSetMembershipChanges,
  buildProjectSetMembershipUpdates,
  createProjectFormDraft,
  resolveProjectSelection,
  resolveProjectSetSelection,
  runProjectSetOperation,
} from "@/lib/project-set-ui";
import type {
  DashboardData,
  Project,
  RootTaskTemplate,
  RootTaskTemplateDependency,
  RootTaskTemplateNode,
  Task,
  WorkflowState,
} from "@/lib/types";
import { ProjectSetBrowser, type ProjectSetSelection } from "./project-set-browser";
import styles from "./project-manager-app.module.css";

type RootTaskTemplateNodeDraft = {
  localId: string;
  parentId: string | null;
  title: string;
  defaultStatusKey: string;
  priority: Task["priority"];
  positionX: number;
  positionY: number;
  tags: string;
};

type RootTaskTemplateDependencyDraft = {
  localId: string;
  fromNodeId: string;
  toNodeId: string;
  type: RootTaskTemplateDependency["type"];
  label: string;
  sortOrder: number;
};

type RootTaskTemplateDraft = {
  name: string;
  projectType: string;
  rootTitle: string;
  matchKeywords: string;
  nodes: RootTaskTemplateNodeDraft[];
  dependencies: RootTaskTemplateDependencyDraft[];
};

const navItems = [
  { id: "overview", href: "/", label: "主页概览", icon: Gauge },
  { id: "projects", href: "/projects", label: "项目管理", icon: FolderKanban },
  { id: "tasks", href: "/tasks", label: "任务中心", icon: ListTree },
  { id: "recurring", href: "/recurring", label: "周期任务", icon: RefreshCcw },
  { id: "temporary", href: "/temporary", label: "临时任务", icon: Clock3 },
  { id: "workflows", href: "/workflows", label: "工作流模板", icon: Workflow },
  { id: "settings", href: "/settings", label: "设置", icon: Settings2 },
] as const;

export type ProjectManagerView = (typeof navItems)[number]["id"];

const viewTitles: Record<ProjectManagerView, string> = {
  overview: "今日工作台",
  projects: "项目管理",
  tasks: "任务中心",
  recurring: "周期任务",
  temporary: "临时任务",
  workflows: "工作流模板",
  settings: "设置",
};

const statusLabels: Record<string, string> = {
  todo: "待办",
  in_progress: "进行中",
  blocked: "阻塞",
  done: "完成",
};

export function ProjectManagerApp({
  initialData,
  initialView = "overview",
}: {
  initialData: DashboardData;
  initialView?: ProjectManagerView;
}) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [selectedProjectSetId, setSelectedProjectSetId] =
    useState<ProjectSetSelection | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialView === "projects" ? null : initialData.projects[0]?.id ?? null,
  );
  const selectedProjectSetIdRef = useRef<ProjectSetSelection | null>(null);
  const selectedProjectIdRef = useRef<string | null>(
    initialView === "projects" ? null : initialData.projects[0]?.id ?? null,
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    ["projects", "temporary", "recurring"].includes(initialView)
      ? null
      : initialData.tasks[0]?.id ?? null,
  );
  const [quickTaskTitle, setQuickTaskTitle] = useState("");
  const [projectName, setProjectName] = useState("");
  const [rootTaskTitle, setRootTaskTitle] = useState("");
  const [rootTaskCreateTemplateId, setRootTaskCreateTemplateId] = useState("auto");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState("");
  const [rootTaskFilter, setRootTaskFilter] = useState("");
  const [taskPriorityFilter, setTaskPriorityFilter] = useState("");
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(
    () => new Set(initialData.tasks.filter((task) => task.parentId === null).map((task) => task.id)),
  );
  const [projectDraft, setProjectDraft] = useState({
    id: "",
    name: "",
    description: "",
    status: "active",
    startDate: "",
    dueDate: "",
    tags: "",
    projectType: "",
    workflowTemplateId: "",
    projectSetId: "",
  });
  const [taskDraft, setTaskDraft] = useState({
    id: "",
    title: "",
    description: "",
    priority: "medium" as Task["priority"],
    dueDate: "",
    startTime: "",
    tags: "",
    projectId: "",
    personnelIds: [] as string[],
  });
  const [recurrenceDraft, setRecurrenceDraft] = useState(() => createEmptyRecurrenceDraft());
  const [workflowDraft, setWorkflowDraft] = useState({
    name: "",
    description: "",
    states: "todo:待办:#64748b:default\nin_progress:进行中:#2563eb\nblocked:阻塞:#d97706\ndone:完成:#16a34a:done",
  });
  const [selectedRootTaskTemplateId, setSelectedRootTaskTemplateId] = useState<string | null>(null);
  const [rootTaskTemplateView, setRootTaskTemplateView] = useState<"list" | "flow">("list");
  const [rootTaskTemplateViewport, setRootTaskTemplateViewport] =
    useState<Viewport>(rootTemplateDefaultViewport);
  const [rootTemplatePositionSaveState, setRootTemplatePositionSaveState] =
    useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const [rootTaskTemplateDraft, setRootTaskTemplateDraft] =
    useState<RootTaskTemplateDraft>(() => createEmptyRootTaskTemplateDraft());
  const [rootTemplateSelectedNodeIds, setRootTemplateSelectedNodeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const rootTaskTemplateDraftRef = useRef(rootTaskTemplateDraft);
  const rootTemplateAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootTemplateAutosaveSequenceRef = useRef(0);
  const [settingsImportText, setSettingsImportText] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsView, setSettingsView] = useState<
    "home" | "personnel" | "archive" | "data"
  >("home");
  const [personnelDraft, setPersonnelDraft] = useState({
    name: "",
    certificateNumber: "",
  });
  const [editingPersonnelId, setEditingPersonnelId] = useState<string | null>(null);
  const [isProjectSetPending, setIsProjectSetPending] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    rootTaskTemplateDraftRef.current = rootTaskTemplateDraft;
  }, [rootTaskTemplateDraft]);

  useEffect(() => {
    selectedProjectSetIdRef.current = selectedProjectSetId;
  }, [selectedProjectSetId]);

  useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId;
  }, [selectedProjectId]);

  useEffect(
    () => () => {
      if (rootTemplateAutosaveTimerRef.current) {
        clearTimeout(rootTemplateAutosaveTimerRef.current);
      }
    },
    [],
  );

  const refresh = useCallback(async () => {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    const payload = (await response.json()) as DashboardData;
    const nextProjectSetId = resolveProjectSetSelection(
      selectedProjectSetIdRef.current,
      payload.projectSets,
    );
    const nextProjectId = resolveProjectSelection({
      currentProjectId: selectedProjectIdRef.current,
      currentProjectSetId: nextProjectSetId,
      initialView,
      projects: payload.projects,
    });
    setData(payload);
    setSelectedProjectSetId(nextProjectSetId);
    setSelectedProjectId(nextProjectId);
    setSelectedTaskId((current) => {
      if (current && payload.tasks.some((task) => task.id === current)) return current;
      return ["projects", "temporary", "recurring"].includes(initialView)
        ? null
        : payload.tasks[0]?.id ?? null;
    });
  }, [initialView]);

  async function postJson<T = unknown>(url: string, body: unknown, method = "POST") {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "请求失败");
    }
    const payload = (await response.json().catch(() => null)) as T;
    await refresh();
    return payload;
  }

  async function patchRootTaskTemplate(templateId: string, draft: RootTaskTemplateDraft) {
    const response = await fetch(`/api/root-task-templates/${templateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createRootTaskTemplatePayload(draft)),
    });
    if (!response.ok) return null;
    return (await response.json()) as RootTaskTemplate;
  }

  function handleQuickTask(event: FormEvent) {
    event.preventDefault();
    if (!quickTaskTitle.trim()) return;

    startTransition(async () => {
      await postJson("/api/tasks", {
        title: quickTaskTitle,
        sourceType: "temporary",
        dueDate: new Date().toISOString(),
      });
      setQuickTaskTitle("");
    });
  }

  function handleProject(event: FormEvent) {
    event.preventDefault();
    if (!projectName.trim()) return;

    startTransition(async () => {
      await postJson("/api/projects", {
        name: projectName,
        description: "新项目",
      });
      setProjectName("");
    });
  }

  async function createProjectSet(name: string) {
    await runProjectSetOperation({
      setPending: setIsProjectSetPending,
      operation: () => postJson("/api/project-sets", { name }),
    });
  }

  async function renameProjectSet(id: string, name: string) {
    await runProjectSetOperation({
      setPending: setIsProjectSetPending,
      operation: () => postJson(`/api/project-sets/${id}`, { name }, "PATCH"),
    });
  }

  async function deleteProjectSet(id: string) {
    const projectSet = data.projectSets.find((item) => item.id === id);
    if (!projectSet) return;
    if (
      !window.confirm(
        `确认删除项目集“${projectSet.name}”吗？\n\n所属项目会移入未分组项目，项目及任务不会被删除。`,
      )
    ) {
      return;
    }
    await runProjectSetOperation({
      setPending: setIsProjectSetPending,
      operation: () => postJson(`/api/project-sets/${id}`, {}, "DELETE"),
    });
    setSelectedProjectSetId(null);
    setSelectedProjectId(null);
  }

  async function createProjectInSet(name: string, selection: ProjectSetSelection) {
    await runProjectSetOperation({
      setPending: setIsProjectSetPending,
      operation: () =>
        postJson("/api/projects", {
          name,
          description: "???",
          projectSetId: selection === "unassigned" ? null : selection,
        }),
    });
  }

  async function saveProjectSetMembership(projectSetId: string, selectedIds: string[]) {
    const changes = buildProjectSetMembershipUpdates(activeProjects, projectSetId, selectedIds);
    await runProjectSetOperation({
      setPending: setIsProjectSetPending,
      operation: () =>
        applyProjectSetMembershipChanges({
          changes,
          requestUpdate: async (change) => {
            const response = await fetch(`/api/projects/${change.projectId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ projectSetId: change.projectSetId }),
            });
            if (response.ok) {
              return { ok: true };
            }
            const payload = (await response.json().catch(() => null)) as { error?: string } | null;
            return { ok: false, error: payload?.error };
          },
          refresh,
        }),
    });
  }

  function handleProjectUpdate(event: FormEvent) {
    event.preventDefault();
    if (!selectedProject || !activeProjectDraft.name.trim()) return;

    startTransition(async () => {
      await postJson(
        `/api/projects/${selectedProject.id}`,
        {
          name: activeProjectDraft.name,
          description: activeProjectDraft.description,
          projectType: activeProjectDraft.projectType,
          status: activeProjectDraft.status,
          startDate: fromDateInput(activeProjectDraft.startDate),
          dueDate: fromDateInput(activeProjectDraft.dueDate),
          tags: splitTagInput(activeProjectDraft.tags),
          workflowTemplateId: activeProjectDraft.workflowTemplateId || null,
          projectSetId: activeProjectDraft.projectSetId || null,
        },
        "PATCH",
      );
      setSelectedProjectSetId(activeProjectDraft.projectSetId || "unassigned");
    });
  }

  function toggleProjectArchive(project: Project) {
    startTransition(async () => {
      await postJson(`/api/projects/${project.id}`, { archived: !project.archived }, "PATCH");
      if (!project.archived) {
        clearProjectSelection();
      }
    });
  }

  function deleteSelectedProject() {
    if (!selectedProject) return;
    if (
      !window.confirm(
        `危险操作：确认永久删除项目“${selectedProject.name}”吗？\n\n删除后无法恢复，项目下的任务也会一并删除。`,
      )
    ) {
      return;
    }

    startTransition(async () => {
      const response = await fetch(`/api/projects/${selectedProject.id}`, { method: "DELETE" });
      if (!response.ok) return;
      clearProjectSelection();
      await refresh();
    });
  }

  function selectProject(projectId: string) {
    setSelectedProjectId(projectId);
    setSelectedTaskId(null);
    setRootTaskFilter("");
    setExpandedTaskIds(
      new Set(
        data.tasks
          .filter((task) => task.projectId === projectId && task.parentId === null)
          .map((task) => task.id),
      ),
    );
  }

  function clearProjectSelection() {
    setSelectedProjectId(null);
    setSelectedTaskId(null);
    setRootTaskFilter("");
    setExpandedTaskIds(new Set());
  }

  function handleRootTask(event: FormEvent) {
    event.preventDefault();
    if (!selectedProjectId) return;
    const selectedTemplate =
      rootTaskCreateTemplateId !== "auto" && rootTaskCreateTemplateId !== "none"
        ? data.rootTaskTemplates.find((template) => template.id === rootTaskCreateTemplateId)
        : null;
    const title = rootTaskTitle.trim() || selectedTemplate?.rootTitle.trim() || "";
    if (!title) return;

    startTransition(async () => {
      await postJson("/api/tasks", {
        title,
        projectId: selectedProjectId,
        sourceType: "project",
        autoTemplate: rootTaskCreateTemplateId !== "none",
        rootTaskTemplateId: selectedTemplate?.id ?? null,
      });
      setRootTaskTitle("");
      setRootTaskCreateTemplateId("auto");
    });
  }

  function handleSubtask(event: FormEvent) {
    event.preventDefault();
    if (!subtaskTitle.trim() || !selectedTaskId) return;
    const parentTask = data?.tasks.find((task) => task.id === selectedTaskId);

    startTransition(async () => {
      await postJson("/api/tasks", {
        title: subtaskTitle,
        parentId: selectedTaskId,
        projectId: parentTask?.projectId ?? selectedProjectId,
        sourceType: parentTask?.projectId ? "project" : "temporary",
      });
      setSubtaskTitle("");
    });
  }

  function handleTaskUpdate(event: FormEvent) {
    event.preventDefault();
    if (!selectedTask || !activeTaskDraft.title.trim()) return;

    startTransition(async () => {
      const task = await postJson<Task>(
        `/api/tasks/${selectedTask.id}`,
        {
          title: activeTaskDraft.title,
          description: activeTaskDraft.description,
          priority: activeTaskDraft.priority,
          dueDate: fromDateInput(activeTaskDraft.dueDate),
          startTime: fromDateTimeInput(activeTaskDraft.startTime),
          tags: splitTagInput(activeTaskDraft.tags),
          personnelIds: activeTaskDraft.personnelIds,
        },
        "PATCH",
      );
      setTaskDraft(createTaskDraft(task));
    });
  }

  function updateTaskStatus(taskId: string, statusKey: string) {
    startTransition(async () => {
      const task = await postJson<Task>(`/api/tasks/${taskId}`, { statusKey }, "PATCH");
      setTaskDraft(createTaskDraft(task));
    });
  }

  function deleteSelectedTask() {
    if (!selectedTask) return;
    if (!window.confirm(`确认删除任务“${selectedTask.title}”及其子任务吗？`)) return;
    const nextSelectedTaskId = getNextSelectedTaskIdAfterDelete(
      data.tasks,
      selectedTask.id,
      initialView === "projects" ? { projectId: selectedProjectId } : undefined,
    );

    startTransition(async () => {
      await fetch(`/api/tasks/${selectedTask.id}`, { method: "DELETE" });
      setSelectedTaskId(nextSelectedTaskId);
      await refresh();
    });
  }

  function organizeTemporaryTask(task: Task) {
    if (!selectedProjectId) return;

    startTransition(async () => {
      await postJson(
        `/api/tasks/${task.id}/assign-project`,
        {
          projectId: selectedProjectId,
        },
        "PATCH",
      );
      setSelectedTaskId(task.id);
    });
  }

  function handlePersonnelSubmit(event: FormEvent) {
    event.preventDefault();
    if (!personnelDraft.name.trim() || !personnelDraft.certificateNumber.trim()) return;

    startTransition(async () => {
      try {
        await postJson(
          editingPersonnelId ? `/api/personnel/${editingPersonnelId}` : "/api/personnel",
          personnelDraft,
          editingPersonnelId ? "PATCH" : "POST",
        );
        setPersonnelDraft({ name: "", certificateNumber: "" });
        setEditingPersonnelId(null);
        setSettingsMessage(editingPersonnelId ? "人员信息已更新。" : "人员已添加。");
      } catch (error) {
        setSettingsMessage(error instanceof Error ? error.message : "人员保存失败");
      }
    });
  }

  function startPersonnelEdit(personnelId: string) {
    const person = data.personnel.find((item) => item.id === personnelId);
    if (!person || person.deletedAt) return;
    setEditingPersonnelId(person.id);
    setPersonnelDraft({ name: person.name, certificateNumber: person.certificateNumber });
    setSettingsMessage("");
  }

  function cancelPersonnelEdit() {
    setEditingPersonnelId(null);
    setPersonnelDraft({ name: "", certificateNumber: "" });
  }

  function removePersonnel(personnelId: string) {
    if (
      !window.confirm(
        "删除后该人员将不再出现在新任务分配列表中，历史任务仍会保留人员记录。确认删除吗？",
      )
    ) {
      return;
    }

    startTransition(async () => {
      try {
        await postJson(`/api/personnel/${personnelId}`, {}, "DELETE");
        if (editingPersonnelId === personnelId) cancelPersonnelEdit();
        setSettingsMessage("人员已删除，历史任务分配已保留。");
      } catch (error) {
        setSettingsMessage(error instanceof Error ? error.message : "人员删除失败");
      }
    });
  }

  function toggleTaskPersonnel(personnelId: string) {
    const personnelIds = new Set(activeTaskDraft.personnelIds);
    if (personnelIds.has(personnelId)) {
      personnelIds.delete(personnelId);
    } else {
      personnelIds.add(personnelId);
    }
    setTaskDraft({ ...activeTaskDraft, personnelIds: [...personnelIds] });
  }

  function handleRecurrenceCreate(event: FormEvent) {
    event.preventDefault();
    if (!recurrenceDraft.taskTitle.trim()) return;

    startTransition(async () => {
      await postJson("/api/recurrences", {
        taskTitle: recurrenceDraft.taskTitle,
        frequency: recurrenceDraft.frequency,
        interval: 1,
        startAt: fromDateInput(recurrenceDraft.startAt),
        nextRunAt: recurrenceNextRunAt(recurrenceDraft),
        endsAt: fromDateInput(recurrenceDraft.endsAt),
      });
      setRecurrenceDraft(createEmptyRecurrenceDraft());
    });
  }

  function handleWorkflowCreate(event: FormEvent) {
    event.preventDefault();
    if (!workflowDraft.name.trim()) return;
    const states = parseWorkflowStateInput(workflowDraft.states);
    if (states.length < 2) return;

    startTransition(async () => {
      await postJson("/api/workflows", {
        name: workflowDraft.name,
        description: workflowDraft.description,
        states,
      });
      setWorkflowDraft((draft) => ({ ...draft, name: "", description: "" }));
    });
  }

  function handleRootTaskTemplateCreate(event: FormEvent) {
    event.preventDefault();
    if (!rootTaskTemplateDraft.name.trim() || !rootTaskTemplateDraft.rootTitle.trim()) return;
    const nodes = createRootTaskTemplatePayload(rootTaskTemplateDraft).nodes;
    if (nodes.length === 0) return;

    startTransition(async () => {
      const response = await fetch("/api/root-task-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createRootTaskTemplatePayload(rootTaskTemplateDraft)),
      });
      if (!response.ok) return;
      const template = (await response.json()) as RootTaskTemplate;
      await refresh();
      setSelectedRootTaskTemplateId(template.id);
      setRootTaskTemplateDraft(createRootTaskTemplateDraft(template));
      setRootTemplateSelectedNodeIds(new Set());
    });
  }

  function handleRootTaskTemplateUpdate(event: FormEvent) {
    event.preventDefault();
    if (!selectedRootTaskTemplateId) return;
    if (!rootTaskTemplateDraft.name.trim() || !rootTaskTemplateDraft.rootTitle.trim()) return;
    if (createRootTaskTemplatePayload(rootTaskTemplateDraft).nodes.length === 0) return;

    startTransition(async () => {
      const template = await patchRootTaskTemplate(
        selectedRootTaskTemplateId,
        rootTaskTemplateDraft,
      );
      if (!template) return;
      await refresh();
      setSelectedRootTaskTemplateId(template.id);
      setRootTaskTemplateDraft(createRootTaskTemplateDraft(template));
      setRootTemplateSelectedNodeIds(new Set());
      setRootTemplatePositionSaveState("saved");
    });
  }

  function selectRootTaskTemplate(template: RootTaskTemplate) {
    clearRootTemplatePositionAutosave();
    setSelectedRootTaskTemplateId(template.id);
    setRootTaskTemplateDraft(createRootTaskTemplateDraft(template));
    setRootTemplateSelectedNodeIds(new Set());
    setRootTaskTemplateViewport(rootTemplateDefaultViewport);
    setRootTemplatePositionSaveState("idle");
  }

  function startNewRootTaskTemplate() {
    clearRootTemplatePositionAutosave();
    setSelectedRootTaskTemplateId(null);
    setRootTaskTemplateDraft(createEmptyRootTaskTemplateDraft());
    setRootTemplateSelectedNodeIds(new Set());
    setRootTaskTemplateViewport(rootTemplateDefaultViewport);
    setRootTemplatePositionSaveState("idle");
  }

  function addRootTaskTemplateNode(parentId: string | null = null) {
    setRootTaskTemplateDraft((draft) => {
      const parent = parentId ? draft.nodes.find((node) => node.localId === parentId) : null;
      const index = draft.nodes.length;
      return {
        ...draft,
        nodes: [
          ...draft.nodes,
          createRootTaskTemplateNodeDraft(parentId, {
            positionX: parent ? parent.positionX + 260 : 120 + index * 220,
            positionY: parent ? parent.positionY + 120 : 90 + (index % 3) * 120,
          }),
        ],
      };
    });
  }

  function updateRootTaskTemplateNode(
    localId: string,
    patch: Partial<Omit<RootTaskTemplateNodeDraft, "localId">>,
  ) {
    setRootTaskTemplateDraft((draft) => ({
      ...draft,
      nodes: draft.nodes.map((node) => (node.localId === localId ? { ...node, ...patch } : node)),
    }));
  }

  function deleteRootTaskTemplateNode(localId: string) {
    const deletedIds = collectDraftNodeDescendants(rootTaskTemplateDraftRef.current.nodes, localId);
    setRootTaskTemplateDraft((draft) => {
      return {
        ...draft,
        nodes: draft.nodes.filter((node) => !deletedIds.has(node.localId)),
        dependencies: draft.dependencies.filter(
          (dependency) =>
            !deletedIds.has(dependency.fromNodeId) && !deletedIds.has(dependency.toNodeId),
        ),
      };
    });
    setRootTemplateSelectedNodeIds((current) => {
      if (!current.size) return current;
      const next = new Set([...current].filter((id) => !deletedIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }

  function handleRootTemplateFlowNodesChange(changes: NodeChange[]) {
    setRootTaskTemplateDraft((draft) => applyRootTemplateNodeChanges(draft, changes));
    const selectionChanges = changes.filter(isSelectionNodeChange);
    if (selectionChanges.length) {
      setRootTemplateSelectedNodeIds((current) => {
        const next = new Set(current);
        for (const change of selectionChanges) {
          if (change.selected) {
            next.add(change.id);
          } else {
            next.delete(change.id);
          }
        }
        return next;
      });
    }
    if (changes.some(isPositionNodeChange)) {
      scheduleRootTemplatePositionAutosave();
    }
  }

  function scheduleRootTemplatePositionAutosave() {
    if (!selectedRootTaskTemplateId) return;
    if (rootTaskTemplateView !== "flow") return;
    if (!rootTaskTemplateDraftRef.current.name.trim()) return;
    if (!rootTaskTemplateDraftRef.current.rootTitle.trim()) return;

    if (rootTemplateAutosaveTimerRef.current) {
      clearTimeout(rootTemplateAutosaveTimerRef.current);
    }

    setRootTemplatePositionSaveState("pending");
    const sequence = rootTemplateAutosaveSequenceRef.current + 1;
    rootTemplateAutosaveSequenceRef.current = sequence;

    rootTemplateAutosaveTimerRef.current = setTimeout(async () => {
      const templateId = selectedRootTaskTemplateId;
      const draft = rootTaskTemplateDraftRef.current;
      if (!templateId || createRootTaskTemplatePayload(draft).nodes.length === 0) return;

      setRootTemplatePositionSaveState("saving");
      const template = await patchRootTaskTemplate(templateId, draft);
      if (rootTemplateAutosaveSequenceRef.current !== sequence) return;
      if (!template) {
        setRootTemplatePositionSaveState("error");
        return;
      }

      setData((current) => ({
        ...current,
        rootTaskTemplates: current.rootTaskTemplates.map((item) =>
          item.id === template.id ? template : item,
        ),
      }));
      setRootTemplatePositionSaveState("saved");
    }, 650);
  }

  function clearRootTemplatePositionAutosave() {
    if (rootTemplateAutosaveTimerRef.current) {
      clearTimeout(rootTemplateAutosaveTimerRef.current);
      rootTemplateAutosaveTimerRef.current = null;
    }
    rootTemplateAutosaveSequenceRef.current += 1;
  }

  function handleRootTemplateFlowConnect(connection: Connection) {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    setRootTaskTemplateDraft((draft) => {
      const alreadyExists = draft.dependencies.some(
        (dependency) =>
          dependency.fromNodeId === connection.source &&
          dependency.toNodeId === connection.target,
      );
      if (alreadyExists) return draft;

      return {
        ...draft,
        dependencies: [
          ...draft.dependencies,
          {
            localId: createDraftEdgeId(),
            fromNodeId: connection.source ?? "",
            toNodeId: connection.target ?? "",
            type: "sequence",
            label: "",
            sortOrder: draft.dependencies.length + 1,
          },
        ],
      };
    });
  }

  function handleRootTemplateFlowEdgeClick(edgeId: string) {
    setRootTaskTemplateDraft((draft) => ({
      ...draft,
      dependencies: draft.dependencies.map((dependency) =>
        dependency.localId === edgeId
          ? {
              ...dependency,
              type: dependency.type === "strong_binding" ? "sequence" : "strong_binding",
            }
          : dependency,
      ),
    }));
  }

  function deleteRootTemplateDependency(edgeId: string) {
    setRootTaskTemplateDraft((draft) => ({
      ...draft,
      dependencies: draft.dependencies.filter((dependency) => dependency.localId !== edgeId),
    }));
  }

  function autoLayoutRootTemplateDraft() {
    setRootTaskTemplateDraft((draft) => layoutRootTaskTemplateDraft(draft));
    scheduleRootTemplatePositionAutosave();
  }

  function deleteSelectedRootTaskTemplate() {
    if (!selectedRootTaskTemplateId) return;
    if (!window.confirm("确认删除这个根任务模板吗？已生成的真实任务不会被删除。")) return;

    startTransition(async () => {
      const response = await fetch(`/api/root-task-templates/${selectedRootTaskTemplateId}`, {
        method: "DELETE",
      });
      if (!response.ok) return;
      await refresh();
      startNewRootTaskTemplate();
    });
  }

  async function handleExportData() {
    const response = await fetch("/api/settings/export", { cache: "no-store" });
    const payload = await response.text();
    const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `project-os-export-${todayDateInput()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setSettingsMessage("导出文件已生成。");
  }

  function handleImportData(event: FormEvent) {
    event.preventDefault();
    if (!settingsImportText.trim()) return;

    startTransition(async () => {
      try {
        const payload = JSON.parse(settingsImportText) as unknown;
        await postJson("/api/settings/import", payload);
        setSettingsMessage("导入完成，数据已合并。");
        setSettingsImportText("");
      } catch (error) {
        setSettingsMessage(error instanceof Error ? error.message : "导入失败");
      }
    });
  }

  function handleCreateBackup() {
    startTransition(async () => {
      try {
        const response = await fetch("/api/settings/backup", { method: "POST" });
        const payload = (await response.json()) as { backupPath?: string; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "备份失败");
        await refresh();
        setSettingsMessage(`备份已创建：${payload.backupPath}`);
      } catch (error) {
        setSettingsMessage(error instanceof Error ? error.message : "备份失败");
      }
    });
  }

  function handleRecurrenceUpdate(event: FormEvent) {
    event.preventDefault();
    if (!selectedRuleId) return;

    startTransition(async () => {
      await postJson(
        `/api/recurrences/${selectedRuleId}`,
        {
          taskTitle: recurrenceDraft.taskTitle,
          frequency: recurrenceDraft.frequency,
          interval: 1,
          startAt: fromDateInput(recurrenceDraft.startAt),
          nextRunAt: recurrenceNextRunAt(recurrenceDraft),
          endsAt: fromDateInput(recurrenceDraft.endsAt),
        },
        "PATCH",
      );
    });
  }

  function editRecurrence(ruleId: string) {
    const rule = data.recurringRules.find((item) => item.id === ruleId);
    if (!rule) return;
    setSelectedRuleId(rule.id);
    setSelectedTaskId(rule.taskId);
    setRecurrenceDraft({
      taskTitle: rule.taskTitle,
      frequency: rule.frequency,
      startAt: toDateInput(rule.startAt),
      endsAt: toDateInput(rule.endsAt),
    });
  }

  function toggleRecurrencePaused(ruleId: string) {
    const rule = data.recurringRules.find((item) => item.id === ruleId);
    if (!rule) return;

    startTransition(async () => {
      await postJson(`/api/recurrences/${rule.id}`, { paused: !rule.paused }, "PATCH");
    });
  }

  function toggleTaskExpanded(taskId: string) {
    setExpandedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  function generateRecurringTask(ruleId: string) {
    startTransition(async () => {
      await postJson(`/api/recurrences/${ruleId}/generate`, {});
    });
  }

  const selectedProject = data.projects.find((project) => project.id === selectedProjectId) ?? null;
  const selectedTask = data.tasks.find((task) => task.id === selectedTaskId) ?? null;
  const selectedTaskProject = selectedTask?.projectId
    ? data.projects.find((project) => project.id === selectedTask.projectId) ?? null
    : null;
  const activeProjects = useMemo(
    () => data.projects.filter((project) => !project.archived),
    [data.projects],
  );
  const selectedProjectSetProjects = useMemo(
    () =>
      selectedProjectSetId
        ? filterProjectsByProjectSet(activeProjects, selectedProjectSetId)
        : activeProjects,
    [activeProjects, selectedProjectSetId],
  );
  const archivedProjects = useMemo(
    () => data.projects.filter((project) => project.archived),
    [data.projects],
  );
  const activeProjectDraft =
    selectedProject && projectDraft.id === selectedProject.id
      ? projectDraft
      : createProjectDraft(selectedProject);
  const activeTaskDraft =
    selectedTask && taskDraft.id === selectedTask.id ? taskDraft : createTaskDraft(selectedTask);
  const defaultWorkflow = data.workflows.find((workflow) => workflow.isDefault) ?? data.workflows[0] ?? null;
  const selectedProjectWorkflow =
    data.workflows.find((workflow) => workflow.id === selectedProject?.workflowTemplateId) ??
    defaultWorkflow;
  const projectRootTemplateRecommendations = useMemo(
    () =>
      selectedProject
        ? recommendRootTaskTemplates(selectedProject, data.rootTaskTemplates).slice(0, 3)
        : [],
    [data.rootTaskTemplates, selectedProject],
  );
  const selectedTaskDependencies = useMemo(() => {
    if (!selectedTask) return { blockers: [] as Task[], unlocks: [] as Task[] };
    const blockers = data.taskDependencies
      .filter((dependency) => dependency.toTaskId === selectedTask.id)
      .map((dependency) => data.tasks.find((task) => task.id === dependency.fromTaskId))
      .filter((task): task is Task => Boolean(task));
    const unlocks = data.taskDependencies
      .filter((dependency) => dependency.fromTaskId === selectedTask.id)
      .map((dependency) => data.tasks.find((task) => task.id === dependency.toTaskId))
      .filter((task): task is Task => Boolean(task));
    return { blockers, unlocks };
  }, [data.taskDependencies, data.tasks, selectedTask]);
  const visibleTemporaryTasks = data.temporaryTasks;
  const projectTasks = useMemo(() => {
    if (!selectedProjectId) return [];
    return data.tasks.filter((task) => task.projectId === selectedProjectId);
  }, [data, selectedProjectId]);
  const projectRootTasks = useMemo(
    () => projectTasks.filter((task) => task.parentId === null),
    [projectTasks],
  );
  const filteredProjectTasks = useMemo(() => {
    const rootScopedTasks = filterTasksByRoot(projectTasks, rootTaskFilter);
    const candidateTasks = filterTasks(rootScopedTasks, {
        query: searchQuery,
        priority: taskPriorityFilter,
      });

    return filterTasksByStatusKeepingRoots(
      rootScopedTasks,
      candidateTasks,
      taskStatusFilter,
    );
  }, [projectTasks, rootTaskFilter, searchQuery, taskPriorityFilter, taskStatusFilter]);
  const projectTaskTree = useMemo(
    () => buildClientTaskTree(filteredProjectTasks),
    [filteredProjectTasks],
  );
  const selectedRootTaskTemplate = useMemo(
    () =>
      data.rootTaskTemplates.find((template) => template.id === selectedRootTaskTemplateId) ?? null,
    [data.rootTaskTemplates, selectedRootTaskTemplateId],
  );
  const selectedRootTemplateNodes = useMemo(
    () => (selectedRootTaskTemplate ? flattenRootTaskTemplateNodes(selectedRootTaskTemplate.nodes) : []),
    [selectedRootTaskTemplate],
  );
  const rootTemplateFlowNodes = useMemo(
    () => createRootTemplateFlowNodes(rootTaskTemplateDraft, rootTemplateSelectedNodeIds),
    [rootTaskTemplateDraft, rootTemplateSelectedNodeIds],
  );
  const rootTemplateFlowEdges = useMemo(
    () => createRootTemplateFlowEdges(rootTaskTemplateDraft),
    [rootTaskTemplateDraft],
  );
  const rootTaskTemplateOptions = useMemo(() => {
    if (!selectedProject) return data.rootTaskTemplates;
    const projectType = normalizeTemplateMatchText(selectedProject.projectType ?? "");
    return [...data.rootTaskTemplates].sort((a, b) => {
      const aMatches = projectType && normalizeTemplateMatchText(a.projectType ?? "") === projectType;
      const bMatches = projectType && normalizeTemplateMatchText(b.projectType ?? "") === projectType;
      return Number(bMatches) - Number(aMatches) || a.name.localeCompare(b.name, "zh-CN");
    });
  }, [data.rootTaskTemplates, selectedProject]);
  const isOverview = initialView === "overview";
  const isTemporaryPage = initialView === "temporary";
  const isRecurringPage = initialView === "recurring";
  const showOverview = isOverview;
  const showProjects = isOverview || initialView === "projects";
  const showRootTaskTemplates = initialView === "tasks";
  const showTasks = initialView === "projects" && Boolean(selectedProjectId);
  const showTemporary = initialView === "overview";
  const showRecurring = initialView === "overview";
  const showWorkflows = initialView === "workflows";
  const showSettings = initialView === "settings";
  const showInspector =
    (initialView === "projects" && Boolean(selectedTask)) ||
    ((isTemporaryPage || isRecurringPage) && Boolean(selectedTask));
  const useFloatingInspector = initialView === "projects" && Boolean(selectedTask);
  const hasRightColumn =
    showTemporary ||
    showRecurring ||
    showWorkflows ||
    showInspector;

  return (
    <main className={styles.appShell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            <Layers3 size={18} />
          </span>
          <div>
            <strong>Project OS</strong>
            <span>个人项目管理</span>
          </div>
        </div>
        <nav className={styles.navList} aria-label="主导航">
          {navItems.map((item) => (
            <a
              href={item.href}
              className={`${styles.navItem} ${item.id === initialView ? styles.activeNav : ""}`}
              key={item.id}
            >
              <item.icon size={17} />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <Sparkles size={16} />
          <span>{data.stats.completedTasks}/{data.stats.totalTasks} 已完成</span>
        </div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <h1>{viewTitles[initialView]}</h1>
            <p>{formatDate(new Date().toISOString())}</p>
          </div>
          {!isOverview && initialView !== "tasks" ? (
            <div className={styles.searchBox}>
              <Search size={16} />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索任务、项目、标签"
              />
            </div>
          ) : null}
        </header>

        {showOverview ? (
          <section id="overview" className={styles.overviewGrid}>
            <MetricCard label="活跃项目" value={data.stats.activeProjects} accent="blue" />
            <MetricCard label="今日任务" value={data.stats.todayTasks} accent="green" />
            <MetricCard label="临时任务" value={data.stats.temporaryTasks} accent="amber" />
            <MetricCard label="周期规则" value={data.stats.recurringRules} accent="slate" />
          </section>
        ) : null}

        <section
          className={`${styles.mainGrid} ${hasRightColumn ? "" : styles.singleColumnGrid} ${
            useFloatingInspector ? styles.floatingInspectorGrid : ""
          }`}
        >
          <div className={styles.leftColumn}>
            {showRootTaskTemplates ? (
            <section id="tasks" className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>根任务模板管理</h2>
                  <p>{data.rootTaskTemplates.length} 个模板</p>
                </div>
                <button
                  type="button"
                  className={styles.headerActionButton}
                  onClick={startNewRootTaskTemplate}
                >
                  新建模板
                </button>
              </div>
              <div className={styles.rootTemplateWorkspace}>
                <aside className={styles.rootTemplateList}>
                  <div className={styles.rootTemplateListHeader}>
                    <strong>模板列表</strong>
                    <span>按项目类型匹配根任务</span>
                  </div>
                  {data.rootTaskTemplates.map((template) => (
                    <button
                      type="button"
                      key={template.id}
                      className={`${styles.rootTemplateListButton} ${
                        selectedRootTaskTemplateId === template.id ? styles.activeRootTemplate : ""
                      }`}
                      onClick={() => selectRootTaskTemplate(template)}
                    >
                      <span>{template.name}</span>
                      <small>
                        {template.projectType ?? "通用"} · {template.rootTitle}
                      </small>
                      <em>{flattenRootTaskTemplateNodes(template.nodes).length} 个子任务</em>
                    </button>
                  ))}
                </aside>

                <form
                  className={styles.rootTemplateEditor}
                  onSubmit={
                    selectedRootTaskTemplateId
                      ? handleRootTaskTemplateUpdate
                      : handleRootTaskTemplateCreate
                  }
                >
                  <div className={styles.formSectionTitle}>
                    <strong>{selectedRootTaskTemplateId ? "模板完整信息" : "创建根任务模板"}</strong>
                    <span>添加根任务时，系统会按项目类型、根任务标题和关键词自动匹配。</span>
                  </div>
                  <div className={styles.formGrid}>
                    <label>
                      <span>模板名称</span>
                      <input
                        value={rootTaskTemplateDraft.name}
                        onChange={(event) =>
                          setRootTaskTemplateDraft((draft) => ({
                            ...draft,
                            name: event.target.value,
                          }))
                        }
                        placeholder="例如：报告编制模板"
                      />
                    </label>
                    <label>
                      <span>项目类型</span>
                      <input
                        value={rootTaskTemplateDraft.projectType}
                        onChange={(event) =>
                          setRootTaskTemplateDraft((draft) => ({
                            ...draft,
                            projectType: event.target.value,
                          }))
                        }
                        placeholder="例如：安全测评"
                      />
                    </label>
                    <label>
                      <span>根任务标题</span>
                      <input
                        value={rootTaskTemplateDraft.rootTitle}
                        onChange={(event) =>
                          setRootTaskTemplateDraft((draft) => ({
                            ...draft,
                            rootTitle: event.target.value,
                          }))
                        }
                        placeholder="例如：报告编制"
                      />
                    </label>
                    <label>
                      <span>匹配关键词</span>
                      <input
                        value={rootTaskTemplateDraft.matchKeywords}
                        onChange={(event) =>
                          setRootTaskTemplateDraft((draft) => ({
                            ...draft,
                            matchKeywords: event.target.value,
                          }))
                        }
                        placeholder="用逗号分隔"
                      />
                    </label>
                  </div>

                  <div className={styles.rootTemplateNodeHeader}>
                    <div className={styles.formSectionTitle}>
                      <strong>子任务结构</strong>
                      <span>每个节点都可以选择父任务，形成多级子任务模板。</span>
                    </div>
                    <button type="button" onClick={() => addRootTaskTemplateNode(null)}>
                      <Plus size={15} />
                      <span>添加子任务</span>
                    </button>
                  </div>

                  <div className={styles.rootTemplateViewSwitch}>
                    <button
                      type="button"
                      className={rootTaskTemplateView === "list" ? styles.activeViewSwitch : ""}
                      onClick={() => setRootTaskTemplateView("list")}
                    >
                      列表
                    </button>
                    <button
                      type="button"
                      className={rootTaskTemplateView === "flow" ? styles.activeViewSwitch : ""}
                      onClick={() => setRootTaskTemplateView("flow")}
                    >
                      流转图
                    </button>
                  </div>

                  {rootTaskTemplateView === "list" ? (
                  <div className={styles.rootNodeEditorList}>
                    {rootTaskTemplateDraft.nodes.map((node, index) => (
                      <article key={node.localId} className={styles.rootNodeEditorItem}>
                        <div className={styles.rootNodeNumber}>{index + 1}</div>
                        <div className={styles.rootNodeFields}>
                          <label>
                            <span>子任务名称</span>
                            <input
                              value={node.title}
                              onChange={(event) =>
                                updateRootTaskTemplateNode(node.localId, {
                                  title: event.target.value,
                                })
                              }
                              placeholder="输入子任务名称"
                            />
                          </label>
                          <label>
                            <span>父级任务</span>
                            <select
                              value={node.parentId ?? ""}
                              onChange={(event) =>
                                updateRootTaskTemplateNode(node.localId, {
                                  parentId: event.target.value || null,
                                })
                              }
                            >
                              <option value="">作为一级子任务</option>
                              {rootTaskTemplateDraft.nodes
                                .filter(
                                  (candidate) =>
                                    candidate.localId !== node.localId &&
                                    !isDraftNodeDescendant(
                                      rootTaskTemplateDraft.nodes,
                                      node.localId,
                                      candidate.localId,
                                    ),
                                )
                                .map((candidate) => (
                                  <option key={candidate.localId} value={candidate.localId}>
                                    {candidate.title || "未命名子任务"}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <label>
                            <span>默认状态</span>
                            <select
                              value={node.defaultStatusKey}
                              onChange={(event) =>
                                updateRootTaskTemplateNode(node.localId, {
                                  defaultStatusKey: event.target.value,
                                })
                              }
                            >
                              {data.workflows[0]?.states.map((state) => (
                                <option key={state.key} value={state.key}>
                                  {state.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>优先级</span>
                            <select
                              value={node.priority}
                              onChange={(event) =>
                                updateRootTaskTemplateNode(node.localId, {
                                  priority: event.target.value as Task["priority"],
                                })
                              }
                            >
                              <option value="high">高</option>
                              <option value="medium">中</option>
                              <option value="low">低</option>
                            </select>
                          </label>
                          <label>
                            <span>标签</span>
                            <input
                              value={node.tags}
                              onChange={(event) =>
                                updateRootTaskTemplateNode(node.localId, {
                                  tags: event.target.value,
                                })
                              }
                              placeholder="用逗号分隔"
                            />
                          </label>
                        </div>
                        <div className={styles.rootNodeActions}>
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={() => addRootTaskTemplateNode(node.localId)}
                          >
                            <Plus size={14} />
                            <span>添加下级</span>
                          </button>
                          <button
                            type="button"
                            className={styles.dangerButton}
                            onClick={() => deleteRootTaskTemplateNode(node.localId)}
                          >
                            <Trash2 size={14} />
                            <span>删除</span>
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                  ) : (
                    <div className={styles.rootTemplateFlowShell}>
                      <div className={styles.rootTemplateFlowToolbar}>
                        <div>
                          <strong>模板流转图</strong>
                          <span>拖拽节点会自动保存位置；按住 Shift/Ctrl 框选多个节点后可整体移动。</span>
                        </div>
                        <div className={styles.rootTemplateFlowToolbarActions}>
                          <span className={styles.rootTemplateAutosaveStatus}>
                            {rootTemplatePositionSaveState === "pending"
                              ? "等待保存"
                              : rootTemplatePositionSaveState === "saving"
                                ? "保存中"
                                : rootTemplatePositionSaveState === "saved"
                                  ? "位置已保存"
                                  : rootTemplatePositionSaveState === "error"
                                    ? "保存失败"
                                    : "自动保存"}
                          </span>
                          <button type="button" onClick={autoLayoutRootTemplateDraft}>
                            自动布局
                          </button>
                        </div>
                      </div>
                      <div className={styles.rootTemplateFlowCanvas}>
                        <svg className={styles.rootTemplateFlowOverlay} aria-hidden="true">
                          {rootTaskTemplateDraft.dependencies.map((dependency) => {
                            const fromNode = rootTaskTemplateDraft.nodes.find(
                              (node) => node.localId === dependency.fromNodeId,
                            );
                            const toNode = rootTaskTemplateDraft.nodes.find(
                              (node) => node.localId === dependency.toNodeId,
                            );
                            if (!fromNode || !toNode) return null;
                            const isStrong = dependency.type === "strong_binding";
                            const start = flowPointToScreen(
                              {
                                x: fromNode.positionX + rootTemplateNodeSize.width,
                                y: fromNode.positionY + rootTemplateNodeSize.height / 2,
                              },
                              rootTaskTemplateViewport,
                            );
                            const end = flowPointToScreen(
                              {
                                x: toNode.positionX,
                                y: toNode.positionY + rootTemplateNodeSize.height / 2,
                              },
                              rootTaskTemplateViewport,
                            );
                            const midX = (start.x + end.x) / 2;
                            return (
                              <g key={dependency.localId}>
                                <path
                                  d={`M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`}
                                  className={
                                    isStrong
                                      ? styles.strongFlowOverlayPath
                                      : styles.sequenceFlowOverlayPath
                                  }
                                />
                                <circle
                                  cx={end.x}
                                  cy={end.y}
                                  r="4"
                                  className={
                                    isStrong
                                      ? styles.strongFlowOverlayDot
                                      : styles.sequenceFlowOverlayDot
                                  }
                                />
                              </g>
                            );
                          })}
                        </svg>
                        <ReactFlow
                          key={rootTemplateFlowEdges.map((edge) => edge.id).join("|") || "empty"}
                          nodes={rootTemplateFlowNodes}
                          edges={rootTemplateFlowEdges}
                          onNodesChange={handleRootTemplateFlowNodesChange}
                          onNodeDragStop={scheduleRootTemplatePositionAutosave}
                          onConnect={handleRootTemplateFlowConnect}
                          onEdgeClick={(_, edge) => handleRootTemplateFlowEdgeClick(edge.id)}
                          connectionMode={ConnectionMode.Loose}
                          connectOnClick
                          defaultViewport={rootTemplateDefaultViewport}
                          onMove={(_, viewport) => setRootTaskTemplateViewport(viewport)}
                          minZoom={0.35}
                          maxZoom={1.4}
                          nodesDraggable
                          elementsSelectable
                          panOnDrag={[1, 2]}
                          panActivationKeyCode="Space"
                          multiSelectionKeyCode={["Shift", "Meta", "Control"]}
                          selectionKeyCode={["Shift", "Meta", "Control"]}
                          selectionOnDrag
                          selectionMode={SelectionMode.Partial}
                        >
                          <Background gap={18} size={1} color="#dbe4f0" />
                          <MiniMap pannable zoomable />
                          <Controls />
                        </ReactFlow>
                      </div>
                      <div className={styles.rootTemplateDependencyList}>
                        {rootTaskTemplateDraft.dependencies.length ? (
                          rootTaskTemplateDraft.dependencies.map((dependency) => {
                            const fromNode = rootTaskTemplateDraft.nodes.find(
                              (node) => node.localId === dependency.fromNodeId,
                            );
                            const toNode = rootTaskTemplateDraft.nodes.find(
                              (node) => node.localId === dependency.toNodeId,
                            );
                            return (
                              <div
                                key={dependency.localId}
                                className={styles.rootTemplateDependencyItem}
                              >
                                <span>
                                  {fromNode?.title || "未命名任务"} →{" "}
                                  {toNode?.title || "未命名任务"}
                                </span>
                                <button
                                  type="button"
                                  className={
                                    dependency.type === "strong_binding"
                                      ? styles.strongBindingPill
                                      : styles.sequencePill
                                  }
                                  onClick={() => handleRootTemplateFlowEdgeClick(dependency.localId)}
                                >
                                  {dependency.type === "strong_binding" ? "强绑定" : "顺序"}
                                </button>
                                <button
                                  type="button"
                                  className={styles.iconDangerButton}
                                  onClick={() => deleteRootTemplateDependency(dependency.localId)}
                                  aria-label="删除连线"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            );
                          })
                        ) : (
                          <p>暂无连线</p>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedRootTaskTemplate ? (
                    <div className={styles.rootTemplatePreview}>
                      <strong>当前模板结构</strong>
                      {selectedRootTemplateNodes.map((node) => (
                        <span key={node.id} style={{ marginLeft: node.level * 14 }}>
                          {node.title}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className={styles.formActions}>
                    <button
                      type="submit"
                      disabled={
                        isPending ||
                        !rootTaskTemplateDraft.name.trim() ||
                        !rootTaskTemplateDraft.rootTitle.trim() ||
                        createRootTaskTemplatePayload(rootTaskTemplateDraft).nodes.length === 0
                      }
                    >
                      <Save size={15} />
                      <span>{selectedRootTaskTemplateId ? "保存模板" : "创建模板"}</span>
                    </button>
                    {selectedRootTaskTemplateId ? (
                      <button
                        type="button"
                        className={styles.dangerButton}
                        onClick={deleteSelectedRootTaskTemplate}
                        disabled={isPending}
                      >
                        <Trash2 size={15} />
                        <span>删除模板</span>
                      </button>
                    ) : null}
                  </div>
                </form>
              </div>
            </section>
            ) : null}

            {isTemporaryPage ? (
            <section id="temporary" className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>临时任务</h2>
                  <p>{data.temporaryTasks.length} 条已添加</p>
                </div>
                <Clock3 size={18} />
              </div>
              <form className={styles.quickForm} onSubmit={handleQuickTask}>
                <input
                  value={quickTaskTitle}
                  onChange={(event) => setQuickTaskTitle(event.target.value)}
                  placeholder="输入临时任务"
                />
                <button disabled={isPending}>
                  <Plus size={16} />
                  <span>添加</span>
                </button>
              </form>
              <div className={styles.inboxList}>
                {data.temporaryTasks.map((task) => (
                  <article key={task.id} className={styles.inboxItem}>
                    <button onClick={() => setSelectedTaskId(task.id)}>
                      <span>{task.title}</span>
                      <small>
                        {priorityLabel(task.priority)}
                        {task.dueDate ? ` · ${formatDate(task.dueDate)}` : " · 未设截止"}
                      </small>
                    </button>
                    <button
                      className={styles.secondaryButton}
                      onClick={() => organizeTemporaryTask(task)}
                      disabled={!selectedProjectId}
                    >
                      归入当前项目
                    </button>
                  </article>
                ))}
                {data.temporaryTasks.length === 0 ? (
                  <div className={styles.emptySelection}>
                    <Clock3 size={20} />
                    <strong>暂无临时任务</strong>
                    <span>在上方输入内容后会进入临时任务列表。</span>
                  </div>
                ) : null}
              </div>
            </section>
            ) : null}

            {isRecurringPage ? (
            <section id="recurring" className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>周期任务</h2>
                  <p>{data.recurringRules.length} 条已添加</p>
                </div>
                <CalendarClock size={18} />
              </div>
              <form
                className={styles.recurrenceForm}
                onSubmit={selectedRuleId ? handleRecurrenceUpdate : handleRecurrenceCreate}
              >
                <label>
                  <span>周期任务名称</span>
                  <input
                    value={recurrenceDraft.taskTitle}
                    onChange={(event) =>
                      setRecurrenceDraft((draft) => ({ ...draft, taskTitle: event.target.value }))
                    }
                    placeholder="例如：每周复盘"
                  />
                </label>
                <div className={styles.recurrenceGrid}>
                  <label>
                    <span>起始时间</span>
                    <input
                      type="date"
                      value={recurrenceDraft.startAt}
                      onChange={(event) =>
                        setRecurrenceDraft((draft) => ({ ...draft, startAt: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    <span>结束时间</span>
                    <input
                      type="date"
                      value={recurrenceDraft.endsAt}
                      onChange={(event) =>
                        setRecurrenceDraft((draft) => ({ ...draft, endsAt: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    <span>频率</span>
                    <select
                      value={recurrenceDraft.frequency}
                      onChange={(event) =>
                        setRecurrenceDraft((draft) => ({
                          ...draft,
                          frequency: event.target.value as typeof recurrenceDraft.frequency,
                        }))
                      }
                    >
                      <option value="daily">每日</option>
                      <option value="weekly">每周</option>
                      <option value="monthly">每月</option>
                    </select>
                  </label>
                  <label>
                    <span>下次触发</span>
                    <input
                      type="date"
                      value={toDateInput(recurrenceNextRunAt(recurrenceDraft))}
                      readOnly
                    />
                  </label>
                </div>
                <div className={styles.formActions}>
                  <button type="submit" disabled={isPending || !recurrenceDraft.taskTitle.trim()}>
                    <Repeat2 size={15} />
                    <span>{selectedRuleId ? "保存规则" : "创建规则"}</span>
                  </button>
                  {selectedRuleId ? (
                    <button
                      type="button"
                        className={styles.secondaryButton}
                        onClick={() => {
                          setSelectedRuleId(null);
                          setSelectedTaskId(null);
                          setRecurrenceDraft(createEmptyRecurrenceDraft());
                        }}
                      >
                      新建规则
                    </button>
                  ) : null}
                </div>
              </form>
              <div className={styles.recurrenceList}>
                {data.recurringRules.map((rule) => (
                  <article key={rule.id} className={styles.recurrenceItem}>
                    <button onClick={() => editRecurrence(rule.id)}>
                      <span>{rule.taskTitle}</span>
                      <strong>{frequencyLabel(rule.frequency, rule.interval)}</strong>
                      <small>
                        {rule.paused ? "已暂停" : `下次 ${formatDate(rule.nextRunAt)}`}
                      </small>
                    </button>
                    <div>
                      <button onClick={() => generateRecurringTask(rule.id)}>生成</button>
                      <button onClick={() => toggleRecurrencePaused(rule.id)}>
                        {rule.paused ? <Play size={14} /> : <Pause size={14} />}
                        <span>{rule.paused ? "恢复" : "暂停"}</span>
                      </button>
                    </div>
                  </article>
                ))}
                {data.recurringRules.length === 0 ? (
                  <div className={styles.emptySelection}>
                    <CalendarClock size={20} />
                    <strong>暂无周期任务</strong>
                    <span>选择任务模板并创建规则后会在这里展示。</span>
                  </div>
                ) : null}
              </div>
            </section>
            ) : null}

            {showProjects ? (
            <section id="projects" className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>
                    {isOverview
                      ? "项目进度状态"
                      : selectedProject
                        ? "项目详情"
                        : "项目管理"}
                  </h2>
                  <p>
                    {isOverview
                      ? `${activeProjects.length} 个项目`
                      : selectedProject?.name ?? `${activeProjects.length} 个项目`}
                  </p>
                </div>
                {!isOverview && selectedProject ? (
                  <button
                    type="button"
                    className={styles.headerActionButton}
                    onClick={clearProjectSelection}
                  >
                    返回项目列表
                  </button>
                ) : null}
                {!isOverview && !selectedProject ? (
                  <form className={styles.inlineForm} onSubmit={handleProject}>
                    <input
                      value={projectName}
                      onChange={(event) => setProjectName(event.target.value)}
                      placeholder="新项目"
                    />
                    <button disabled={isPending} title="添加项目">
                      <Plus size={16} />
                    </button>
                  </form>
                ) : null}
              </div>
              {(isOverview || !selectedProject) ? (
              initialView === "projects" ? (
                <ProjectSetBrowser
                  projectSets={data.projectSets}
                  projects={activeProjects}
                  selection={selectedProjectSetId}
                  pending={isPending || isProjectSetPending}
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
                  onSaveMembership={saveProjectSetMembership}
                />
              ) : (
                <div className={styles.projectRail}>
                  {activeProjects.map((project) => (
                    <button
                      className={`${styles.projectButton} ${
                        project.id === selectedProjectId ? styles.activeProject : ""
                      }`}
                      key={project.id}
                      onClick={() => selectProject(project.id)}
                    >
                      <span>{project.name}</span>
                      <strong>{project.progress}%</strong>
                      <i style={{ width: `${project.progress}%` }} />
                    </button>
                  ))}
                  {activeProjects.length === 0 ? (
                    <div className={styles.emptySelection}>
                      <FolderKanban size={20} />
                      <strong>暂无未归档项目</strong>
                      <span>新建项目后会在这里展示；已归档项目可在设置中恢复。</span>
                    </div>
                  ) : null}
                </div>
              )
              ) : null}
              {selectedProject && !isOverview ? (
                <form className={styles.projectDetailForm} onSubmit={handleProjectUpdate}>
                  <div className={styles.formGrid}>
                    <label>
                      <span>项目名称</span>
                      <input
                        value={activeProjectDraft.name}
                        onChange={(event) =>
                          setProjectDraft({ ...activeProjectDraft, name: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span>状态</span>
                      <select
                        value={activeProjectDraft.status}
                        onChange={(event) =>
                          setProjectDraft({ ...activeProjectDraft, status: event.target.value })
                        }
                      >
                        <option value="active">进行中</option>
                        <option value="paused">暂停</option>
                        <option value="done">完成</option>
                      </select>
                    </label>
                    <label>
                      <span>项目类型</span>
                      <input
                        value={activeProjectDraft.projectType}
                        onChange={(event) =>
                          setProjectDraft({
                            ...activeProjectDraft,
                            projectType: event.target.value,
                          })
                        }
                        placeholder="例如：安全测评"
                      />
                    </label>
                    <label>
                      <span>截止日期</span>
                      <input
                        type="date"
                        value={activeProjectDraft.dueDate}
                        onChange={(event) =>
                          setProjectDraft({ ...activeProjectDraft, dueDate: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span>标签</span>
                      <input
                        value={activeProjectDraft.tags}
                        onChange={(event) =>
                          setProjectDraft({ ...activeProjectDraft, tags: event.target.value })
                        }
                        placeholder="产品, 开发"
                      />
                    </label>
                    <label>
                      <span>工作流</span>
                      <select
                        value={activeProjectDraft.workflowTemplateId}
                        onChange={(event) =>
                          setProjectDraft({
                            ...activeProjectDraft,
                            workflowTemplateId: event.target.value,
                          })
                        }
                      >
                        {data.workflows.map((workflow) => (
                          <option key={workflow.id} value={workflow.id}>
                            {workflow.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className={styles.formGrid}>
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
                          setProjectDraft({
                            ...activeProjectDraft,
                            projectSetId: event.target.value,
                          })
                        }
                      >
                        <option value="">未分组项目</option>
                        {data.projectSets.map((projectSet) => (
                          <option key={projectSet.id} value={projectSet.id}>
                            {projectSet.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className={styles.fullField}>
                    <span>项目描述</span>
                    <textarea
                      value={activeProjectDraft.description}
                      onChange={(event) =>
                        setProjectDraft({ ...activeProjectDraft, description: event.target.value })
                      }
                    />
                  </label>
                  <div className={styles.formActions}>
                    <button type="submit" disabled={isPending}>
                      <Save size={15} />
                      <span>保存项目</span>
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => toggleProjectArchive(selectedProject)}
                    >
                      <Archive size={15} />
                      <span>{selectedProject.archived ? "取消归档" : "归档项目"}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={deleteSelectedProject}
                      disabled={isPending}
                    >
                      <Trash2 size={15} />
                      <span>永久删除项目</span>
                    </button>
                  </div>
                  <div className={styles.templateRecommendations}>
                    <div>
                      <strong>推荐任务树模板</strong>
                      <span>来源于任务中心的根任务模板，选择后可在下方创建根任务。</span>
                    </div>
                    {projectRootTemplateRecommendations.length > 0 ? (
                      projectRootTemplateRecommendations.map((recommendation) => (
                        <article key={recommendation.template.id}>
                          <div>
                            <strong>{recommendation.template.name}</strong>
                            <small>
                              {recommendation.template.projectType ?? "通用模板"} · 根任务：{recommendation.template.rootTitle} · {recommendation.score} 分
                            </small>
                          </div>
                          <p>{recommendation.reasons.join(" / ")}</p>
                          <button
                            type="button"
                            onClick={() => {
                              setRootTaskCreateTemplateId(recommendation.template.id);
                              setRootTaskTitle(recommendation.template.rootTitle);
                            }}
                            disabled={isPending}
                          >
                            <ListTree size={14} />
                            <span>选择模板</span>
                          </button>
                        </article>
                      ))
                    ) : (
                      <p>暂无匹配模板。请在任务中心创建适用于当前项目类型的根任务模板。</p>
                    )}
                    <div className={styles.rootTemplatePickList}>
                      <strong>手动选择根任务模板</strong>
                      <span>选择后会填入下方根任务添加区，可再修改根任务名称。</span>
                      <div>
                        {rootTaskTemplateOptions.map((template) => (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() => {
                              setRootTaskCreateTemplateId(template.id);
                              setRootTaskTitle(template.rootTitle);
                            }}
                          >
                            {template.name}
                          </button>
                        ))}
                        {rootTaskTemplateOptions.length === 0 ? (
                          <small>暂无适用于当前项目类型的根任务模板。</small>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </form>
              ) : null}
              {!selectedProject && initialView === "projects" ? (
                <div className={styles.emptySelection}>
                  <FolderKanban size={20} />
                  <strong>
                    {selectedProjectSetId ? "请选择一个项目" : "请选择一个项目集"}
                  </strong>
                  <span>
                    {selectedProjectSetId
                      ? `当前分组内共有 ${selectedProjectSetProjects.length} 个项目，点击后进入项目详情。`
                      : "先从上方选择一个项目集或未分组入口，再进入项目详情。"}
                  </span>
                </div>
              ) : null}
            </section>
            ) : null}

            {showTasks ? (
            <section id="tasks" className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>{initialView === "projects" ? "根任务与子任务" : "任务树"}</h2>
                  <p>{filteredProjectTasks.length}/{projectTasks.length} 个项目任务</p>
                </div>
                <form className={styles.rootTaskCreateForm} onSubmit={handleRootTask}>
                  <input
                    value={rootTaskTitle}
                    onChange={(event) => setRootTaskTitle(event.target.value)}
                    placeholder="添加根任务"
                  />
                  <select
                    value={rootTaskCreateTemplateId}
                    onChange={(event) => {
                      const nextTemplateId = event.target.value;
                      setRootTaskCreateTemplateId(nextTemplateId);
                      const template = data.rootTaskTemplates.find(
                        (item) => item.id === nextTemplateId,
                      );
                      if (template && !rootTaskTitle.trim()) {
                        setRootTaskTitle(template.rootTitle);
                      }
                    }}
                    title="选择根任务模板"
                  >
                    <option value="auto">自动匹配模板</option>
                    <option value="none">不使用模板</option>
                    {rootTaskTemplateOptions.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                  <button disabled={isPending || !selectedProjectId} title="添加根任务">
                    <Plus size={16} />
                  </button>
                </form>
              </div>
              <div className={styles.taskToolbar}>
                <form className={styles.inlineForm} onSubmit={handleSubtask}>
                  <input
                    value={subtaskTitle}
                    onChange={(event) => setSubtaskTitle(event.target.value)}
                    placeholder="添加子任务"
                  />
                  <button disabled={isPending || !selectedTaskId} title="添加子任务">
                    <Plus size={16} />
                  </button>
                </form>
              </div>
              <div className={styles.filterBar}>
                <select value={rootTaskFilter} onChange={(event) => setRootTaskFilter(event.target.value)}>
                  <option value="">全部根任务</option>
                  {projectRootTasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title}
                    </option>
                  ))}
                </select>
                <select value={taskStatusFilter} onChange={(event) => setTaskStatusFilter(event.target.value)}>
                  <option value="">全部状态</option>
                  {selectedProjectWorkflow?.states.map((state) => (
                    <option key={state.key} value={state.key}>
                      {state.label}
                    </option>
                  ))}
                </select>
                <select value={taskPriorityFilter} onChange={(event) => setTaskPriorityFilter(event.target.value)}>
                  <option value="">全部优先级</option>
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setTaskStatusFilter("");
                    setRootTaskFilter("");
                    setTaskPriorityFilter("");
                  }}
                >
                  清除
                </button>
              </div>
              {initialView === "projects" ? (
                <div className={styles.rootTaskBoard}>
                  {projectTaskTree.length > 0 ? (
                    projectTaskTree.map((task) => (
                      <article key={task.id} className={styles.rootTaskColumn}>
                        <TaskNode
                          task={task}
                          depth={0}
                          selectedTaskId={selectedTaskId}
                          states={selectedProjectWorkflow?.states ?? []}
                          expandedTaskIds={expandedTaskIds}
                          onSelect={setSelectedTaskId}
                          onToggle={toggleTaskExpanded}
                        />
                      </article>
                    ))
                  ) : (
                    <div className={styles.emptySelection}>
                      <ListTree size={20} />
                      <strong>暂无根任务</strong>
                      <span>在上方输入根任务名称后，会以单独列展示。</span>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className={styles.workflowStrip}>
                    {selectedProjectWorkflow?.states.map((state) => (
                      <span key={state.id} style={{ borderColor: state.color, color: state.color }}>
                        {state.label}
                      </span>
                    ))}
                  </div>
                  <div className={styles.taskTree}>
                    {projectTaskTree.map((task) => (
                      <TaskNode
                        key={task.id}
                        task={task}
                        depth={0}
                        selectedTaskId={selectedTaskId}
                        states={selectedProjectWorkflow?.states ?? []}
                        expandedTaskIds={expandedTaskIds}
                        onSelect={setSelectedTaskId}
                        onToggle={toggleTaskExpanded}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>
            ) : null}
          </div>

          <aside
            className={`${styles.rightColumn} ${
              useFloatingInspector ? styles.floatingRightColumn : ""
            } ${showSettings ? styles.settingsMainColumn : ""}`}
          >
            {showTemporary ? (
            <section id="temporary" className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>临时任务列表</h2>
                  <p>{visibleTemporaryTasks.length} 条待整理</p>
                </div>
                <Clock3 size={18} />
              </div>
              <div className={styles.inboxList}>
                {visibleTemporaryTasks.map((task) => (
                  <article key={task.id} className={styles.inboxItem}>
                    <button onClick={() => setSelectedTaskId(task.id)}>
                      <span>{task.title}</span>
                      <small>
                        {priorityLabel(task.priority)}
                        {task.dueDate ? ` · ${formatDate(task.dueDate)}` : " · 未设截止"}
                      </small>
                    </button>
                    <button
                      className={styles.secondaryButton}
                      onClick={() => organizeTemporaryTask(task)}
                      disabled={!selectedProjectId}
                    >
                      归入当前项目
                    </button>
                  </article>
                ))}
              </div>
            </section>
            ) : null}

            {showRecurring ? (
            <section id="recurring" className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>周期任务</h2>
                  <p>周期任务列表</p>
                </div>
                <CalendarClock size={18} />
              </div>
              <div className={styles.recurrenceList}>
                {data.recurringRules.map((rule) => (
                  <article key={rule.id} className={styles.recurrenceItem}>
                    <button onClick={() => editRecurrence(rule.id)}>
                      <span>{rule.taskTitle}</span>
                      <strong>{frequencyLabel(rule.frequency, rule.interval)}</strong>
                      <small>
                        {rule.paused ? "已暂停" : `下次 ${formatDate(rule.nextRunAt)}`}
                      </small>
                    </button>
                    <div>
                      <button onClick={() => generateRecurringTask(rule.id)}>生成</button>
                      <button onClick={() => toggleRecurrencePaused(rule.id)}>
                        {rule.paused ? <Play size={14} /> : <Pause size={14} />}
                        <span>{rule.paused ? "恢复" : "暂停"}</span>
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
            ) : null}

            {showWorkflows ? (
            <section id="workflows" className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>模板中心</h2>
                  <p>{data.workflows.length} 个状态模板</p>
                </div>
                <Workflow size={18} />
              </div>
              <form className={styles.workflowForm} onSubmit={handleWorkflowCreate}>
                <div className={styles.formSectionTitle}>
                  <strong>状态工作流模板</strong>
                  <span>定义任务可流转的状态</span>
                </div>
                <label>
                  <span>模板名称</span>
                  <input
                    value={workflowDraft.name}
                    onChange={(event) =>
                      setWorkflowDraft((draft) => ({ ...draft, name: event.target.value }))
                    }
                    placeholder="例如：写作流程"
                  />
                </label>
                <label>
                  <span>描述</span>
                  <input
                    value={workflowDraft.description}
                    onChange={(event) =>
                      setWorkflowDraft((draft) => ({
                        ...draft,
                        description: event.target.value,
                      }))
                    }
                    placeholder="适用场景"
                  />
                </label>
                <label>
                  <span>状态定义</span>
                  <textarea
                    value={workflowDraft.states}
                    onChange={(event) =>
                      setWorkflowDraft((draft) => ({ ...draft, states: event.target.value }))
                    }
                  />
                </label>
                <div className={styles.formActions}>
                  <button type="submit" disabled={isPending}>
                    <Plus size={15} />
                    <span>创建模板</span>
                  </button>
                </div>
              </form>
              <div className={styles.workflowList}>
                {data.workflows.map((workflow) => (
                  <article key={workflow.id}>
                    <strong>{workflow.name}</strong>
                    <small>{workflow.description ?? "无描述"}</small>
                    <div>
                      {workflow.states.map((state) => (
                        <span key={state.id} style={{ borderColor: state.color, color: state.color }}>
                          {state.label}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
            ) : null}

            {showSettings ? (
            <section id="settings" className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>
                    {settingsView === "personnel"
                      ? "人员管理"
                      : settingsView === "archive"
                        ? "归档项目管理"
                        : settingsView === "data"
                          ? "数据与备份"
                          : "设置"}
                  </h2>
                  <p>
                    {settingsView === "personnel"
                      ? "维护测评人员及证书信息"
                      : settingsView === "archive"
                        ? "查看并恢复已归档项目"
                        : settingsView === "data"
                          ? "管理本地 SQLite 数据与 JSON 迁移"
                          : "选择需要管理的设置模块"}
                  </p>
                </div>
                {settingsView === "home" ? (
                  <Settings2 size={18} />
                ) : (
                  <button
                    type="button"
                    className={styles.settingsBackButton}
                    onClick={() => {
                      setSettingsView("home");
                      cancelPersonnelEdit();
                      setSettingsMessage("");
                    }}
                  >
                    <ArrowLeft size={16} />
                    <span>返回设置</span>
                  </button>
                )}
              </div>
              <div className={styles.settingsBody}>
                {settingsView === "home" ? (
                  <div className={styles.settingsEntryGrid}>
                    <button
                      type="button"
                      className={styles.settingsEntry}
                      onClick={() => setSettingsView("personnel")}
                    >
                      <span className={styles.settingsEntryIcon}>
                        <UserPlus size={19} />
                      </span>
                      <span className={styles.settingsEntryText}>
                        <strong>人员管理</strong>
                        <small>
                          {data.personnel.filter((person) => !person.deletedAt).length} 名有效人员
                        </small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                    <button
                      type="button"
                      className={styles.settingsEntry}
                      onClick={() => setSettingsView("archive")}
                    >
                      <span className={styles.settingsEntryIcon}>
                        <Archive size={19} />
                      </span>
                      <span className={styles.settingsEntryText}>
                        <strong>归档项目管理</strong>
                        <small>{archivedProjects.length} 个归档项目</small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                    <button
                      type="button"
                      className={styles.settingsEntry}
                      onClick={() => setSettingsView("data")}
                    >
                      <span className={styles.settingsEntryIcon}>
                        <HardDrive size={19} />
                      </span>
                      <span className={styles.settingsEntryText}>
                        <strong>数据与备份</strong>
                        <small>导出、导入和创建数据库备份</small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                  </div>
                ) : null}
                {settingsView === "personnel" ? (
                <div className={styles.personnelManager}>
                  <div className={styles.formSectionTitle}>
                    <strong>测评人员管理</strong>
                    <span>维护姓名和证书编号；已删除人员仍保留在历史任务中。</span>
                  </div>
                  <form className={styles.personnelForm} onSubmit={handlePersonnelSubmit}>
                    <label>
                      <span>姓名</span>
                      <input
                        value={personnelDraft.name}
                        onChange={(event) =>
                          setPersonnelDraft({ ...personnelDraft, name: event.target.value })
                        }
                        placeholder="请输入姓名"
                      />
                    </label>
                    <label>
                      <span>证书编号</span>
                      <input
                        value={personnelDraft.certificateNumber}
                        onChange={(event) =>
                          setPersonnelDraft({
                            ...personnelDraft,
                            certificateNumber: event.target.value,
                          })
                        }
                        placeholder="请输入证书编号"
                      />
                    </label>
                    <div className={styles.personnelFormActions}>
                      <button
                        type="submit"
                        disabled={
                          isPending ||
                          !personnelDraft.name.trim() ||
                          !personnelDraft.certificateNumber.trim()
                        }
                      >
                        {editingPersonnelId ? <Save size={15} /> : <UserPlus size={15} />}
                        <span>{editingPersonnelId ? "保存修改" : "添加人员"}</span>
                      </button>
                      {editingPersonnelId ? (
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={cancelPersonnelEdit}
                        >
                          <X size={15} />
                          <span>取消</span>
                        </button>
                      ) : null}
                    </div>
                  </form>
                  <div className={styles.personnelList}>
                    {data.personnel.map((person) => (
                      <article
                        key={person.id}
                        className={person.deletedAt ? styles.deletedPersonnel : ""}
                      >
                        <div>
                          <strong>{person.name}</strong>
                          <small>{person.certificateNumber}</small>
                        </div>
                        <span className={styles.personnelState}>
                          {person.deletedAt ? "已删除" : "有效"}
                        </span>
                        <div className={styles.personnelRowActions}>
                          {!person.deletedAt ? (
                            <>
                              <button
                                type="button"
                                className={styles.iconButton}
                                onClick={() => startPersonnelEdit(person.id)}
                                title="编辑人员"
                                aria-label={`编辑${person.name}`}
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                className={styles.iconButton}
                                onClick={() => removePersonnel(person.id)}
                                title="删除人员"
                                aria-label={`删除${person.name}`}
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </article>
                    ))}
                    {data.personnel.length === 0 ? <p>暂未录入测评人员。</p> : null}
                  </div>
                </div>
                ) : null}
                {settingsView === "data" ? (
                <>
                <div className={styles.pathBox}>
                  <span>数据库文件</span>
                  <code>{data.safetyInfo.databasePath}</code>
                </div>
                <div className={styles.pathBox}>
                  <span>备份目录</span>
                  <code>{data.safetyInfo.backupDirectory ?? "内存数据库暂无备份目录"}</code>
                </div>
                <div className={styles.dataCounters}>
                  <span>人员 {data.safetyInfo.counts.personnel}</span>
                  <span>项目 {data.safetyInfo.counts.projects}</span>
                  <span>任务 {data.safetyInfo.counts.tasks}</span>
                  <span>工作流 {data.safetyInfo.counts.workflows}</span>
                  <span>周期 {data.safetyInfo.counts.recurrenceRules}</span>
                </div>
                </>
                ) : null}
                {settingsView === "archive" ? (
                <div className={styles.archiveManager}>
                  <div className={styles.formSectionTitle}>
                    <strong>归档项目管理</strong>
                    <span>归档项目不会出现在项目管理列表中，可在这里恢复。</span>
                  </div>
                  <div className={styles.archivedProjectList}>
                    {archivedProjects.map((project) => (
                      <article key={project.id}>
                        <div>
                          <strong>{project.name}</strong>
                          <small>
                            {project.projectType ?? "未设置类型"} · {project.progress}% · {project.taskCount} 个任务
                          </small>
                        </div>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => toggleProjectArchive(project)}
                          disabled={isPending}
                        >
                          <RefreshCcw size={15} />
                          <span>恢复项目</span>
                        </button>
                      </article>
                    ))}
                    {archivedProjects.length === 0 ? (
                      <p>暂无已归档项目。</p>
                    ) : null}
                  </div>
                </div>
                ) : null}
                {settingsView === "data" ? (
                <>
                <div className={styles.formActions}>
                  <button type="button" onClick={handleExportData}>
                    <Download size={15} />
                    <span>导出 JSON</span>
                  </button>
                  <button type="button" className={styles.secondaryButton} onClick={handleCreateBackup}>
                    <HardDrive size={15} />
                    <span>创建备份</span>
                  </button>
                </div>
                <form className={styles.importForm} onSubmit={handleImportData}>
                  <label>
                    <span>粘贴导出的 JSON 数据</span>
                    <textarea
                      value={settingsImportText}
                      onChange={(event) => setSettingsImportText(event.target.value)}
                      placeholder="不会清空现有数据，只会按 ID 合并或覆盖。"
                    />
                  </label>
                  <button type="submit" disabled={isPending || !settingsImportText.trim()}>
                    <Upload size={15} />
                    <span>导入并合并</span>
                  </button>
                </form>
                </>
                ) : null}
                {settingsView !== "home" && settingsMessage ? (
                  <p className={styles.settingsMessage}>{settingsMessage}</p>
                ) : null}
              </div>
            </section>
            ) : null}

            {showInspector ? (
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>{isTemporaryPage || isRecurringPage ? "任务编辑" : "任务详情"}</h2>
                  <p>
                    {selectedTask
                      ? formatTaskDetailSubtitle(
                          selectedTaskProject?.name,
                          selectedTask.title,
                        )
                      : "未选择"}
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => setSelectedTaskId(null)}
                  title="隐藏详情"
                  aria-label="隐藏详情"
                >
                  <PanelRight size={18} />
                </button>
              </div>
              {selectedTask ? (
                <form className={styles.inspector} onSubmit={handleTaskUpdate}>
                  <label>
                    <span>任务标题</span>
                    <input
                      value={activeTaskDraft.title}
                      onChange={(event) =>
                        setTaskDraft({ ...activeTaskDraft, title: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>描述</span>
                    <textarea
                      value={activeTaskDraft.description}
                      onChange={(event) =>
                        setTaskDraft({ ...activeTaskDraft, description: event.target.value })
                      }
                    />
                  </label>
                  <div>
                    <label className={styles.fieldLabel}>状态</label>
                    <div className={styles.statusGrid}>
                      {selectedProjectWorkflow?.states.map((state) => (
                        <button
                          type="button"
                          key={state.key}
                          className={selectedTask.statusKey === state.key ? styles.activeStatus : ""}
                          onClick={() => updateTaskStatus(selectedTask.id, state.key)}
                        >
                          {state.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={styles.formGrid}>
                    <label>
                      <span>开始时间</span>
                      <input
                        type="datetime-local"
                        value={activeTaskDraft.startTime}
                        onChange={(event) =>
                          setTaskDraft({
                            ...activeTaskDraft,
                            startTime: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>截止日期</span>
                      <input
                        type="date"
                        value={activeTaskDraft.dueDate}
                        onChange={(event) =>
                          setTaskDraft({ ...activeTaskDraft, dueDate: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span>优先级</span>
                      <select
                        value={activeTaskDraft.priority}
                        onChange={(event) =>
                          setTaskDraft({
                            ...activeTaskDraft,
                            priority: event.target.value as Task["priority"],
                          })
                        }
                      >
                        <option value="low">低</option>
                        <option value="medium">中</option>
                        <option value="high">高</option>
                      </select>
                    </label>
                    <label>
                      <span>标签</span>
                      <input
                        value={activeTaskDraft.tags}
                        onChange={(event) =>
                          setTaskDraft({ ...activeTaskDraft, tags: event.target.value })
                        }
                        placeholder="设计, 本周"
                      />
                    </label>
                  </div>
                  <div className={styles.assigneeField}>
                    <span className={styles.fieldLabel}>分配人员</span>
                    <div className={styles.assigneeTags}>
                      {activeTaskDraft.personnelIds.map((personnelId) => {
                        const person = data.personnel.find((item) => item.id === personnelId);
                        if (!person) return null;
                        return (
                          <span
                            key={person.id}
                            className={person.deletedAt ? styles.deletedAssignee : ""}
                            title={person.deletedAt ? "该人员已删除" : person.certificateNumber}
                          >
                            {person.name}{person.deletedAt ? "！" : ""}
                            <button
                              type="button"
                              onClick={() => toggleTaskPersonnel(person.id)}
                              aria-label={`移除${person.name}`}
                            >
                              <X size={13} />
                            </button>
                          </span>
                        );
                      })}
                      {activeTaskDraft.personnelIds.length === 0 ? (
                        <small>暂未分配人员</small>
                      ) : null}
                    </div>
                    <details className={styles.assigneePicker}>
                      <summary>选择人员</summary>
                      <div>
                        {data.personnel
                          .filter((person) => !person.deletedAt)
                          .map((person) => (
                            <label key={person.id}>
                              <input
                                type="checkbox"
                                checked={activeTaskDraft.personnelIds.includes(person.id)}
                                onChange={() => toggleTaskPersonnel(person.id)}
                              />
                              <span>
                                <strong>{person.name}</strong>
                                <small>{person.certificateNumber}</small>
                              </span>
                            </label>
                          ))}
                        {data.personnel.every((person) => person.deletedAt) ? (
                          <p>暂无可分配人员，请先在设置中录入。</p>
                        ) : null}
                      </div>
                    </details>
                  </div>
                  <div className={styles.detailMeta}>
                    <span>{sourceLabel(selectedTask.sourceType)}</span>
                    <span>{selectedTask.completedAt ? "已完成" : "未完成"}</span>
                  </div>
                  {(selectedTaskDependencies.blockers.length > 0 ||
                    selectedTaskDependencies.unlocks.length > 0) ? (
                    <div className={styles.dependencyBox}>
                      {selectedTaskDependencies.blockers.length > 0 ? (
                        <div>
                          <strong>前置任务</strong>
                          {selectedTaskDependencies.blockers.map((task) => (
                            <span key={task.id}>{task.title}</span>
                          ))}
                        </div>
                      ) : null}
                      {selectedTaskDependencies.unlocks.length > 0 ? (
                        <div>
                          <strong>完成后推进</strong>
                          {selectedTaskDependencies.unlocks.map((task) => (
                            <span key={task.id}>{task.title}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className={styles.formActions}>
                    <button type="submit" disabled={isPending}>
                      <Save size={15} />
                      <span>保存任务</span>
                    </button>
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={deleteSelectedTask}
                    >
                      <Trash2 size={15} />
                      <span>删除任务</span>
                    </button>
                  </div>
                </form>
              ) : null}
            </section>
            ) : null}
          </aside>
        </section>
      </section>
    </main>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <article className={`${styles.metricCard} ${styles[accent]}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function TaskNode({
  task,
  depth,
  selectedTaskId,
  states,
  expandedTaskIds,
  onSelect,
  onToggle,
}: {
  task: Task;
  depth: number;
  selectedTaskId: string | null;
  states: WorkflowState[];
  expandedTaskIds: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const currentState = states.find((state) => state.key === task.statusKey);
  const hasChildren = Boolean(task.children?.length);
  const isExpanded = expandedTaskIds.has(task.id);
  const rootProgress =
    depth === 0
      ? calculateRootTaskProgress(
          task,
          states.filter((state) => state.isCompleted).map((state) => state.key),
        )
      : null;

  return (
    <div>
      <button
        className={`${styles.taskRow} ${selectedTaskId === task.id ? styles.activeTask : ""}`}
        style={{ paddingLeft: 14 + depth * 22 }}
        onClick={() => onSelect(task.id)}
      >
        <ChevronRight
          size={14}
          className={`${hasChildren ? styles.chevronOn : styles.chevronOff} ${
            isExpanded ? styles.chevronOpen : ""
          }`}
          onClick={(event) => {
            event.stopPropagation();
            if (hasChildren) onToggle(task.id);
          }}
        />
        {task.statusKey === "done" ? <CheckCircle2 size={17} /> : <Circle size={17} />}
        <span>{task.title}</span>
        {depth === 0 ? (
          <small
            className={`${styles.taskAssignees} ${
              task.assignees.length === 0 ? styles.unassignedTask : ""
            }`}
            title={formatAssigneeNames(task.assignees)}
          >
            {formatAssigneeNames(task.assignees)}
          </small>
        ) : null}
        {rootProgress ? (
          <strong className={styles.taskProgress}>{rootProgress.percent}%</strong>
        ) : null}
        <em style={{ color: currentState?.color }}>{currentState?.label ?? statusLabels[task.statusKey]}</em>
      </button>
      {isExpanded
        ? task.children?.map((child) => (
            <TaskNode
              key={child.id}
              task={child}
              depth={depth + 1}
              selectedTaskId={selectedTaskId}
              states={states}
              expandedTaskIds={expandedTaskIds}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))
        : null}
    </div>
  );
}

function buildClientTaskTree(tasks: Task[]): Task[] {
  const nodes = new Map<string, Task>();
  const roots: Task[] = [];

  for (const task of tasks) {
    nodes.set(task.id, { ...task, children: [] });
  }

  for (const task of tasks) {
    const node = nodes.get(task.id);
    if (!node) continue;
    if (task.parentId && nodes.has(task.parentId)) {
      nodes.get(task.parentId)?.children?.push(node);
    } else {
      roots.push(node);
    }
  }

  sortClientTree(roots);
  return roots;
}

function sortClientTree(nodes: Task[]) {
  nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  for (const node of nodes) {
    if (node.children) sortClientTree(node.children);
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(new Date(value));
}

function toDateInput(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function toDateTimeInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function createProjectDraft(project: Project | null) {
  return createProjectFormDraft(project);
}

function createTaskDraft(task: Task | null) {
  return {
    id: task?.id ?? "",
    title: task?.title ?? "",
    description: task?.description ?? "",
    priority: task?.priority ?? ("medium" as Task["priority"]),
    dueDate: toDateInput(task?.dueDate ?? null),
    startTime: toDateTimeInput(task?.startTime ?? null),
    tags: task?.tags.join(", ") ?? "",
    projectId: task?.projectId ?? "",
    personnelIds: task?.assignees.map((person) => person.id) ?? [],
  };
}

function createEmptyRecurrenceDraft() {
  return {
    taskTitle: "",
    frequency: "weekly" as "daily" | "weekly" | "monthly" | "custom",
    startAt: todayDateInput(),
    endsAt: "",
  };
}

function recurrenceNextRunAt(draft: ReturnType<typeof createEmptyRecurrenceDraft>) {
  const startAt = fromDateInput(draft.startAt) ?? new Date().toISOString();

  return getNextOccurrenceFromStart({
    frequency: draft.frequency,
    interval: 1,
    startAt: new Date(startAt),
  }).toISOString();
}

function createEmptyRootTaskTemplateDraft(): RootTaskTemplateDraft {
  return {
    name: "",
    projectType: "安全测评",
    rootTitle: "报告编制",
    matchKeywords: "报告, 编制",
    nodes: [createRootTaskTemplateNodeDraft(null)],
    dependencies: [],
  };
}

function createRootTaskTemplateDraft(template: RootTaskTemplate): RootTaskTemplateDraft {
  const draft = {
    name: template.name,
    projectType: template.projectType ?? "",
    rootTitle: template.rootTitle,
    matchKeywords: template.matchKeywords.join(", "),
    nodes: flattenRootTaskTemplateNodes(template.nodes).map((node) => ({
      localId: node.id,
      parentId: node.parentId,
      title: node.title,
      defaultStatusKey: node.defaultStatusKey,
      priority: node.priority,
      positionX: node.positionX,
      positionY: node.positionY,
      tags: node.tags.join(", "),
    })),
    dependencies: template.dependencies.map((dependency) => ({
      localId: dependency.id,
      fromNodeId: dependency.fromNodeId,
      toNodeId: dependency.toNodeId,
      type: dependency.type,
      label: dependency.label ?? "",
      sortOrder: dependency.sortOrder,
    })),
  };

  return shouldAutoLayoutRootTemplateDraft(draft) ? layoutRootTaskTemplateDraft(draft) : draft;
}

function createRootTaskTemplateNodeDraft(
  parentId: string | null,
  position: { positionX: number; positionY: number } = { positionX: 120, positionY: 90 },
): RootTaskTemplateNodeDraft {
  return {
    localId: createDraftNodeId(),
    parentId,
    title: "",
    defaultStatusKey: "todo",
    priority: "medium",
    positionX: position.positionX,
    positionY: position.positionY,
    tags: "",
  };
}

function createRootTaskTemplatePayload(draft: RootTaskTemplateDraft) {
  const titledNodes = draft.nodes.filter((node) => node.title.trim());
  const titledNodeIds = new Set(titledNodes.map((node) => node.localId));

  return {
    name: draft.name,
    projectType: draft.projectType,
    rootTitle: draft.rootTitle,
    matchKeywords: splitTagInput(draft.matchKeywords),
    nodes: titledNodes.map((node, index) => ({
      id: node.localId,
      title: node.title,
      parentId: node.parentId && titledNodeIds.has(node.parentId) ? node.parentId : null,
      defaultStatusKey: node.defaultStatusKey,
      priority: node.priority,
      sortOrder: index + 1,
      positionX: Math.round(node.positionX),
      positionY: Math.round(node.positionY),
      tags: splitTagInput(node.tags),
    })),
    dependencies: draft.dependencies
      .filter(
        (dependency) =>
          titledNodeIds.has(dependency.fromNodeId) &&
          titledNodeIds.has(dependency.toNodeId) &&
          dependency.fromNodeId !== dependency.toNodeId,
      )
      .map((dependency, index) => ({
        id: dependency.localId,
        fromNodeId: dependency.fromNodeId,
        toNodeId: dependency.toNodeId,
        type: dependency.type,
        label: dependency.label.trim() || null,
        sortOrder: index + 1,
      })),
  };
}

const rootTemplateNodeSize = { width: 190, height: 66 };
const rootTemplateDefaultViewport = { x: 28, y: 28, zoom: 0.76 };

function flowPointToScreen(point: { x: number; y: number }, viewport: Viewport) {
  return {
    x: viewport.x + point.x * viewport.zoom,
    y: viewport.y + point.y * viewport.zoom,
  };
}

function createRootTemplateFlowNodes(
  draft: RootTaskTemplateDraft,
  selectedNodeIds: Set<string> = new Set(),
): Node[] {
  return draft.nodes.map((node, index) => ({
    id: node.localId,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    selected: selectedNodeIds.has(node.localId),
    width: rootTemplateNodeSize.width,
    height: rootTemplateNodeSize.height,
    position: {
      x: Number.isFinite(node.positionX) ? node.positionX : 120 + index * 220,
      y: Number.isFinite(node.positionY) ? node.positionY : 90,
    },
    data: {
      label: (
        <div className={styles.flowNodeLabel}>
          <strong>{node.title || "未命名任务"}</strong>
          <span>{node.parentId ? "子任务" : "一级子任务"} · {priorityLabel(node.priority)}</span>
        </div>
      ),
    },
    style: {
      width: rootTemplateNodeSize.width,
      minHeight: rootTemplateNodeSize.height,
      border: "1px solid #bfdbfe",
      borderRadius: 8,
      background: "#ffffff",
      color: "#172033",
      boxShadow: "0 8px 18px rgba(37, 99, 235, 0.08)",
    },
  }));
}

function createRootTemplateFlowEdges(draft: RootTaskTemplateDraft): Edge[] {
  const nodeIds = new Set(draft.nodes.map((node) => node.localId));
  return draft.dependencies
    .filter(
      (dependency) =>
        nodeIds.has(dependency.fromNodeId) &&
        nodeIds.has(dependency.toNodeId) &&
        dependency.fromNodeId !== dependency.toNodeId,
    )
    .map((dependency) => {
      const isStrong = dependency.type === "strong_binding";
      return {
        id: dependency.localId,
        source: dependency.fromNodeId,
        target: dependency.toNodeId,
        type: "smoothstep",
        label: isStrong ? "强绑定" : dependency.label || "顺序",
        animated: isStrong,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: {
          stroke: isStrong ? "#dc2626" : "#2563eb",
          strokeWidth: isStrong ? 2.4 : 1.8,
          strokeDasharray: isStrong ? "7 4" : undefined,
        },
        labelStyle: {
          fill: isStrong ? "#991b1b" : "#1d4ed8",
          fontSize: 12,
          fontWeight: 700,
        },
        labelBgPadding: [6, 4] as [number, number],
        labelBgBorderRadius: 6,
        labelBgStyle: { fill: "#ffffff", fillOpacity: 0.88 },
      };
    });
}

function applyRootTemplateNodeChanges(
  draft: RootTaskTemplateDraft,
  changes: NodeChange[],
): RootTaskTemplateDraft {
  const nextFlowNodes = applyNodeChanges(changes, createRootTemplateFlowNodes(draft));
  const positionById = new Map(
    nextFlowNodes.map((node) => [
      node.id,
      {
        positionX: Math.round(node.position.x),
        positionY: Math.round(node.position.y),
      },
    ]),
  );

  return {
    ...draft,
    nodes: draft.nodes.map((node) => ({
      ...node,
      ...(positionById.get(node.localId) ?? {}),
    })),
  };
}

function isPositionNodeChange(change: NodeChange) {
  return change.type === "position";
}

function isSelectionNodeChange(
  change: NodeChange,
): change is NodeChange & { id: string; selected: boolean } {
  return change.type === "select";
}

function shouldAutoLayoutRootTemplateDraft(draft: RootTaskTemplateDraft) {
  return (
    draft.nodes.length > 1 &&
    draft.nodes.every(
      (node) => Math.abs(node.positionX) < 1 && Math.abs(node.positionY) < 1,
    )
  );
}

function layoutRootTaskTemplateDraft(draft: RootTaskTemplateDraft): RootTaskTemplateDraft {
  const nodeById = new Map(draft.nodes.map((node) => [node.localId, node]));
  const levelCache = new Map<string, number>();
  const getLevel = (node: RootTaskTemplateNodeDraft): number => {
    if (levelCache.has(node.localId)) return levelCache.get(node.localId) ?? 0;
    if (!node.parentId) {
      levelCache.set(node.localId, 0);
      return 0;
    }
    const parent = nodeById.get(node.parentId);
    const level = parent ? getLevel(parent) + 1 : 0;
    levelCache.set(node.localId, level);
    return level;
  };

  return {
    ...draft,
    nodes: draft.nodes.map((node, index) => ({
      ...node,
      positionX: 90 + index * 250,
      positionY: 70 + getLevel(node) * 125,
    })),
  };
}

function flattenRootTaskTemplateNodes(
  nodes: RootTaskTemplateNode[],
  level = 0,
): Array<RootTaskTemplateNode & { level: number }> {
  return nodes.flatMap((node) => [
    { ...node, level },
    ...flattenRootTaskTemplateNodes(node.children ?? [], level + 1),
  ]);
}

function collectDraftNodeDescendants(nodes: RootTaskTemplateNodeDraft[], localId: string) {
  const deletedIds = new Set([localId]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (node.parentId && deletedIds.has(node.parentId) && !deletedIds.has(node.localId)) {
        deletedIds.add(node.localId);
        changed = true;
      }
    }
  }

  return deletedIds;
}

function isDraftNodeDescendant(
  nodes: RootTaskTemplateNodeDraft[],
  rootId: string,
  candidateId: string,
) {
  const nodeById = new Map(nodes.map((node) => [node.localId, node]));
  let current = nodeById.get(candidateId);

  while (current?.parentId) {
    if (current.parentId === rootId) return true;
    current = nodeById.get(current.parentId);
  }

  return false;
}

let draftNodeCounter = 0;
let draftEdgeCounter = 0;

function createDraftNodeId() {
  draftNodeCounter += 1;
  return globalThis.crypto?.randomUUID?.() ?? `draft-node-${Date.now()}-${draftNodeCounter}`;
}

function createDraftEdgeId() {
  draftEdgeCounter += 1;
  return globalThis.crypto?.randomUUID?.() ?? `draft-edge-${Date.now()}-${draftEdgeCounter}`;
}

function fromDateInput(value: string) {
  return value ? `${value}T00:00:00.000Z` : null;
}

function fromDateTimeInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function splitTagInput(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function recommendRootTaskTemplates(project: Project, templates: RootTaskTemplate[]) {
  const projectText = normalizeTemplateMatchText(
    [project.name, project.description, project.projectType, ...project.tags].filter(Boolean).join(" "),
  );
  const projectType = normalizeTemplateMatchText(project.projectType ?? "");

  return templates
    .map((template) => {
      const reasons: string[] = [];
      let score = 0;

      if (
        projectType &&
        normalizeTemplateMatchText(template.projectType ?? "") === projectType
      ) {
        score += 60;
        reasons.push("项目类型匹配");
      }

      const rootTitle = normalizeTemplateMatchText(template.rootTitle);
      if (rootTitle && projectText.includes(rootTitle)) {
        score += 25;
        reasons.push("根任务标题匹配");
      }

      for (const keyword of template.matchKeywords) {
        const normalizedKeyword = normalizeTemplateMatchText(keyword);
        if (normalizedKeyword && projectText.includes(normalizedKeyword)) {
          score += 15;
          reasons.push(`关键词：${keyword}`);
        }
      }

      if (!template.projectType) {
        score += 5;
        reasons.push("通用模板");
      }

      return { template, score, reasons };
    })
    .filter((recommendation) => recommendation.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.template.createdOrder - a.template.createdOrder ||
        a.template.name.localeCompare(b.template.name, "zh-CN"),
    );
}

function normalizeTemplateMatchText(value: string) {
  return value.trim().toLowerCase();
}

function parseWorkflowStateInput(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [key = "", label = "", color = "#64748b", marker = ""] = line.split(":");
      return {
        key: key.trim(),
        label: label.trim(),
        color: color.trim() || "#64748b",
        isDefault: marker.trim() === "default",
        isCompleted: marker.trim() === "done",
      };
    })
    .filter((state) => state.key && state.label);
}

function todayDateInput() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function frequencyLabel(frequency: string, interval: number) {
  const unit = frequency === "weekly" ? "周" : frequency === "monthly" ? "月" : "天";
  return `每 ${interval} ${unit}`;
}

function sourceLabel(source: Task["sourceType"]) {
  return source === "project" ? "项目任务" : source === "recurring" ? "周期任务" : "临时任务";
}

function priorityLabel(priority: Task["priority"]) {
  return priority === "high" ? "高优先级" : priority === "low" ? "低优先级" : "中优先级";
}
