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
