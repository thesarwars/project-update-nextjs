"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuPlus } from "react-icons/lu";
import SprintCounters from "./SprintCounters";
import Modal from "@/components/Modal";
import { Button, EmptyState, Field, inputClass } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { DURATION_UNITS, endOfSprint, formatDisplayDate, daysLeft, todayISO, workingDaysBetween, type DurationUnit } from "@/lib/date";
import type { Sprint, SprintCount } from "@/lib/types";

interface Props {
  projectId: string;
  sprints: Sprint[];
  counts: Record<string, SprintCount[]>;
  canManage: boolean;
  /** The server's current day, so the countdown reads the same in both renders. */
  today: string;
}

export default function SprintsView({ projectId, sprints, counts, canManage, today }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  const act = async (id: string, action: "start" | "close", carryToSprintId?: string) => {
    const res = await fetch(`/api/sprints/${id}/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, carryToSprintId }),
    });
    if (!res.ok) {
      const { error } = (await res.json().catch(() => ({}))) as { error?: string };
      toast(error ?? "That did not work.");
      return;
    }
    router.refresh();
  };

  const nextOpen = (after: Sprint) =>
    sprints.find((s) => s.id !== after.id && s.state !== "closed")?.id;

  return (
    <div className="flex flex-col gap-3">
      {canManage ? (
        <div className="flex">
          <Button variant="primary" onClick={() => setOpen(true)}>
            <LuPlus className="h-3.5 w-3.5" />
            New sprint
          </Button>
        </div>
      ) : null}

      {sprints.length === 0 ? (
        <EmptyState
          title="No sprints yet"
          body="A sprint is a window you pull work into. Choose which epics, stories and tasks are in it, and the counts follow."
        />
      ) : null}

      <ul className="flex flex-col gap-2">
        {sprints.map((sprint) => {
          const left = sprint.endDate ? daysLeft(sprint.endDate, today) : null;
          return (
            <li key={sprint.id} className="rounded-xl border border-line bg-surface p-3 card-shadow">
              <div className="flex flex-wrap items-center gap-2">
                <StateBadge state={sprint.state} />
                <Link href={`/sprints/${sprint.id}`} className="text-[14px] font-semibold hover:underline">
                  {sprint.name}
                </Link>
                <span className="text-[12px] text-muted">
                  {sprint.startDate && sprint.endDate
                    ? `${formatDisplayDate(sprint.startDate)} – ${formatDisplayDate(sprint.endDate)} · ${sprint.durationCount} ${sprint.durationUnit}`
                    : "No dates set"}
                  {sprint.state === "active" && left !== null ? ` · ${left} days left` : ""}
                </span>

                {canManage ? (
                  <span className="ml-auto flex items-center gap-2">
                    {sprint.state === "planned" ? (
                      <Button size="sm" onClick={() => void act(sprint.id, "start")}>
                        Start sprint
                      </Button>
                    ) : null}
                    {sprint.state === "active" ? (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => void act(sprint.id, "close", nextOpen(sprint))}
                      >
                        Complete sprint
                      </Button>
                    ) : null}
                  </span>
                ) : null}
              </div>

              <div className="mt-2">
                <SprintCounters counts={counts[sprint.id] ?? []} />
              </div>

              {sprint.goal ? (
                <p className="mt-1.5 text-[12.5px] text-muted">{sprint.goal}</p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {open ? (
        <NewSprint projectId={projectId} onClose={() => setOpen(false)} onDone={() => { setOpen(false); router.refresh(); }} />
      ) : null}
    </div>
  );
}

function StateBadge({ state }: { state: Sprint["state"] }) {
  const map = {
    active: { text: "Active", className: "bg-success/12 text-success" },
    planned: { text: "Planned", className: "bg-surface-sunken text-muted" },
    closed: { text: "Done", className: "bg-surface-sunken text-muted" },
  } as const;
  const s = map[state];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${s.className}`}>
      {s.text}
    </span>
  );
}

function NewSprint({
  projectId,
  onClose,
  onDone,
}: {
  projectId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState(todayISO());
  const [unit, setUnit] = useState<DurationUnit>("weeks");
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState(false);

  // A derived read-out, never a second editable date, so start, length and end cannot
  // disagree with each other.
  const end = startDate ? endOfSprint(startDate, unit, count) : null;

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/sprints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, name: name.trim(), goal, startDate, durationUnit: unit, durationCount: count }),
      });
      if (!res.ok) throw new Error(String(res.status));
      onDone();
    } catch {
      toast("Could not create that sprint.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New sprint"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={create} disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sprint 7" className={inputClass} data-autofocus />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Starts">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Length">
            <input type="number" min={1} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value)))} className={inputClass} />
          </Field>
          <Field label="Unit">
            <select value={unit} onChange={(e) => setUnit(e.target.value as DurationUnit)} className={inputClass}>
              {DURATION_UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </Field>
        </div>
        {end ? (
          <p className="-mt-2 text-[12px] text-muted">
            Ends {formatDisplayDate(end)} · {workingDaysBetween(startDate, end)} working days
          </p>
        ) : null}
        <Field label="Goal" hint="Optional — what this sprint is for.">
          <input value={goal} onChange={(e) => setGoal(e.target.value)} className={inputClass} />
        </Field>
      </div>
    </Modal>
  );
}
