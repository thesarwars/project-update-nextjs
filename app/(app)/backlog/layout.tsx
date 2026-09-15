import ViewToolbar from "@/components/shell/ViewToolbar";

/**
 * The backlog and the issue detail share one grid.
 *
 * The second track is `auto`, and the detail slot renders nothing when no issue is open,
 * so the track collapses to zero width without this layout having to know whether one is
 * selected — which keeps it a Server Component. There is deliberately no `gap` on the
 * grid: an empty track still gets its gap, leaving a phantom strip down the page. Each
 * pane carries its own padding and border instead.
 */
export default function BacklogLayout({
  children,
  detail,
}: {
  children: React.ReactNode;
  detail: React.ReactNode;
}) {
  return (
    <>
      <ViewToolbar>
        <h1 className="text-[13px] font-semibold">Backlog</h1>
      </ViewToolbar>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_auto] lg:overflow-hidden">
        <div className="min-w-0 overflow-y-auto px-4 py-3 thin-scroll">{children}</div>
        {detail}
      </div>
    </>
  );
}
