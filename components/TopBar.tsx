"use client";

import {
  LuArrowDownToLine,
  LuChevronLeft,
  LuChevronRight,
  LuPlus,
  LuSettings,
  LuUsers,
} from "react-icons/lu";
import { Button, IconButton } from "./ui";
import { relativeDayLabel, weekdayName } from "@/lib/date";
import type { Project } from "@/lib/types";

export type SaveState = "idle" | "saving" | "saved" | "error";

interface Props {
  projects: Project[];
  projectId: string;
  onProjectChange: (id: string) => void;
  onNewProject: () => void;
  date: string;
  onDateChange: (date: string) => void;
  onStepDate: (delta: number) => void;
  onToday: () => void;
  isToday: boolean;
  carryFrom: string | null;
  onCarryOver: () => void;
  onManagePeople: () => void;
  onOpenSettings: () => void;
  saveState: SaveState;
}

export default function TopBar({
  projects,
  projectId,
  onProjectChange,
  onNewProject,
  date,
  onDateChange,
  onStepDate,
  onToday,
  isToday,
  carryFrom,
  onCarryOver,
  onManagePeople,
  onOpenSettings,
  saveState,
}: Props) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <span className="text-[13px] font-semibold tracking-tight">Standup</span>

        <div className="flex items-center gap-1">
          <label className="sr-only" htmlFor="project-select">
            Project
          </label>
          <select
            id="project-select"
            value={projectId}
            onChange={(e) => onProjectChange(e.target.value)}
            className="h-8 max-w-[220px] rounded-lg border border-line bg-surface px-2 text-[13px] font-medium text-foreground outline-none focus:border-accent"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <IconButton label="New project" variant="ghost" size="sm" onClick={onNewProject}>
            <LuPlus className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="flex items-center gap-1">
          <IconButton label="Previous day" size="sm" onClick={() => onStepDate(-1)}>
            <LuChevronLeft className="h-4 w-4" />
          </IconButton>
          <div className="relative">
            <label className="sr-only" htmlFor="date-input">
              Date
            </label>
            <input
              id="date-input"
              type="date"
              value={date}
              onChange={(e) => e.target.value && onDateChange(e.target.value)}
              className="h-8 rounded-lg border border-line bg-surface px-2 text-[13px] tabular-nums text-foreground outline-none focus:border-accent"
            />
          </div>
          <IconButton label="Next day" size="sm" onClick={() => onStepDate(1)}>
            <LuChevronRight className="h-4 w-4" />
          </IconButton>
          <Button size="sm" onClick={onToday} disabled={isToday} className="ml-0.5">
            Today
          </Button>
          <span className="ml-1 hidden text-[11px] text-muted sm:inline">
            {relativeDayLabel(date) === weekdayName(date)
              ? weekdayName(date)
              : `${relativeDayLabel(date)} · ${weekdayName(date)}`}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <SaveBadge state={saveState} />
          <Button
            size="sm"
            onClick={onCarryOver}
            disabled={!carryFrom}
            title={
              carryFrom
                ? `Fill empty ToDo fields from ${carryFrom}`
                : "Nothing earlier to carry over"
            }
          >
            <LuArrowDownToLine className="h-3.5 w-3.5" />
            Carry over
          </Button>
          <Button size="sm" onClick={onManagePeople}>
            <LuUsers className="h-3.5 w-3.5" />
            People
          </Button>
          <IconButton label="Project settings" size="sm" onClick={onOpenSettings}>
            <LuSettings className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
    </header>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const map = {
    saving: { text: "Saving…", color: "text-muted", dot: "bg-muted" },
    saved: { text: "Saved", color: "text-muted", dot: "bg-success" },
    error: { text: "Save failed", color: "text-danger", dot: "bg-danger" },
  } as const;
  const s = map[state];
  return (
    <span className={`mr-1 inline-flex items-center gap-1.5 text-[11px] ${s.color}`} role="status">
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.text}
    </span>
  );
}
