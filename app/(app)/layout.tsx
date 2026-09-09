import AppShell from "@/components/shell/AppShell";
import { requireUser } from "@/lib/auth";
import { getSetting, listProjects } from "@/lib/db";

// Reads the session cookie, so nothing under here is ever prerendered — which also
// keeps `next build` from opening the database.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const projects = listProjects().map((p) => ({ id: p.id, name: p.name }));
  const last = getSetting("lastProjectId");
  const fallbackProjectId = projects.some((p) => p.id === last)
    ? last
    : (projects[0]?.id ?? null);

  return (
    <AppShell
      projects={projects}
      fallbackProjectId={fallbackProjectId}
      currentUser={{ name: user.name }}
    >
      {children}
    </AppShell>
  );
}
