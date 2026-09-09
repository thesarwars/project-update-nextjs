import { ISSUE_TYPE_META, type SprintCount } from "@/lib/types";

/**
 * One pure function of the scope, rendered three ways.
 *
 * The sprint list, the sprint header and the backlog all show these numbers, so they come
 * from one place — otherwise two surfaces eventually disagree and the numbers stop being
 * worth trusting. Types with nothing selected are omitted: a sprint with no bugs should
 * not display "Bugs 0/0".
 */
export default function SprintCounters({
  counts,
  variant = "compact",
}: {
  counts: SprintCount[];
  variant?: "compact" | "full" | "micro";
}) {
  const set = counts.reduce((n, c) => n + c.set, 0);
  const done = counts.reduce((n, c) => n + c.completed, 0);

  if (variant === "micro") {
    return (
      <span className="text-[11px] tabular-nums text-muted">
        {done}/{set}
      </span>
    );
  }

  if (variant === "full") {
    return (
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          {counts.map((count) => (
            <div key={count.type} className="flex flex-col gap-1">
              <span className="flex items-baseline gap-1.5">
                <span className="text-[12px] font-medium">
                  {ISSUE_TYPE_META[count.type].label}s
                </span>
                <span className="text-[12px] tabular-nums text-muted">
                  {count.completed}/{count.set}
                </span>
              </span>
              <Bar done={count.completed} total={count.set} />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 border-t border-line pt-2">
          <span className="text-[12px] font-medium">Total</span>
          <span className="text-[12px] tabular-nums text-muted">
            {done}/{set}
          </span>
          <span className="min-w-0 flex-1">
            <Bar done={done} total={set} />
          </span>
          <span className="text-[12px] tabular-nums text-muted">
            {set ? Math.round((done / set) * 100) : 0}%
          </span>
        </div>
      </div>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted">
      {counts.map((count) => (
        <span key={count.type} className="tabular-nums">
          {ISSUE_TYPE_META[count.type].label}s {count.completed}/{count.set}
        </span>
      ))}
      {counts.length ? (
        <span className="inline-block h-1.5 w-24 overflow-hidden rounded-full bg-surface-sunken align-middle">
          <span
            className="block h-full rounded-full bg-success transition-[width] duration-200"
            style={{ width: `${set ? (done / set) * 100 : 0}%` }}
          />
        </span>
      ) : (
        <span>Nothing selected yet</span>
      )}
    </span>
  );
}

function Bar({ done, total }: { done: number; total: number }) {
  return (
    <span className="block h-1.5 overflow-hidden rounded-full bg-surface-sunken">
      <span
        className="block h-full rounded-full bg-success transition-[width] duration-200"
        style={{ width: `${total ? (done / total) * 100 : 0}%` }}
      />
    </span>
  );
}
