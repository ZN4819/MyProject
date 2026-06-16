export type Project = {
  id: string;
  name: string;
  description: string | null;
  projectType: string | null;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  tags: string[];
  sortOrder: number;
  archived: boolean;
  workflowTemplateId: string | null;
  projectSetId: string | null;
};

export type ProjectSetStatus = "not_started" | "active" | "paused" | "done";

export type ProjectSet = {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectSetSummary = ProjectSet & {
  projectCount: number;
  progress: number;
  status: ProjectSetStatus;
  startDate: string | null;
  endDate: string | null;
};

export type TaskSourceType = "project" | "recurring" | "temporary";

export type Personnel = {
  id: string;
  name: string;
  certificateNumber: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskAssignee = Personnel;

export type Task = {
  id: string;
  title: string;
  description: string | null;
  sourceType: TaskSourceType;
  priority: "low" | "medium" | "high";
  statusKey: string;
  dueDate: string | null;
  startTime: string | null;
  completedAt: string | null;
  sortOrder: number;
  tags: string[];
  projectId: string | null;
  parentId: string | null;
  templateNodeId?: string | null;
  assignees: TaskAssignee[];
  children?: Task[];
};

export type WorkflowState = {
  id: string;
  workflowTemplateId: string;
  key: string;
  label: string;
  color: string;
  sortOrder: number;
  isDefault: boolean;
  isCompleted: boolean;
};

export type WorkflowTemplate = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  states: WorkflowState[];
};

export type TaskTreeTemplate = {
  id: string;
  name: string;
  description: string | null;
  projectType: string | null;
  matchKeywords: string[];
  workflowTemplateId: string | null;
  nodes: TaskTemplateNode[];
  dependencies: TaskTemplateDependency[];
};

export type TaskTemplateNode = {
  id: string;
  templateId: string;
  title: string;
  description: string | null;
  parentId: string | null;
  workflowTemplateId: string | null;
  defaultStatusKey: string;
  priority: Task["priority"];
  sortOrder: number;
  tags: string[];
  children?: TaskTemplateNode[];
};

export type TaskTemplateDependency = {
  id: string;
  templateId: string;
  fromNodeId: string;
  toNodeId: string;
  type: "finish_to_start";
};

export type TaskDependencyType = "finish_to_start" | "strong_binding";

export type TaskDependency = {
  id: string;
  projectId: string;
  fromTaskId: string;
  toTaskId: string;
  type: TaskDependencyType;
};

export type TaskTreeTemplateRecommendation = {
  template: TaskTreeTemplate;
  score: number;
  reasons: string[];
};

export type RootTaskTemplate = {
  id: string;
  name: string;
  description: string | null;
  projectType: string | null;
  rootTitle: string;
  matchKeywords: string[];
  createdOrder: number;
  nodes: RootTaskTemplateNode[];
  dependencies: RootTaskTemplateDependency[];
};

export type RootTaskTemplateNode = {
  id: string;
  templateId: string;
  title: string;
  description: string | null;
  parentId: string | null;
  defaultStatusKey: string;
  priority: Task["priority"];
  sortOrder: number;
  positionX: number;
  positionY: number;
  tags: string[];
  children?: RootTaskTemplateNode[];
};

export type RootTaskTemplateDependency = {
  id: string;
  templateId: string;
  fromNodeId: string;
  toNodeId: string;
  type: "sequence" | "strong_binding";
  label: string | null;
  sortOrder: number;
};

export type RecurrenceRule = {
  id: string;
  taskId: string;
  frequency: "daily" | "weekly" | "monthly" | "custom";
  interval: number;
  startAt: string;
  nextRunAt: string;
  endsAt: string | null;
  paused: boolean;
  taskTitle: string;
};

export type DashboardData = {
  projectSets: ProjectSetSummary[];
  projects: Array<Project & { progress: number; taskCount: number }>;
  tasks: Task[];
  taskTree: Task[];
  temporaryTasks: Task[];
  todayTasks: Task[];
  upcomingTasks: Task[];
  recurringRules: RecurrenceRule[];
  workflows: WorkflowTemplate[];
  taskTreeTemplates: TaskTreeTemplate[];
  rootTaskTemplates: RootTaskTemplate[];
  taskDependencies: TaskDependency[];
  personnel: Personnel[];
  safetyInfo: {
    databasePath: string;
    backupDirectory: string | null;
    counts: {
      projectSets: number;
      projects: number;
      tasks: number;
      workflows: number;
      taskTreeTemplates: number;
      recurrenceRules: number;
      personnel: number;
    };
  };
  stats: {
    activeProjects: number;
    todayTasks: number;
    temporaryTasks: number;
    recurringRules: number;
    completedTasks: number;
    totalTasks: number;
  };
};
