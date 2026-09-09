import ViewToolbar from "@/components/shell/ViewToolbar";

/** Same two-track grid as the backlog, so the detail pane behaves identically here. */
export default function TreeLayout({
  children,
  detail,
}: {
  children: React.ReactNode;
  detail: React.ReactNode;
}) {
  return (
    <>
      <ViewToolbar>
        <h1 className="text-[13px] font-semibold">Tree</h1>
        <span className="text-[12px] text-muted">epic → story → task → subtask, and bugs</span>
      </ViewToolbar>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_auto] lg:overflow-hidden">
        <div className="min-w-0 overflow-y-auto px-4 py-3 thin-scroll">{children}</div>
        {detail}
      </div>
    </>
  );
}
