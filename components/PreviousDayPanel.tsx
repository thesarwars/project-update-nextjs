"use client";

import { LuArrowDownToLine } from "react-icons/lu";
import { IconButton } from "./ui";
import { formatDisplayDate, relativeDayLabel, weekdayName } from "@/lib/date";
import { parseBlocks, type Block, type BulletNode } from "@/lib/format";
import type { Entry, Person } from "@/lib/types";

interface Props {
  from: string | null;
  entries: Record<string, Entry>;
  people: Person[];
  todoLabel: string;
  onCarry: (person: Person) => void;
}

/**
 * Last working day's ToDo, sitting beside today's fields so you can see at a glance
 * what each person said they would do before writing what they did.
 */
export default function PreviousDayPanel({ from, entries, people, todoLabel, onCarry }: Props) {
  const withTodo = people.filter((p) => (entries[p.id]?.todo ?? "").trim());

  return (
    <aside className="flex h-full flex-col rounded-xl border border-line bg-surface card-shadow">
      <header className="border-b border-line px-3 py-2.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Last {todoLabel}
        </h2>
        {from ? (
          <p className="mt-0.5 text-[12.5px] font-medium tabular-nums">
            {formatDisplayDate(from)}
            <span className="ml-1.5 font-normal text-muted">
              {relativeDayLabel(from) === weekdayName(from)
                ? weekdayName(from)
                : relativeDayLabel(from)}
            </span>
          </p>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5 thin-scroll">
        {!from || withTodo.length === 0 ? (
          <p className="py-8 text-center text-[12px] text-muted">
            {from ? `No ${todoLabel} saved that day.` : "Nothing earlier to compare with."}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {withTodo.map((person) => (
              <li key={person.id}>
                <div className="flex items-center gap-1">
                  <h3 className="truncate text-[12.5px] font-semibold">{person.name}</h3>
                  <IconButton
                    label={`Pull ${person.name}'s ${todoLabel} into today`}
                    variant="ghost"
                    size="sm"
                    className="ml-auto shrink-0"
                    onClick={() => onCarry(person)}
                  >
                    <LuArrowDownToLine className="h-3 w-3" />
                  </IconButton>
                </div>
                <Blocks blocks={parseBlocks(entries[person.id]?.todo ?? "")} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  const out: React.ReactNode[] = [];
  let run: BulletNode[] = [];

  const flush = (key: string) => {
    if (!run.length) return;
    out.push(<Nodes key={key} nodes={run} depth={0} />);
    run = [];
  };

  blocks.forEach((block, i) => {
    if (block.kind === "header") {
      flush(`ul-${i}`);
      out.push(
        <p key={`h-${i}`} className="mt-1.5 text-[12px] font-semibold text-foreground">
          {block.text}
        </p>,
      );
    } else {
      run.push(block.node);
    }
  });
  flush("ul-end");

  return <>{out}</>;
}

function Nodes({ nodes, depth }: { nodes: BulletNode[]; depth: number }) {
  return (
    <ul className={depth === 0 ? "mt-0.5 space-y-0.5 pl-3.5" : "mt-0.5 space-y-0.5 pl-3"}>
      {nodes.map((node, i) => (
        <li key={i} className="list-disc text-[12px] leading-[1.45] text-muted marker:text-line-strong">
          <span className="whitespace-pre-wrap">{node.text}</span>
          {node.children.length ? <Nodes nodes={node.children} depth={depth + 1} /> : null}
        </li>
      ))}
    </ul>
  );
}
