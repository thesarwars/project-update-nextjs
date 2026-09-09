"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LuArrowDown, LuArrowUp, LuPlus, LuTrash2 } from "react-icons/lu";
import { Button, IconButton, inputClass } from "@/components/ui";
import { useToast } from "@/components/Toast";
import type { Person, Project } from "@/lib/types";

type Draft = Person & { isNew?: boolean };

export default function PeopleEditor({ project }: { project: Project }) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft[]>(project.people);
  const [nextId, setNextId] = useState(0);
  const [saving, setSaving] = useState(false);

  const dirty =
    JSON.stringify(draft.map((p) => ({ id: p.id, name: p.name, active: p.active }))) !==
    JSON.stringify(project.people.map((p) => ({ id: p.id, name: p.name, active: p.active })));

  const update = (index: number, patch: Partial<Draft>) =>
    setDraft((list) => list.map((p, i) => (i === index ? { ...p, ...patch } : p)));

  const move = (index: number, delta: number) =>
    setDraft((list) => {
      const target = index + delta;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const remove = (index: number) => {
    const person = draft[index];
    const confirmed =
      person.isNew ||
      window.confirm(
        `Remove ${person.name || "this person"}? If they have written any standup entries, ` +
          `they are kept and simply left out of the update instead.`,
      );
    if (confirmed) setDraft((list) => list.filter((_, i) => i !== index));
  };

  const add = () => {
    setDraft((list) => [...list, { id: `new_${nextId}`, name: "", active: true, isNew: true }]);
    setNextId((n) => n + 1);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          people: draft
            .filter((p) => p.name.trim())
            .map((p) => ({ id: p.isNew ? "" : p.id, name: p.name.trim(), active: p.active })),
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const { project: updated } = (await res.json()) as { project: Project };
      setDraft(updated.people);
      router.refresh();
      toast("People saved.");
    } catch {
      toast("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="max-w-2xl">
      <header className="mb-3">
        <h2 className="text-[14px] font-semibold">People on {project.name}</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">
          This order is the order they appear in the update. Unticking someone keeps their
          history but leaves them out.
        </p>
      </header>

      <ul className="flex flex-col gap-2">
        {draft.map((person, index) => (
          <li key={person.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={person.active}
              onChange={(e) => update(index, { active: e.target.checked })}
              aria-label={`Include ${person.name || "this person"} in the update`}
              className="h-4 w-4 shrink-0 accent-[var(--accent)]"
            />
            <input
              value={person.name}
              onChange={(e) => update(index, { name: e.target.value })}
              placeholder="Name"
              autoFocus={person.isNew}
              className={inputClass}
            />
            <div className="flex shrink-0 items-center gap-0.5">
              <IconButton
                label="Move up"
                variant="ghost"
                size="sm"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <LuArrowUp className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                label="Move down"
                variant="ghost"
                size="sm"
                disabled={index === draft.length - 1}
                onClick={() => move(index, 1)}
              >
                <LuArrowDown className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton label="Remove" variant="danger" size="sm" onClick={() => remove(index)}>
                <LuTrash2 className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          </li>
        ))}
      </ul>

      {draft.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted">No one here yet.</p>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <Button onClick={add}>
          <LuPlus className="h-3.5 w-3.5" />
          Add person
        </Button>
        <Button variant="primary" onClick={save} disabled={saving || !dirty} className="ml-auto">
          {saving ? "Saving…" : "Save people"}
        </Button>
      </div>
    </section>
  );
}
