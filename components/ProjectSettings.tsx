"use client";

import { useState } from "react";
import Modal from "./Modal";
import { Button, Field, inputClass } from "./ui";
import {
  DEFAULT_LABELS,
  DEFAULT_TITLE_TEMPLATE,
  SECTION_KEYS,
  type Project,
  type SectionKey,
} from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  project: Project;
  onSave: (patch: {
    name: string;
    titleTemplate: string;
    labels: Record<SectionKey, string>;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
}

/** Mounts only while open, so the fields always start from the saved project. */
export default function ProjectSettings({ open, ...rest }: Props) {
  if (!open) return null;
  return <SettingsForm {...rest} />;
}

function SettingsForm({ onClose, project, onSave, onDelete }: Omit<Props, "open">) {
  const [name, setName] = useState(project.name);
  const [titleTemplate, setTitleTemplate] = useState(project.titleTemplate);
  const [labels, setLabels] = useState<Record<SectionKey, string>>(project.labels);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const cleaned = {} as Record<SectionKey, string>;
      for (const key of SECTION_KEYS) cleaned[key] = labels[key].trim() || DEFAULT_LABELS[key];
      await onSave({ name: name.trim(), titleTemplate, labels: cleaned });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${project.name}" and every update saved under it?`)) return;
    setBusy(true);
    try {
      await onDelete();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Project settings"
      footer={
        <>
          <Button variant="danger" onClick={remove} disabled={busy} className="mr-auto">
            Delete project
          </Button>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !name.trim()}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Project name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <Field
          label="Heading"
          hint={`{project} and {date} are filled in. Default: ${DEFAULT_TITLE_TEMPLATE}`}
        >
          <input
            value={titleTemplate}
            onChange={(e) => setTitleTemplate(e.target.value)}
            placeholder={DEFAULT_TITLE_TEMPLATE}
            className={inputClass}
          />
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium text-muted">
            Section labels — a section is left out of the update when it is empty
          </legend>
          <div className="grid grid-cols-2 gap-3">
            {SECTION_KEYS.map((key) => (
              <label key={key} className="flex flex-col gap-1.5">
                <span className="text-[11px] text-muted">{DEFAULT_LABELS[key]}</span>
                <input
                  value={labels[key]}
                  onChange={(e) => setLabels((l) => ({ ...l, [key]: e.target.value }))}
                  placeholder={DEFAULT_LABELS[key]}
                  className={inputClass}
                />
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}
