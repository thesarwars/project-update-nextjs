import type { Status } from "@/lib/types";

export default function StatusPill({ status, className = "" }: { status: Status; className?: string }) {
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-1.5 text-[10.5px] font-medium ${className}`}
      style={{
        color: status.color,
        background: `color-mix(in srgb, ${status.color} 12%, #fff)`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: status.color }} />
      {status.name}
    </span>
  );
}
