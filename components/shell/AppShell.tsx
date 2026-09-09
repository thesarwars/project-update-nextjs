import GlobalTopBar from "./GlobalTopBar";
import Sidebar from "./Sidebar";
import { SaveProvider } from "./SaveProvider";
import type { Project } from "@/lib/types";

interface Props {
  projects: Pick<Project, "id" | "name">[];
  /** Used when the URL carries no ?project= — a layout cannot read searchParams. */
  fallbackProjectId: string | null;
  currentUser: { name: string };
  children: React.ReactNode;
}

/**
 * Two bars, three bands: a product-level bar that never changes, a per-view toolbar the
 * page supplies, and the content region below it. The standup and the tracker are peers
 * inside this frame rather than one being bolted onto the other.
 */
export default function AppShell({ projects, fallbackProjectId, currentUser, children }: Props) {
  return (
    <SaveProvider>
      <div className="flex h-screen flex-col overflow-hidden">
        <GlobalTopBar
          projects={projects}
          fallbackProjectId={fallbackProjectId}
          currentUser={currentUser}
        />
        <div className="flex min-h-0 flex-1">
          <Sidebar fallbackProjectId={fallbackProjectId} />
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
      </div>
    </SaveProvider>
  );
}
