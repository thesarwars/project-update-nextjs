"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuUsers } from "react-icons/lu";
import Link from "next/link";
import PaneGrid from "./layout/PaneGrid";
import PersonCard from "./PersonCard";
import PreviewPane from "./PreviewPane";
import PreviousDayPanel from "./PreviousDayPanel";
import StandupToolbar from "./StandupToolbar";
import { useToast } from "./Toast";
import {
  LEGACY_PREFS_KEY,
  PREFS_COOKIE,
  serializePrefs,
  type StandupPrefs,
} from "@/lib/standupPrefs";
import { useReportSave } from "./shell/SaveProvider";
import { EmptyState, Key } from "./ui";
import { copyPlain, copyRich } from "@/lib/clipboard";
import { useRouter } from "next/navigation";
import { addDays, formatDisplayDate, isValidISODate, todayISO } from "@/lib/date";
import {
  buildDoc,
  buildPersonDoc,
  docIsEmpty,
  renderHtml,
  renderPlainText,
  type CopyFlavor,
  type RenderInput,
  type RenderOptions,
} from "@/lib/format";
import { useDebouncedSave } from "@/lib/useDebouncedSave";
import {
  SECTION_KEYS,
  emptyEntry,
  type Entry,
  type EntryText,
  type Issue,
  type Person,
  type Project,
} from "@/lib/types";

interface PendingSave extends EntryText {
  projectId: string;
  date: string;
  personId: string;
}

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

export default function Composer({
  project,
  issuesByPerson,
  initialDate,
  initialPrefs,
}: {
  project: Project;
  /** Each person's open issues, so a card offers their own work first. */
  issuesByPerson: Record<string, Issue[]>;
  /** From ?date= on the server, so the first client render agrees with the HTML. */
  initialDate: string;
  /** From a cookie, for the same reason. */
  initialPrefs: StandupPrefs;
}) {
  const [date, setDate] = useState<string>(initialDate);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [carry, setCarry] = useState<{ from: string | null; entries: Record<string, Entry> }>({
    from: null,
    entries: {},
  });
  const [options, setOptions] = useState<RenderOptions>(initialPrefs.options);
  const [flavor, setFlavor] = useState<CopyFlavor>(initialPrefs.flavor);
  const [showPrevious, setShowPrevious] = useState(initialPrefs.showPrevious);
  const [copied, setCopied] = useState<string | null>(null);

  const router = useRouter();
  const toast = useToast();
  const reportSave = useReportSave();
  const projectId = project.id;
  const activePeople = useMemo(() => project.people.filter((p) => p.active), [project]);

  /* ---------------- persistence of edits ---------------- */

  const entriesRef = useRef<Record<string, Entry>>({});
  const { queue, flush, state: saveState } = useDebouncedSave<PendingSave>({ save: saveEntry });

  // One badge in the global bar, fed by whichever editor is active.
  useEffect(() => reportSave(saveState), [saveState, reportSave]);

  const updateEntry = useCallback(
    (personId: string, patch: Partial<EntryText>) => {
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

  /* ---------------- load a day ---------------- */

  useEffect(() => {
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

  useEffect(() => {
    document.cookie = `${PREFS_COOKIE}=${serializePrefs({ options, flavor, showPrevious })}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [options, flavor, showPrevious]);

  // One-time carry-over of settings that predate the cookie. Writes the cookie and asks
  // the server to re-render with it; after that the branch never runs again.
  useEffect(() => {
    if (document.cookie.includes(`${PREFS_COOKIE}=`)) return;
    let legacy: string | null = null;
    try {
      legacy = localStorage.getItem(LEGACY_PREFS_KEY);
    } catch {
      /* private mode */
    }
    if (!legacy) return;
    document.cookie = `${PREFS_COOKIE}=${encodeURIComponent(legacy)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    try {
      localStorage.removeItem(LEGACY_PREFS_KEY);
    } catch {
      /* ignore */
    }
    router.refresh();
  }, [router]);

  /* ---------------- rendering the update ---------------- */

  const renderInput: RenderInput = useMemo(
    () => ({ project, dateISO: date, people: project.people, entries }),
    [project, date, entries],
  );
  const doc = useMemo(() => buildDoc(renderInput, options), [renderInput, options]);
  const html = useMemo(() => renderHtml(doc), [doc]);
  const text = useMemo(() => renderPlainText(doc, flavor), [doc, flavor]);
  const isEmpty = docIsEmpty(doc);

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
    if (docIsEmpty(doc)) return;
    void copyDoc("all", doc);
  }, [doc, copyDoc]);

  const copyPerson = useCallback(
    (personId: string) => void copyDoc(personId, buildPersonDoc(renderInput, personId, options)),
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

  /* ---------------- carry over ---------------- */

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

  /* ---------------- render ---------------- */

  return (
    <>
      <StandupToolbar
        date={date}
        onDateChange={(d) => isValidISODate(d) && setDate(d)}
        onStepDate={(delta) => setDate((d) => addDays(d, delta))}
        onToday={() => setDate(todayISO())}
        isToday={date === todayISO()}
        carryFrom={carry.from ? formatDisplayDate(carry.from) : null}
        onCarryOver={carryAll}
        showPrevious={showPrevious}
        onTogglePrevious={() => setShowPrevious((v) => !v)}
      />

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
                <Link
                  href={`/team?project=${encodeURIComponent(projectId)}`}
                  className="inline-flex h-8 items-center rounded-lg bg-accent px-3 text-[13px] font-medium text-accent-contrast transition hover:brightness-110"
                >
                  Add people
                </Link>
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
                issues={issuesByPerson[person.id] ?? []}
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
              <Key>{"⌘"}</Key>+<Key>Shift</Key>+<Key>C</Key> copy everything
            </span>
          </div>
        </>
      </PaneGrid>
    </>
  );
}
