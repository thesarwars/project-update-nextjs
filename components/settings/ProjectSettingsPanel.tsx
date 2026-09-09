"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LuPlus } from "react-icons/lu";
import { Button, Field, inputClass } from "@/components/ui";
import { useToast } from "@/components/Toast";
import Modal from "@/components/Modal";
import {
  DEFAULT_LABELS,
  DEFAULT_TITLE_TEMPLATE,
  SECTION_KEYS,
  type Project,
  type SectionKey,
} from "@/lib/types";

export default function ProjectSettingsPanel({ project }: { project: Project | undefined }) {
  return (
    <div className="flex max-w-2xl flex-col gap-8">
      {project ? <ProjectForm key={project.id} project={project} /> : null}
      <NewProject />
    </div>
  );
}

function ProjectForm({ project }: { project: Project }) {
  const router = useRouter();
  const toast = useToast();
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
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), titleTemplate, labels: cleaned }),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
      toast("Project saved.");
    } catch {
      toast("Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (
      !window.confirm(`Delete "${project.name}" and every standup entry saved under it?`)
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      router.replace("/settings");
      router.refresh();
      toast("Project deleted.");
    } catch {
      toast("Could not delete that project.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-[14px] font-semibold">General</h2>

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

      <div className="flex items-center gap-2">
        <Button variant="primary" onClick={save} disabled={busy || !name.trim()}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>

      <div className="mt-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3">
        <h3 className="text-[13px] font-semibold text-danger">Danger zone</h3>
        <p className="mt-0.5 text-[12.5px] text-muted">
          Deleting the project removes every person and every standup entry under it.
        </p>
        <Button variant="danger" onClick={remove} disabled={busy} className="mt-2">
          Delete project
        </Button>
      </div>
    </section>
  );
}

function NewProject() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [people, setPeople] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          people: people.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const { project } = (await res.json()) as { project: { id: string } };
      setOpen(false);
      setName("");
      setPeople("");
      router.push(`/settings?project=${encodeURIComponent(project.id)}`);
      router.refresh();
    } catch {
      toast("Could not create that project.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border-t border-line pt-6">
      <h2 className="text-[14px] font-semibold">Projects</h2>
      <p className="mt-0.5 text-[12.5px] text-muted">
        Each project has its own people, its own heading, and its own standup history.
      </p>
      <Button className="mt-3" onClick={() => setOpen(true)}>
        <LuPlus className="h-3.5 w-3.5" />
        New project
      </Button>

      {open ? (
        <Modal
          open
          onClose={() => setOpen(false)}
          title="New project"
          footer={
            <>
              <Button onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="primary" onClick={create} disabled={busy || !name.trim()}>
                {busy ? "Creating…" : "Create"}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Field label="Project name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Go Style"
                className={inputClass}
                data-autofocus
              />
            </Field>
            <Field label="People" hint="One per line, or comma separated. Editable later.">
              <textarea
                value={people}
                onChange={(e) => setPeople(e.target.value)}
                rows={5}
                placeholder={"Nihal\nNazirul\nSaad"}
                className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </Field>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
