import IssueDetailPane from "@/components/issues/IssueDetailPane";
import { requireUser } from "@/lib/auth";
import { listHref } from "@/lib/views";

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

  // The same builder the full page uses, so the pane's close button and a refreshed
  // page's close button can never disagree about where "back" is.
  return <IssueDetailPane user={user} issueKey={key} backHref={listHref("backlog", query)} />;
}
