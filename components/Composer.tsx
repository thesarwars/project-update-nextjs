"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuUsers } from "react-icons/lu";
import Modal from "./Modal";
import PeopleManager from "./PeopleManager";
import PersonCard from "./PersonCard";
import PreviewPane from "./PreviewPane";
import PreviousDayPanel from "./PreviousDayPanel";
import ProjectSettings from "./ProjectSettings";
import TopBar from "./TopBar";
import PaneGrid from "./layout/PaneGrid";
import { Button, EmptyState, Field, Key, inputClass } from "./ui";
import { useToast } from "./Toast";
import { useDebouncedSave } from "@/lib/useDebouncedSave";
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

/** Defined at module scope so `useDebouncedSave`'s flush stays stable across renders. */
async function saveEntry(item: PendingSave): Promise<void> {
  const res = await fetch("/api/entries", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
    keepalive: true,
  });
  if (!res.ok) throw new Error(`PUT /api/entries -> ${res.status}`);
}

interface PendingSave extends EntryText {
  projectId: string;
  date: string;
  personId: string;
}

interface Prefs {
  options: RenderOptions;
  flavor: CopyFlavor;
  showPrevious: boolean;
}

/** Bookmarked ?date=, read during the first render. */
function initialDate(): string {
  if (typeof window === "undefined") return todayISO();
  const fromUrl = new URL(window.location.href).searchParams.get("date");
  return isValidISODate(fromUrl) ? fromUrl : todayISO();
}

/** Read once during the first render — the loading screen looks the same either way. */
function loadPrefs(): Prefs {
  const fallback: Prefs = { options: DEFAULT_RENDER_OPTIONS, flavor: "rich", showPrevious: true };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as Partial<Prefs>;
    return {
      options: { ...DEFAULT_RENDER_OPTIONS, ...saved.options },
      flavor: saved.flavor ?? "rich",
      showPrevious: saved.showPrevious ?? true,
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
  const [options, setOptions] = useState<RenderOptions>(() => loadPrefs().options);
  const [flavor, setFlavor] = useState<CopyFlavor>(() => loadPrefs().flavor);
  const [showPrevious, setShowPrevious] = useState(() => loadPrefs().showPrevious);
  const [copied, setCopied] = useState<string | null>(null);
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

  const toast = useToast();

  /* ---------------- persistence of edits ---------------- */

  const entriesRef = useRef<Record<string, Entry>>({});
  const { queue, flush, state: saveState } = useDebouncedSave<PendingSave>({ save: saveEntry });

  const updateEntry = useCallback(
    (personId: string, patch: Partial<EntryText>) => {
      if (!projectId) return;
      const current = entriesRef.current[personId] ?? emptyEntry();
      const next: Entry = { ...current, ...patch };
      entriesRef.current = { ...entriesRef.current, [personId]: next };
      setEntries(entriesRef.current);

      const text = {} as EntryText;
      for (const key of SECTION_KEYS) text[key] = next[key];
      queue(`${projectId}|${date}|${personId}`, { projectId, date, personId, ...text });
    },
    [projectId, date, queue],
  );

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
        toast("Could not reach the server.");
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ options, flavor, showPrevious }));
    } catch {
      /* private mode */
    }
  }, [options, flavor, showPrevious]);

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
        if (!cancelled) toast("Could not load that day.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, date, flush, toast]);

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
      else toast("Copy was blocked — use the Text tab and copy by hand.");
    },
    [flavor, showCopied, toast],
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
    toast(
      filled
        ? `Pulled ${filled} ${filled === 1 ? "person" : "people"} forward from ${formatDisplayDate(carry.from!)}.`
        : "Nothing to carry over — those fields already have something.",
    );
  }, [activePeople, carry, updateEntry, toast]);

  const patchProject = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        toast("That change did not save.");
        return;
      }
      const { project: updated } = (await res.json()) as { project: Project };
      setProjects((list) => list.map((p) => (p.id === updated.id ? updated : p)));
    },
    [toast],
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
      toast("Could not create that project.");
      return;
    }
    const { project: created } = (await res.json()) as { project: Project };
    setProjects((list) => [...list, created]);
    setProjectId(created.id);
    setNewProjectOpen(false);
    setNewProjectName("");
    setNewProjectPeople("");
  }, [newProjectName, newProjectPeople, toast]);

  const removeProject = useCallback(async () => {
    if (!project) return;
    const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast("Could not delete that project.");
      return;
    }
    const remaining = projects.filter((p) => p.id !== project.id);
    setProjects(remaining);
    setProjectId(remaining[0]?.id ?? null);
  }, [project, projects, toast]);

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
        showPrevious={showPrevious}
        onTogglePrevious={() => setShowPrevious((v) => !v)}
        onManagePeople={() => setPeopleOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        saveState={saveState}
      />

      {/* Two independent scroll panes on a wide screen; one ordinary page below that. */}
      <PaneGrid
        columns={showPrevious ? "aside+main+detail" : "main+detail"}
        aside={
          showPrevious ? (
            <PreviousDayPanel
              from={carry.from}
              entries={carry.entries}
              people={activePeople}
              todoLabel={project.labels.todo}
              onCarry={carryOne}
            />
          ) : undefined
        }
        detail={
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
        }
      >
        <>
          {activePeople.length === 0 ? (
            <EmptyState
              icon={<LuUsers className="h-6 w-6" />}
              title="No one on this standup yet"
              body="Add the people who report in this standup."
              action={
                <Button variant="primary" onClick={() => setPeopleOpen(true)}>
                  Add people
                </Button>
              }
            />
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
        </>
      </PaneGrid>

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

    </div>
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
