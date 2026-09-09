"use client";

import {
  LuArrowDownToLine,
  LuPanelLeftClose,
  LuPanelLeftOpen,
  LuChevronLeft,
  LuChevronRight,
  LuPlus,
  LuLogOut,
  LuSettings,
  LuUsers,
} from "react-icons/lu";
import { Button, IconButton, SaveBadge, type SaveState } from "./ui";
import { relativeDayLabel, weekdayName } from "@/lib/date";
import type { Project } from "@/lib/types";

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
  showPrevious: boolean;
  onTogglePrevious: () => void;
  onManagePeople: () => void;
  onOpenSettings: () => void;
  saveState: SaveState;
  currentUser: { id: string; name: string; role: string };
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
  showPrevious,
  onTogglePrevious,
  onManagePeople,
  onOpenSettings,
  saveState,
  currentUser,
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
          <IconButton
            label={showPrevious ? "Hide the previous day" : "Show the previous day"}
            size="sm"
            onClick={onTogglePrevious}
            className={showPrevious ? "text-accent" : undefined}
          >
            {showPrevious ? (
              <LuPanelLeftClose className="h-4 w-4" />
            ) : (
              <LuPanelLeftOpen className="h-4 w-4" />
            )}
          </IconButton>
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
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          <span className="flex items-center gap-1.5" title={currentUser.name}>
            <Avatar name={currentUser.name} />
            <span className="hidden max-w-[110px] truncate text-[12.5px] font-medium sm:inline">
              {currentUser.name}
            </span>
          </span>
          <form action="/api/auth/logout" method="post">
            <IconButton label="Sign out" type="submit" variant="ghost" size="sm">
              <LuLogOut className="h-4 w-4" />
            </IconButton>
          </form>
        </div>
      </div>
    </header>
  );
}

/** Initials on a hue derived from the name, so people stay visually distinct. */
function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span
      aria-hidden
      className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white"
      style={{ background: `hsl(${hash} 52% 42%)` }}
    >
      {initials || "?"}
    </span>
  );
}
