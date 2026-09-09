"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LuCalendarDays, LuListTodo, LuNetwork, LuSettings, LuUsers } from "react-icons/lu";

interface Props {
  /** Used when the URL carries no ?project= yet. */
  fallbackProjectId: string | null;
}

const PERSONAL = [{ href: "/", label: "Standup", icon: LuCalendarDays }];
const PLAN = [
  { href: "/backlog", label: "Backlog", icon: LuListTodo },
  { href: "/tree", label: "Tree", icon: LuNetwork },
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

  return (
    <nav
      aria-label="Sections"
      className="hidden w-[212px] shrink-0 flex-col gap-4 border-r border-line px-3 py-3 lg:flex"
    >
      <Group items={PERSONAL} pathname={pathname} query={query} />
      <Group title="Plan" items={PLAN} pathname={pathname} query={query} />
      <Group title="Team" items={TEAM} pathname={pathname} query={query} />
    </nav>
  );
}

function Group({
  title,
  items,
  pathname,
  query,
}: {
  title?: string;
  items: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
  pathname: string;
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
        const active = pathname === href;
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
