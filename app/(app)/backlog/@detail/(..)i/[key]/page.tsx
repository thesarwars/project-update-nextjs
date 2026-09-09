import IssueDetailPane from "@/components/issues/IssueDetailPane";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Clicking an issue in the backlog lands here: the same route as the full page, rendered
 * beside the list instead of replacing it. The list keeps its scroll position, the URL is
 * real, and the back button closes the pane.
 */
export default async function InterceptedIssue({ params, searchParams }: PageProps<"/i/[key]">) {
  const user = await requireUser();
  const { key } = await params;
  const query = await searchParams;
  const project = typeof query.project === "string" ? `?project=${encodeURIComponent(query.project)}` : "";

  return <IssueDetailPane user={user} issueKey={key} backHref={`/backlog${project}`} />;
}
