"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuUsers } from "react-icons/lu";
import Modal from "./Modal";
import PeopleManager from "./PeopleManager";
import PersonCard from "./PersonCard";
import PreviewPane from "./PreviewPane";
import ProjectSettings from "./ProjectSettings";
import TopBar, { type SaveState } from "./TopBar";
import { Button, Field, inputClass } from "./ui";
import { copyPlain, copyRich } from "@/lib/clipboard";
import { addDays, formatDisplayDate, isValidISODate, todayISO } from "@/lib/date";
import {
  DEFAULT_RENDER_OPTIONS,
  buildDoc,
  buildPersonDoc,
  docIsEmpty,
  renderHtml,
  renderPlainText,
  type CopyFlavor,
  type RenderInput,
  type RenderOptions,
} from "@/lib/format";
import { SECTION_KEYS, emptyEntry, type Entry, type EntryText, type Person, type Project } from "@/lib/types";

const PREFS_KEY = "standup.prefs.v1";
const SAVE_DEBOUNCE_MS = 500;

interface PendingSave extends EntryText {
  projectId: string;
  date: string;
  personId: string;
}

interface Prefs {
  options: RenderOptions;
  flavor: CopyFlavor;
}

/** Bookmarked ?date=, read during the first render. */
function initialDate(): string {
  if (typeof window === "undefined") return todayISO();
  const fromUrl = new URL(window.location.href).searchParams.get("date");
  return isValidISODate(fromUrl) ? fromUrl : todayISO();
}

/** Read once during the first render — the loading screen looks the same either way. */
function loadPrefs(): Prefs {
  const fallback: Prefs = { options: DEFAULT_RENDER_OPTIONS, flavor: "rich" };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as Partial<Prefs>;
    return {
      options: { ...DEFAULT_RENDER_OPTIONS, ...saved.options },
      flavor: saved.flavor ?? "rich",
    };
  } catch {
    return fallback;
  }
}

