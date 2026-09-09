/** The sections each person fills in, in the order they appear in the update. */
export const SECTION_KEYS = ["done", "todo", "dependency", "remarks"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const DEFAULT_LABELS: Record<SectionKey, string> = {
  done: "Done",
  todo: "ToDo",
  dependency: "Dependency",
  remarks: "Remarks",
};

export interface Person {
  id: string;
  name: string;
  /** Inactive people keep their history but are hidden from the composer and output. */
  active: boolean;
}

export interface Project {
  id: string;
  name: string;
  /** `{project}` is replaced with the project name, `{date}` with the display date. */
  titleTemplate: string;
  labels: Record<SectionKey, string>;
  people: Person[];
  createdAt: string;
}

/** Raw editor text per section: one item per line, `- ` prefixed; indented lines continue the item above. */
export type EntryText = Record<SectionKey, string>;

export interface Entry extends EntryText {
  updatedAt: string;
}

export const DEFAULT_TITLE_TEMPLATE = "Daily Standup Update – {project}";

export const emptyEntry = (): Entry => ({
  done: "",
  todo: "",
  dependency: "",
  remarks: "",
  updatedAt: "",
});

export const isBlankEntry = (entry: Entry | undefined): boolean =>
  !entry || SECTION_KEYS.every((key) => !entry[key].trim());

/* ------------------------------------------------------------------ *
 * Accounts
 * ------------------------------------------------------------------ */

export const ROLES = ["admin", "member"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Deliberately two roles, not three. In a team this size a "viewer" is a manager with
 * nothing assigned — a third global role taxes every permission check and is wrong the
 * first time they want to comment. Read-only, if it is ever needed, belongs on the
 * per-project membership rather than on the account.
 */
export const USER_STATUSES = ["active", "invited", "disabled"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  /** False until the account has a password — an invited user cannot sign in yet. */
  hasPassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface Session {
  id: string;
  userId: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

export interface Invite {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  personId: string | null;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
}

/* ------------------------------------------------------------------ *
 * Issues
 * ------------------------------------------------------------------ */

export const ISSUE_TYPES = ["epic", "story", "task", "bug", "subtask"] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

/**
 * Which types may be a given type's parent.
 *
 * `bug` shares a level with `task` and has the same parents — anywhere a task is legal, a
 * bug is. They differ only in children: a bug may parent tasks, bugs and subtasks, while
 * a task parents only subtasks, because a task under a task *is* a subtask.
 *
 * `bug -> bug` makes this graph cyclic, which is exactly why the hierarchy cannot be
 * encoded in table structure and lives in data instead.
 */
export const PARENT_RULES: Record<IssueType, readonly IssueType[]> = {
  epic: [],
  story: ["epic"],
  task: ["story", "epic", "bug"],
  bug: ["story", "epic", "bug"],
  subtask: ["task", "bug"],
};

/** Types that may sit at the top of the tree with no parent. */
export const ROOT_TYPES: readonly IssueType[] = ["epic", "story", "task", "bug"];

/**
 * `bug -> bug` is unbounded from the rules alone, so nesting is capped explicitly.
 * This is the deepest allowed *depth value*, and a root is depth 0 — so seven levels,
 * which is already past anything a team this size should be building.
 */
export const MAX_DEPTH = 6;

export const ISSUE_TYPE_META: Record<
  IssueType,
  { label: string; level: number; sortOrder: number }
> = {
  epic: { label: "Epic", level: 1, sortOrder: 0 },
  story: { label: "Story", level: 2, sortOrder: 1 },
  task: { label: "Task", level: 3, sortOrder: 2 },
  bug: { label: "Bug", level: 3, sortOrder: 3 },
  subtask: { label: "Subtask", level: 4, sortOrder: 4 },
};

export const STATUS_CATEGORIES = ["todo", "in_progress", "done"] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

/**
 * `isDone` is the only thing completion arithmetic ever reads — no query compares a
 * status *name*. That is what lets "Won't do" close an issue, and lets a project rename
 * "Done" to "Shipped" without touching a line of SQL.
 */
export const DEFAULT_STATUSES = [
  { name: "To do", category: "todo", isDone: false, isDefault: true, color: "#666b74" },
  { name: "In progress", category: "in_progress", isDone: false, isDefault: false, color: "#2563eb" },
  { name: "In review", category: "in_progress", isDone: false, isDefault: false, color: "#7c3aed" },
  { name: "Blocked", category: "in_progress", isDone: false, isDefault: false, color: "#c93b3b" },
  { name: "Done", category: "done", isDone: true, isDefault: false, color: "#0a8354" },
  { name: "Won't do", category: "done", isDone: true, isDefault: false, color: "#666b74" },
] as const satisfies readonly {
  name: string;
  category: StatusCategory;
  isDone: boolean;
  isDefault: boolean;
  color: string;
}[];

export interface Status {
  id: string;
  projectId: string;
  name: string;
  category: StatusCategory;
  isDone: boolean;
  isDefault: boolean;
  color: string;
  sortOrder: number;
}

export const PRIORITIES = [1, 2, 3, 4, 5] as const;
export const PRIORITY_LABELS: Record<number, string> = {
  1: "Highest",
  2: "High",
  3: "Medium",
  4: "Low",
  5: "Lowest",
};

export interface Issue {
  id: string;
  projectId: string;
  /** Rendered with the project key as `GS-142`; stored as an integer. */
  number: number;
  key: string;
  type: IssueType;
  parentId: string | null;
  statusId: string;
  title: string;
  description: string;
  /** A roster row, not an account — so someone who has not signed up is still assignable. */
  assigneePersonId: string | null;
  reporterUserId: string | null;
  priority: number;
  estimate: number | null;
  rank: string;
  /** `/id/id/` of every ancestor. Derived from parentId, never edited directly. */
  path: string;
  depth: number;
  rootId: string;
  /** Bumped on every edit, so two people saving the same field cannot silently overwrite. */
  version: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  archivedAt: string | null;
}

/* ------------------------------------------------------------------ *
 * Sprints
 * ------------------------------------------------------------------ */

export const SPRINT_STATES = ["planned", "active", "closed"] as const;
export type SprintState = (typeof SPRINT_STATES)[number];

/**
 * Which types may sit in more than one open sprint at a time.
 *
 * An epic legitimately spans sprints — that is the whole reason scope is a join table.
 * Task-level work does not: it is either being done now or it is not, so adding it to a
 * second sprint moves it rather than duplicating it.
 */
export const MULTI_SPRINT_TYPES: readonly IssueType[] = ["epic", "story"];

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal: string;
  durationUnit: "days" | "weeks" | "months" | "years";
  durationCount: number;
  startDate: string | null;
  endDate: string | null;
  state: SprintState;
  closedAt: string | null;
  sortOrder: number;
}

/** Set versus completed, per issue type — derived, never stored while a sprint is open. */
export interface SprintCount {
  type: IssueType;
  set: number;
  completed: number;
  inProgress: number;
}

/** An epic's progress *within one sprint*, separate from whether the epic itself is done. */
export interface SprintEpicProgress {
  issueId: string;
  inSprintChildren: number;
  inSprintDone: number;
}
