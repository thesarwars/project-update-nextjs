/** The 44px per-view bar under the global one. Every view gets the same shaped header. */
export default function ViewToolbar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
      {children}
    </div>
  );
}
