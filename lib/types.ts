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
