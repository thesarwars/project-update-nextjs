"use client";

import { LuArrowDownToLine, LuCheck, LuCopy } from "react-icons/lu";
import BulletEditor from "./BulletEditor";
import { IconButton } from "./ui";
import { parseItems } from "@/lib/format";
import { SECTION_KEYS, type Entry, type EntryText, type Person, type SectionKey } from "@/lib/types";

const PLACEHOLDERS: Record<SectionKey, string> = {
  done: "What landed…",
  todo: "What's next…",
  dependency: "Waiting on…",
  remarks: "Anything else…",
};

interface Props {
  person: Person;
  entry: Entry;
  labels: Record<SectionKey, string>;
  copied: boolean;
  carryFrom: string | null;
  onChange: (patch: Partial<EntryText>) => void;
  onCopy: () => void;
  onCarry: () => void;
}

export default function PersonCard({
  person,
  entry,
  labels,
  copied,
  carryFrom,
  onChange,
  onCopy,
  onCarry,
}: Props) {
  const counts = SECTION_KEYS.map((key) => ({
    key,
    label: labels[key],
    count: parseItems(entry[key]).length,
  })).filter((s) => s.count > 0);
  const empty = counts.length === 0;

  return (
    <section className="rounded-xl border border-line bg-surface card-shadow">
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <h3 className="truncate text-[14px] font-semibold">{person.name}</h3>
        <span className="shrink-0 truncate text-[11px] tabular-nums text-muted">
          {empty ? "nothing yet" : counts.map((s) => `${s.label} ${s.count}`).join(" · ")}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          {carryFrom ? (
            <IconButton
              label={`Pull ${labels.todo} from ${carryFrom}`}
              variant="ghost"
              size="sm"
              onClick={onCarry}
            >
              <LuArrowDownToLine className="h-3.5 w-3.5" />
            </IconButton>
          ) : null}
          <IconButton
            label={`Copy ${person.name}'s update`}
            variant="ghost"
            size="sm"
            onClick={onCopy}
            disabled={empty}
          >
            {copied ? (
              <LuCheck className="h-3.5 w-3.5 text-success" />
            ) : (
              <LuCopy className="h-3.5 w-3.5" />
            )}
          </IconButton>
        </div>
      </header>

      <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
        {SECTION_KEYS.map((key) => (
          <div key={key} className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {labels[key]}
            </span>
            <BulletEditor
              value={entry[key]}
              onChange={(value) => onChange({ [key]: value })}
              label={`${person.name} — ${labels[key]}`}
              placeholder={PLACEHOLDERS[key]}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
