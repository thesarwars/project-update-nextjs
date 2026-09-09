import type { IssueType } from "@/lib/types";

/**
 * The one component allowed to draw an issue type, so the backlog, the tree, the board
 * and the detail pane can never disagree about what a bug looks like.
 *
 * Squares are plan items, a circle is a defect. That shape family is the real signal:
 * it is what makes a bug nested under a bug read differently from a subtask at a glance,
 * and it keeps working in greyscale and for anyone who cannot separate red from blue.
 * A subtask is a hollow square in the task's own hue, because a subtask *is* a task.
 */
const COLOR: Record<IssueType, string> = {
  epic: "var(--type-epic)",
  story: "var(--type-story)",
  task: "var(--type-task)",
  subtask: "var(--type-subtask)",
  bug: "var(--type-bug)",
};

const LABEL: Record<IssueType, string> = {
  epic: "Epic",
  story: "Story",
  task: "Task",
  subtask: "Subtask",
  bug: "Bug",
};

export default function IssueTypeIcon({
  type,
  size = 14,
  className = "",
}: {
  type: IssueType;
  size?: number;
  className?: string;
}) {
  const color = COLOR[type];
  const common = { width: size, height: size, viewBox: "0 0 16 16", className, role: "img" as const };

  if (type === "bug") {
    return (
      <svg {...common} aria-label={LABEL.bug}>
        <title>{LABEL.bug}</title>
        <circle cx="8" cy="8" r="6" fill={color} />
      </svg>
    );
  }

  if (type === "epic") {
    return (
      <svg {...common} aria-label={LABEL.epic}>
        <title>{LABEL.epic}</title>
        <rect x="2" y="2" width="12" height="12" rx="3" fill={color} />
      </svg>
    );
  }

  if (type === "story") {
    return (
      <svg {...common} aria-label={LABEL.story}>
        <title>{LABEL.story}</title>
        <rect x="2" y="2" width="12" height="12" rx="3" fill={color} />
        <g stroke="#fff" strokeWidth="1.3" strokeLinecap="round">
          <path d="M5 6.4h6M5 9.6h4" />
        </g>
      </svg>
    );
  }

  if (type === "task") {
    return (
      <svg {...common} aria-label={LABEL.task}>
        <title>{LABEL.task}</title>
        <rect x="2" y="2" width="12" height="12" rx="3" fill={color} />
        <path
          d="M5 8.2l2 2 4-4"
          fill="none"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg {...common} aria-label={LABEL.subtask}>
      <title>{LABEL.subtask}</title>
      <rect
        x="2.8"
        y="2.8"
        width="10.4"
        height="10.4"
        rx="2.6"
        fill="none"
        stroke={color}
        strokeWidth="1.8"
      />
    </svg>
  );
}

/**
 * Named only when the nesting is unusual for the parent's type.
 *
 * Silence means "as expected", so the shapes you asked about — a bug under a bug, a task
 * under a bug — are exactly the ones that speak.
 */
export function relationshipLabel(
  parentType: IssueType | null,
  childType: IssueType,
): string | null {
  if (!parentType) return null;
  const expected: Partial<Record<IssueType, IssueType[]>> = {
    epic: ["story"],
    story: ["task", "bug"],
    task: ["subtask"],
    bug: ["subtask"],
  };
  if (expected[parentType]?.includes(childType)) return null;
  if (parentType === "bug" && childType === "bug") return "sub-bug";
  if (parentType === "bug" && childType === "task") return "fix task";
  if (parentType === childType) return `sub-${childType}`;
  return null;
}
