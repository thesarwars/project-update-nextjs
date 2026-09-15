import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSchedule,
  formatDuration,
  parseDuration,
  workdaysBetween,
  type WorkCalendar,
} from "../lib/schedule";
import type { Issue } from "../lib/types";

/**
 * The shape from the screenshot that prompted the feature: an epic, a story under it, a
 * task under that, and four subtasks under the task. Four 4h subtasks have to make the
 * task 16h — which is two days at an eight-hour day and 2d 2h at a seven-hour one — at
 * every level above them, and those hours have to land on working days.
 *
 * Pure, so there is no database here. `lib/schedule.ts` deliberately imports neither.
 */

const MON_TO_FRI: WorkCalendar = { hoursPerDay: 8, workingDays: [1, 2, 3, 4, 5] };
const SEVEN_HOUR_DAY: WorkCalendar = { hoursPerDay: 7, workingDays: [1, 2, 3, 4, 5] };
const SUN_TO_THU: WorkCalendar = { hoursPerDay: 8, workingDays: [0, 1, 2, 3, 4] };

const MONDAY = "2026-09-14";
const FRIDAY = "2026-09-18";
const NEXT_MONDAY = "2026-09-21";

let seq = 0;

function issue(partial: Partial<Issue> & { id: string }): Issue {
  seq += 1;
  return {
    projectId: "prj",
    number: seq,
    key: `GS-${seq}`,
    type: "subtask",
    parentId: null,
    statusId: "sts",
    title: partial.id,
    description: "",
    assigneePersonId: null,
    reporterUserId: null,
    priority: 3,
    estimate: null,
    startDate: null,
    dueDate: null,
    rank: "m",
    boardRank: null,
    path: "/",
    depth: 0,
    rootId: partial.id,
    version: 1,
    createdAt: "",
    updatedAt: "",
    resolvedAt: null,
    archivedAt: null,
    ...partial,
  };
}

/** epic -> story -> task -> four subtasks, each subtask taking `hours`. */
function tree(hours: (number | null)[], extra: Partial<Issue>[] = []): Issue[] {
  const epic = issue({ id: "epic", type: "epic", rank: "a" });
  const story = issue({ id: "story", type: "story", parentId: "epic", rank: "a" });
  const task = issue({ id: "task", type: "task", parentId: "story", rank: "a" });
  const subtasks = hours.map((estimate, i) =>
    issue({
      id: `sub${i}`,
      type: "subtask",
      parentId: "task",
      rank: String.fromCharCode(97 + i),
      estimate,
      ...extra[i],
    }),
  );
  return [epic, story, task, ...subtasks];
}

describe("parseDuration", () => {
  it("reads hours, days and both together, against the project's working day", () => {
    assert.equal(parseDuration("4h", MON_TO_FRI), 4);
    assert.equal(parseDuration("2d", MON_TO_FRI), 16);
    assert.equal(parseDuration("1d 4h", MON_TO_FRI), 12);
    assert.equal(parseDuration("1.5h", MON_TO_FRI), 1.5);
    assert.equal(parseDuration("2 days", MON_TO_FRI), 16);
    // A bare number is hours, which is what someone typing "4" means.
    assert.equal(parseDuration("4", MON_TO_FRI), 4);
    // The same text is a different number of hours on a seven-hour day.
    assert.equal(parseDuration("2d", SEVEN_HOUR_DAY), 14);
  });

  it("refuses anything it cannot account for in full", () => {
    assert.equal(parseDuration("", MON_TO_FRI), null);
    assert.equal(parseDuration("soon", MON_TO_FRI), null);
    assert.equal(parseDuration("-4h", MON_TO_FRI), null);
    assert.equal(parseDuration("4x", MON_TO_FRI), null);
    // Half of this parses. Storing 1d and dropping the rest would be worse than refusing.
    assert.equal(parseDuration("1d and a bit", MON_TO_FRI), null);
  });
});

describe("formatDuration", () => {
  it("spells hours as days once they fill one", () => {
    assert.equal(formatDuration(4, MON_TO_FRI), "4h");
    assert.equal(formatDuration(8, MON_TO_FRI), "1d");
    assert.equal(formatDuration(16, MON_TO_FRI), "2d");
    assert.equal(formatDuration(20, MON_TO_FRI), "2d 4h");
    assert.equal(formatDuration(0, MON_TO_FRI), "0h");
  });

  it("uses the project's working day, so the same hours read differently", () => {
    assert.equal(formatDuration(16, SEVEN_HOUR_DAY), "2d 2h");
    assert.equal(formatDuration(14, SEVEN_HOUR_DAY), "2d");
  });

  it("round-trips with parseDuration", () => {
    for (const hours of [1, 4, 8, 12, 16, 20, 37.5]) {
      assert.equal(parseDuration(formatDuration(hours, MON_TO_FRI), MON_TO_FRI), hours);
      assert.equal(parseDuration(formatDuration(hours, SEVEN_HOUR_DAY), SEVEN_HOUR_DAY), hours);
    }
  });
});

