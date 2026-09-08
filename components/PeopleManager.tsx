"use client";

import { useState } from "react";
import { LuArrowDown, LuArrowUp, LuPlus, LuTrash2 } from "react-icons/lu";
import Modal from "./Modal";
import { Button, IconButton, inputClass } from "./ui";
import type { Person } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  people: Person[];
  onSave: (people: Person[]) => Promise<void>;
}

/** Mounts only while open, so every visit starts from the saved roster. */
export default function PeopleManager({ open, onClose, people, onSave }: Props) {
  if (!open) return null;
  return <PeopleForm people={people} onClose={onClose} onSave={onSave} />;
}

type Draft = Person & { isNew?: boolean };

function PeopleForm({ people, onClose, onSave }: Omit<Props, "open">) {
  const [draft, setDraft] = useState<Draft[]>(people);
  const [nextId, setNextId] = useState(0);
  const [saving, setSaving] = useState(false);

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
      window.confirm(`Remove ${person.name || "this person"}? Their saved updates go too.`);
    if (confirmed) setDraft((list) => list.filter((_, i) => i !== index));
  };

  const add = () => {
    setDraft((list) => [...list, { id: `new_${nextId}`, name: "", active: true, isNew: true }]);
    setNextId((n) => n + 1);
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(
        draft
          .filter((p) => p.name.trim())
          .map((p) => ({ id: p.isNew ? "" : p.id, name: p.name.trim(), active: p.active })),
      );
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="People"
      description="This order is the order they appear in the update. Unchecked people are kept but left out."
      width="max-w-xl"
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save people"}
          </Button>
        </>
      }
    >
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

      <Button className="mt-3" onClick={add}>
        <LuPlus className="h-3.5 w-3.5" />
        Add person
      </Button>
    </Modal>
  );
}
