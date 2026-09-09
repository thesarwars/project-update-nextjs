"use client";

import {
  LuArrowDownToLine,
  LuChevronLeft,
  LuChevronRight,
  LuPanelLeftClose,
  LuPanelLeftOpen,
} from "react-icons/lu";
import ViewToolbar from "./shell/ViewToolbar";
import { Button, IconButton } from "./ui";
import { relativeDayLabel, weekdayName } from "@/lib/date";

interface Props {
  date: string;
  onDateChange: (date: string) => void;
  onStepDate: (delta: number) => void;
  onToday: () => void;
  isToday: boolean;
  carryFrom: string | null;
  onCarryOver: () => void;
  showPrevious: boolean;
  onTogglePrevious: () => void;
}

/**
 * The standup's own toolbar, in the same slot every view uses. Project switching, the
 * save badge and the account menu live in the global bar above this.
 */
export default function StandupToolbar({
  date,
  onDateChange,
  onStepDate,
  onToday,
  isToday,
  carryFrom,
  onCarryOver,
  showPrevious,
  onTogglePrevious,
}: Props) {
  return (
    <ViewToolbar>
      <h1 className="mr-1 text-[13px] font-semibold">Standup</h1>

      <div className="flex items-center gap-1">
        <IconButton label="Previous day" size="sm" onClick={() => onStepDate(-1)}>
          <LuChevronLeft className="h-4 w-4" />
        </IconButton>
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
          title={carryFrom ? `Fill empty ToDo fields from ${carryFrom}` : "Nothing earlier to carry over"}
        >
          <LuArrowDownToLine className="h-3.5 w-3.5" />
          Carry over
        </Button>
      </div>
    </ViewToolbar>
  );
}