describe("buildSchedule", () => {
  it("adds four 4h subtasks up at every level above them", () => {
    const schedule = buildSchedule(tree([4, 4, 4, 4]), {
      calendar: MON_TO_FRI,
      startDate: MONDAY,
    });

    for (const id of ["task", "story", "epic"]) {
      assert.equal(schedule[id].hours, 16, id);
      assert.equal(schedule[id].rolledUp, true, id);
      assert.equal(formatDuration(schedule[id].hours, MON_TO_FRI), "2d", id);
    }
    assert.equal(schedule.sub0.rolledUp, false);
    assert.equal(formatDuration(schedule.task.hours, SEVEN_HOUR_DAY), "2d 2h");
  });

  it("runs the subtasks one after another, two to a day", () => {
    const schedule = buildSchedule(tree([4, 4, 4, 4]), {
      calendar: MON_TO_FRI,
      startDate: MONDAY,
    });

    assert.deepEqual(
      ["sub0", "sub1", "sub2", "sub3"].map((id) => [schedule[id].start, schedule[id].end]),
      [
        [MONDAY, MONDAY],
        [MONDAY, MONDAY],
        ["2026-09-15", "2026-09-15"],
        ["2026-09-15", "2026-09-15"],
      ],
    );
    // The parents span their children rather than being scheduled themselves.
    assert.equal(schedule.epic.start, MONDAY);
    assert.equal(schedule.epic.end, "2026-09-15");
  });

  it("steps over days that are not worked", () => {
    const schedule = buildSchedule(tree([4, 4, 4, 4]), {
      calendar: MON_TO_FRI,
      startDate: FRIDAY,
    });
    assert.equal(schedule.task.start, FRIDAY);
    assert.equal(schedule.task.end, NEXT_MONDAY);

    // Same work, a Sunday-to-Thursday week: Friday is not worked, so it starts Sunday.
    const elsewhere = buildSchedule(tree([4, 4, 4, 4]), {
      calendar: SUN_TO_THU,
      startDate: FRIDAY,
    });
    assert.equal(elsewhere.task.start, "2026-09-20");
    assert.equal(elsewhere.task.end, "2026-09-21");
  });

  it("leaves an unestimated subtask out of the total and says so", () => {
    const schedule = buildSchedule(tree([4, 4, null, 4]), {
      calendar: MON_TO_FRI,
      startDate: MONDAY,
    });
    assert.equal(schedule.task.hours, 12);
    assert.equal(schedule.task.unestimated, 1);
    assert.equal(schedule.epic.unestimated, 1);
    // It takes no time at all rather than a guessed default, so it gets no dates either.
    assert.equal(schedule.sub2.start, null);
  });

  it("ignores a parent's own estimate while it has children", () => {
    const issues = tree([4, 4, 4, 4]);
    const task = issues.find((i) => i.id === "task")!;
    task.estimate = 100;

    const schedule = buildSchedule(issues, { calendar: MON_TO_FRI, startDate: MONDAY });
    assert.equal(schedule.task.hours, 16);

    // Take the children away and the typed value is what is left.
    const alone = buildSchedule([issues[0], issues[1], task], {
      calendar: MON_TO_FRI,
      startDate: MONDAY,
    });
    assert.equal(alone.task.hours, 100);
    assert.equal(alone.task.rolledUp, false);
  });

  it("pushes a branch forward when an issue is pinned, and never backwards", () => {
    const pinned = buildSchedule(tree([4, 4, 4, 4], [{}, {}, { startDate: NEXT_MONDAY }]), {
      calendar: MON_TO_FRI,
      startDate: MONDAY,
    });
    assert.equal(pinned.sub1.end, MONDAY);
    assert.equal(pinned.sub2.start, NEXT_MONDAY);
    // Everything queued behind the pin moves with it.
    assert.equal(pinned.sub3.start, NEXT_MONDAY);
    assert.equal(pinned.task.end, NEXT_MONDAY);

    // A pin in the past is ignored: it can delay work, not rewind the queue.
    const backwards = buildSchedule(tree([4, 4, 4, 4], [{}, {}, { startDate: "2026-01-05" }]), {
      calendar: MON_TO_FRI,
      startDate: MONDAY,
    });
    assert.equal(backwards.sub2.start, "2026-09-15");
  });

  it("flags an issue whose projection lands after its due date", () => {
    const issues = tree([4, 4, 4, 4]);
    const task = issues.find((i) => i.id === "task")!;
    task.dueDate = MONDAY;

    const late = buildSchedule(issues, { calendar: MON_TO_FRI, startDate: MONDAY });
    assert.equal(late.task.end, "2026-09-15");
    assert.equal(late.task.late, true);
    // The due date is a comparison, never a clamp — the projection is left alone.
    assert.equal(late.task.hours, 16);

    task.dueDate = "2026-09-30";
    assert.equal(buildSchedule(issues, { calendar: MON_TO_FRI, startDate: MONDAY }).task.late, false);
  });

  it("queues separate roots one after the other, in backlog order", () => {
    const first = issue({ id: "first", type: "task", rank: "a", estimate: 8 });
    const second = issue({ id: "second", type: "task", rank: "b", estimate: 8 });

    const schedule = buildSchedule([second, first], {
      calendar: MON_TO_FRI,
      startDate: MONDAY,
    });
    assert.equal(schedule.first.start, MONDAY);
    assert.equal(schedule.second.start, "2026-09-15");
  });

  it("packs work into part of a day rather than rounding up to whole ones", () => {
    const schedule = buildSchedule(tree([2, 2, 2, 2]), {
      calendar: MON_TO_FRI,
      startDate: MONDAY,
    });
    assert.equal(schedule.task.hours, 8);
    assert.equal(schedule.task.start, MONDAY);
    assert.equal(schedule.task.end, MONDAY);
  });
});

describe("workdaysBetween", () => {
  it("counts only the days the project works", () => {
    assert.equal(workdaysBetween(MONDAY, "2026-09-25", MON_TO_FRI), 10);
    // The same fortnight is a day shorter on a Sunday-to-Thursday week: it ends on a
    // Friday, which that week does not work.
    assert.equal(workdaysBetween(MONDAY, "2026-09-25", SUN_TO_THU), 9);
    assert.equal(workdaysBetween(MONDAY, MONDAY, MON_TO_FRI), 1);
    assert.equal(workdaysBetween("2026-09-19", "2026-09-20", MON_TO_FRI), 0);
  });
});