export default function Composer() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(initialDate);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [carry, setCarry] = useState<{ from: string | null; entries: Record<string, Entry> }>({
    from: null,
    entries: {},
  });
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [options, setOptions] = useState<RenderOptions>(() => loadPrefs().options);
  const [flavor, setFlavor] = useState<CopyFlavor>(() => loadPrefs().flavor);
  const [copied, setCopied] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectPeople, setNewProjectPeople] = useState("");

  const project = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId],
  );
  const activePeople = useMemo(
    () => (project?.people ?? []).filter((p) => p.active),
    [project],
  );

  /* ---------------- persistence of edits ---------------- */

  const entriesRef = useRef<Record<string, Entry>>({});
  const pending = useRef(new Map<string, PendingSave>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const items = [...pending.current.values()];
    if (!items.length) return;
    pending.current.clear();
    setSaveState("saving");

    try {
      await Promise.all(
        items.map(async (item) => {
          const res = await fetch("/api/entries", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item),
            keepalive: true,
          });
          if (!res.ok) throw new Error(`PUT /api/entries -> ${res.status}`);
        }),
      );
      setSaveState(pending.current.size ? "saving" : "saved");
    } catch {
      // Put them back so the next keystroke retries; never clobber newer edits.
      for (const item of items) {
        const key = `${item.projectId}|${item.date}|${item.personId}`;
        if (!pending.current.has(key)) pending.current.set(key, item);
      }
      setSaveState("error");
    }
  }, []);

  const updateEntry = useCallback(
    (personId: string, patch: Partial<EntryText>) => {
      if (!projectId) return;
      const current = entriesRef.current[personId] ?? emptyEntry();
      const next: Entry = { ...current, ...patch };
      entriesRef.current = { ...entriesRef.current, [personId]: next };
      setEntries(entriesRef.current);

      const text = {} as EntryText;
      for (const key of SECTION_KEYS) text[key] = next[key];
      pending.current.set(`${projectId}|${date}|${personId}`, {
        projectId,
        date,
        personId,
        ...text,
      });
      setSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    },
    [projectId, date, flush],
  );

  // Don't lose the last keystrokes when the tab goes away.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const onUnload = () => void flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onUnload);
    };
  }, [flush]);

  /* ---------------- initial load ---------------- */

  useEffect(() => {
    const urlProject = new URL(window.location.href).searchParams.get("project");

    (async () => {
      try {
        const res = await fetch("/api/projects");
        const data = (await res.json()) as { projects: Project[]; lastProjectId: string | null };
        setProjects(data.projects);
        const chosen =
          data.projects.find((p) => p.id === urlProject)?.id ??
          data.projects.find((p) => p.id === data.lastProjectId)?.id ??
          data.projects[0]?.id ??
          null;
        setProjectId(chosen);
      } catch {
        setToast("Could not reach the server.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ options, flavor }));
    } catch {
      /* private mode */
    }
  }, [options, flavor]);

  /* ---------------- load a day ---------------- */

  useEffect(() => {
    if (!projectId) return; // the empty state is showing; nothing reads entries
    let cancelled = false;

    (async () => {
      await flush(); // edits belong to the day they were typed on
      if (cancelled) return;

      // Blank the fields before the day arrives. Otherwise the previous day's text is
      // on screen under the new date, and anything typed into it is saved to the new day.
      entriesRef.current = {};
      setEntries({});
      setCarry({ from: null, entries: {} });

      const query = `projectId=${encodeURIComponent(projectId)}&date=${encodeURIComponent(date)}`;
      try {
        const [entriesRes, carryRes] = await Promise.all([
          fetch(`/api/entries?${query}`),
          fetch(`/api/entries/carryover?${query}`),
        ]);
        if (cancelled) return;
        if (!entriesRes.ok) throw new Error(`GET /api/entries -> ${entriesRes.status}`);

        const loaded = (await entriesRes.json()) as { entries: Record<string, Entry> };
        if (cancelled) return;
        // Anything typed while the day was in flight wins over what the server sent.
        entriesRef.current = { ...loaded.entries, ...entriesRef.current };
        setEntries(entriesRef.current);

        if (carryRes.ok) {
          const previous = (await carryRes.json()) as {
            from: string | null;
            entries: Record<string, Entry>;
          };
          if (!cancelled) setCarry(previous);
        }
      } catch {
        if (!cancelled) setToast("Could not load that day.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, date, flush]);

  // Keep the URL in step so a day is bookmarkable, without a router round-trip.
  useEffect(() => {
    if (!projectId) return;
    const url = new URL(window.location.href);
    url.searchParams.set("project", projectId);
    url.searchParams.set("date", date);
    window.history.replaceState(null, "", url.toString());
    void fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lastProjectId: projectId }),
    }).catch(() => undefined);
  }, [projectId, date]);

  /* ---------------- rendering the update ---------------- */

  const renderInput: RenderInput | null = useMemo(
    () => (project ? { project, dateISO: date, people: project.people, entries } : null),
    [project, date, entries],
  );

  const doc = useMemo(
    () => (renderInput ? buildDoc(renderInput, options) : null),
    [renderInput, options],
  );
  const html = useMemo(() => (doc ? renderHtml(doc) : ""), [doc]);
  const text = useMemo(() => (doc ? renderPlainText(doc, flavor) : ""), [doc, flavor]);
  const isEmpty = !doc || docIsEmpty(doc);

  const showCopied = useCallback((key: string) => {
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600);
  }, []);

  const copyDoc = useCallback(
    async (key: string, target: ReturnType<typeof buildDoc>) => {
      const plain = renderPlainText(target, flavor);
      const ok =
        flavor === "rich" ? await copyRich(renderHtml(target), plain) : await copyPlain(plain);
      if (ok) showCopied(key);
      else setToast("Copy was blocked — use the Text tab and copy by hand.");
    },
    [flavor, showCopied],
  );

  const copyAll = useCallback(() => {
    if (!doc || docIsEmpty(doc)) return;
    void copyDoc("all", doc);
  }, [doc, copyDoc]);

  const copyPerson = useCallback(
    (personId: string) => {
      if (!renderInput) return;
      void copyDoc(personId, buildPersonDoc(renderInput, personId, options));
    },
    [renderInput, options, copyDoc],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      if (event.shiftKey && key === "c") {
        event.preventDefault();
        copyAll();
      } else if (!event.shiftKey && key === "s") {
        event.preventDefault();
        void flush();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [copyAll, flush]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  /* ---------------- actions ---------------- */

  const carryOne = useCallback(
    (person: Person) => {
      const previous = carry.entries[person.id]?.todo ?? "";
      if (!previous.trim()) return;
      const current = entriesRef.current[person.id]?.todo ?? "";
      const merged = current.trim() ? `${current.replace(/\s+$/, "")}\n${previous}` : previous;
      updateEntry(person.id, { todo: merged });
    },
    [carry, updateEntry],
  );

  const carryAll = useCallback(() => {
    let filled = 0;
    for (const person of activePeople) {
      const previous = carry.entries[person.id]?.todo ?? "";
      if (!previous.trim()) continue;
      if ((entriesRef.current[person.id]?.todo ?? "").trim()) continue; // never overwrite
      updateEntry(person.id, { todo: previous });
      filled += 1;
    }
    setToast(
      filled
        ? `Pulled ${filled} ${filled === 1 ? "person" : "people"} forward from ${formatDisplayDate(carry.from!)}.`
        : "Nothing to carry over — those fields already have something.",
    );
  }, [activePeople, carry, updateEntry]);

  const patchProject = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        setToast("That change did not save.");
        return;
      }
      const { project: updated } = (await res.json()) as { project: Project };
      setProjects((list) => list.map((p) => (p.id === updated.id ? updated : p)));
    },
    [],
  );

  const createProject = useCallback(async () => {
    const name = newProjectName.trim();
    if (!name) return;
    const people = newProjectPeople
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, people }),
    });
    if (!res.ok) {
      setToast("Could not create that project.");
      return;
    }
    const { project: created } = (await res.json()) as { project: Project };
    setProjects((list) => [...list, created]);
    setProjectId(created.id);
    setNewProjectOpen(false);
    setNewProjectName("");
    setNewProjectPeople("");
  }, [newProjectName, newProjectPeople]);

  const removeProject = useCallback(async () => {
    if (!project) return;
    const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    if (!res.ok) {
      setToast("Could not delete that project.");
      return;
    }
    const remaining = projects.filter((p) => p.id !== project.id);
    setProjects(remaining);
    setProjectId(remaining[0]?.id ?? null);
  }, [project, projects]);

  /* ---------------- render ---------------- */

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[13px] text-muted">
        Loading…
      </div>
    );
  }

  if (!project) {
    return (
      <>
        <EmptyProjects onCreate={() => setNewProjectOpen(true)} />
        <NewProjectModal
          open={newProjectOpen}
          onClose={() => setNewProjectOpen(false)}
          name={newProjectName}
          onNameChange={setNewProjectName}
          people={newProjectPeople}
          onPeopleChange={setNewProjectPeople}
          onCreate={createProject}
        />
      </>
    );
  }

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:min-h-0 lg:overflow-hidden">
      <TopBar
        projects={projects}
        projectId={project.id}
        onProjectChange={setProjectId}
        onNewProject={() => setNewProjectOpen(true)}
        date={date}
        onDateChange={(d) => isValidISODate(d) && setDate(d)}
        onStepDate={(delta) => setDate((d) => addDays(d, delta))}
        onToday={() => setDate(todayISO())}
        isToday={date === todayISO()}
        carryFrom={carry.from ? formatDisplayDate(carry.from) : null}
        onCarryOver={carryAll}
        onManagePeople={() => setPeopleOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        saveState={saveState}
      />

      {/* Two independent scroll panes on a wide screen; one ordinary page below that. */}
      <main className="mx-auto grid w-full max-w-[1400px] flex-1 gap-4 px-4 py-4 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_420px] lg:overflow-hidden">
        <div className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto lg:pr-1 thin-scroll">
          {activePeople.length === 0 ? (
            <EmptyPeople onManage={() => setPeopleOpen(true)} />
          ) : (
            activePeople.map((person) => (
              <PersonCard
                key={person.id}
                person={person}
                entry={entries[person.id] ?? emptyEntry()}
                labels={project.labels}
                copied={copied === person.id}
                carryFrom={
                  carry.entries[person.id]?.todo?.trim() && carry.from
                    ? formatDisplayDate(carry.from)
                    : null
                }
                onChange={(patch) => updateEntry(person.id, patch)}
                onCopy={() => copyPerson(person.id)}
                onCarry={() => carryOne(person)}
              />
            ))
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 pb-2 text-[11px] text-muted">
            <span>
              <Key>Enter</Key> next point
            </span>
            <span>
              <Key>Shift</Key>+<Key>Enter</Key> another line, same point
            </span>
            <span>
              <Key>Tab</Key> / <Key>Shift</Key>+<Key>Tab</Key> nest a point
            </span>
            <span>
              <Key>Backspace</Key> over the <code className="font-mono">-</code> makes a sub-header
            </span>
            <span>
              <Key>{"\u2318"}</Key>+<Key>Shift</Key>+<Key>C</Key> copy everything
            </span>
          </div>
        </div>

        <div className="lg:min-h-0">
          <PreviewPane
            html={html}
            text={text}
            isEmpty={isEmpty}
            flavor={flavor}
            onFlavorChange={setFlavor}
            options={options}
            onOptionsChange={setOptions}
            copied={copied === "all"}
            onCopy={copyAll}
          />
        </div>
      </main>

      <PeopleManager
        open={peopleOpen}
        onClose={() => setPeopleOpen(false)}
        people={project.people}
        onSave={(people) => patchProject(project.id, { people })}
      />
      <ProjectSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        project={project}
        onSave={(patch) => patchProject(project.id, patch)}
        onDelete={removeProject}
      />
      <NewProjectModal
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        name={newProjectName}
        onNameChange={setNewProjectName}
        people={newProjectPeople}
        onPeopleChange={setNewProjectPeople}
        onCreate={createProject}
      />

      {toast ? (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-line bg-surface px-4 py-2 text-[12.5px] card-shadow"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-surface px-1 font-sans text-[10px]">{children}</kbd>
  );
}

function EmptyProjects({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-lg font-semibold">No projects yet</h1>
      <p className="max-w-sm text-[13px] text-muted">
        A project holds one team&apos;s standup — its people, its heading, and every day you write.
      </p>
      <Button variant="primary" size="lg" onClick={onCreate}>
        Create a project
      </Button>
    </div>
  );
}

function EmptyPeople({ onManage }: { onManage: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong px-6 py-14 text-center">
      <LuUsers className="h-6 w-6 text-muted" />
      <p className="text-[13px] text-muted">Add the people who report in this standup.</p>
      <Button variant="primary" onClick={onManage}>
        Add people
      </Button>
    </div>
  );
}

function NewProjectModal({
  open,
  onClose,
  name,
  onNameChange,
  people,
  onPeopleChange,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  onNameChange: (v: string) => void;
  people: string;
  onPeopleChange: (v: string) => void;
  onCreate: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New project"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={onCreate} disabled={!name.trim()}>
            Create
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Project name">
          <input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Go Style"
            className={inputClass}
            data-autofocus
          />
        </Field>
        <Field label="People" hint="One per line, or comma separated. You can change these later.">
          <textarea
            value={people}
            onChange={(e) => onPeopleChange(e.target.value)}
            rows={5}
            placeholder={"Nihal\nNazirul\nSaad"}
            className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </Field>
      </div>
    </Modal>
  );
}
