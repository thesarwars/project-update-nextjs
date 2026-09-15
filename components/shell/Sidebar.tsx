"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { knownListView } from "@/lib/views";
import {
  LuCalendarDays,
  LuCircleUser,
  LuColumns3,
  LuListTodo,
  LuNetwork,
  LuRocket,
  LuSettings,
  LuUsers,
} from "react-icons/lu";

interface Props {
  /** Used when the URL carries no ?project= yet. */
  fallbackProjectId: string | null;
}

const PERSONAL = [
  { href: "/my-work", label: "My work", icon: LuCircleUser },
  { href: "/", label: "Standup", icon: LuCalendarDays },
];
const PLAN = [
  { href: "/board", label: "Board", icon: LuColumns3 },
  { href: "/backlog", label: "Backlog", icon: LuListTodo },
  { href: "/tree", label: "Tree", icon: LuNetwork },
  { href: "/sprints", label: "Sprints", icon: LuRocket },
];
const TEAM = [
  { href: "/team", label: "People", icon: LuUsers },
  { href: "/settings", label: "Settings", icon: LuSettings },
];

export default function Sidebar({ fallbackProjectId }: Props) {
  const pathname = usePathname();
  const params = useSearchParams();
  // Carried on every link, so moving between views keeps the project you are looking at.
  const projectId = params.get("project") ?? fallbackProjectId;
  const query = projectId ? `?project=${encodeURIComponent(projectId)}` : "";

  // An issue opened from a list is still that list's screen — the pane is sitting on top
  // of it — so the list stays marked while the issue is open. A pasted issue link carries
  // no `from` and marks nothing, which is honest: it came from outside the app.
  const from = knownListView(params.get("from"));
  const current = from && pathname.startsWith("/i/") ? `/${from}` : pathname;

  return (
    <nav
      aria-label="Sections"
      className="hidden w-[212px] shrink-0 flex-col gap-4 border-r border-line px-3 py-3 lg:flex"
    >
      <Group items={PERSONAL} current={current} query={query} />
      <Group title="Plan" items={PLAN} current={current} query={query} />
      <Group title="Team" items={TEAM} current={current} query={query} />
    </nav>
  );
}

function Group({
  title,
  items,
  current,
  query,
}: {
  title?: string;
  items: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
  /** The view being looked at, which is not always the path — see the pane above. */
  current: string;
  query: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {title ? (
        <h2 className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted">
          {title}
        </h2>
      ) : null}
      {items.map(({ href, label, icon: Icon }) => {
        const active = current === href;
        return (
          <Link
            key={href}
            href={`${href}${query}`}
            aria-current={active ? "page" : undefined}
            className={`flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] font-medium transition ${
              active
                ? "bg-accent/10 text-accent"
                : "text-muted hover:bg-surface-sunken hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
