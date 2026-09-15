"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LuLogOut } from "react-icons/lu";
import { IconButton, SaveBadge } from "@/components/ui";
import { useSaveState } from "./SaveProvider";
import Avatar from "./Avatar";
import type { Project } from "@/lib/types";

interface Props {
  projects: Pick<Project, "id" | "name">[];
  fallbackProjectId: string | null;
  currentUser: { name: string };
}

export default function GlobalTopBar({ projects, fallbackProjectId, currentUser }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const saveState = useSaveState();
  const fromUrl = params.get("project");
  const projectId = projects.some((p) => p.id === fromUrl) ? fromUrl : fallbackProjectId;

  /** Project lives in the URL, so it survives a refresh and can be shared. */
  const switchProject = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("project", id);
    next.delete("date"); // a date from another project's history means nothing here
    router.push(`${pathname}?${next}`);
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
      <span className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-accent text-[11px] font-bold text-accent-contrast">
          S
        </span>
        <span className="hidden text-[13px] font-semibold tracking-tight sm:inline">Standup</span>
      </span>

      {projects.length > 0 && projectId ? (
        <>
          <span className="h-4 w-px bg-line" aria-hidden />
          <label className="sr-only" htmlFor="global-project">
            Project
          </label>
          <select
            id="global-project"
            value={projectId}
            onChange={(e) => switchProject(e.target.value)}
            className="h-8 max-w-[220px] rounded-lg border border-line bg-surface px-2 text-[13px] font-medium text-foreground outline-none focus:border-accent"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </>
      ) : null}

      <div className="ml-auto flex items-center gap-1.5">
        <SaveBadge state={saveState} />
        <span className="flex items-center gap-1.5" title={currentUser.name}>
          <Avatar name={currentUser.name} />
          <span className="hidden max-w-[120px] truncate text-[12.5px] font-medium sm:inline">
            {currentUser.name}
          </span>
        </span>
        <form action="/api/auth/logout" method="post">
          <IconButton label="Sign out" type="submit" variant="ghost" size="sm">
            <LuLogOut className="h-4 w-4" />
          </IconButton>
        </form>
      </div>
    </header>
  );
}
