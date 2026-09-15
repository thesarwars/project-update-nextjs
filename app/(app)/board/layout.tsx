import ViewToolbar from "@/components/shell/ViewToolbar";

export default function BoardLayout({
  children,
  detail,
}: {
  children: React.ReactNode;
  detail: React.ReactNode;
}) {
  return (
    <>
      <ViewToolbar>
        <h1 className="text-[13px] font-semibold">Board</h1>
        <span className="text-[12px] text-muted">what is moving right now</span>
      </ViewToolbar>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_auto] lg:overflow-hidden">
        <div className="flex min-w-0 flex-col overflow-hidden px-4 py-3">{children}</div>
        {detail}
      </div>
    </>
  );
}
