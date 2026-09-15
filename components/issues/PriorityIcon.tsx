import { PRIORITY_LABELS } from "@/lib/types";

/**
 * One to three bars, rising with urgency. Height carries the level so it reads without
 * colour, the same principle as the type glyphs.
 */
export default function PriorityIcon({ priority }: { priority: number }) {
  const level = Math.min(5, Math.max(1, priority));
  const bars = level <= 2 ? 4 - level : level === 3 ? 2 : 1;
  const color =
    level === 1 ? "var(--danger)" : level === 2 ? "#b45309" : level === 3 ? "var(--muted)" : "var(--line-strong)";

  return (
    <span
      className="inline-flex h-3.5 shrink-0 items-end gap-[2px]"
      title={`${PRIORITY_LABELS[level]} priority`}
      aria-label={`${PRIORITY_LABELS[level]} priority`}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-[1px]"
          style={{
            height: `${4 + i * 3}px`,
            background: i < bars ? color : "var(--line)",
          }}
        />
      ))}
    </span>
  );
}
