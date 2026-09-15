import IssueDetailPane from "@/components/issues/IssueDetailPane";
import { requireUser } from "@/lib/auth";
import { listHref } from "@/lib/views";

export const dynamic = "force-dynamic";

/** The same interception as the backlog, so the tree keeps its shape while you read. */
export default async function InterceptedIssue({ params, searchParams }: PageProps<"/i/[key]">) {
  const user = await requireUser();
  const { key } = await params;
  const query = await searchParams;

  // The same builder the full page uses, so the pane's close button and a refreshed
  // page's close button can never disagree about where "back" is.
  return <IssueDetailPane user={user} issueKey={key} backHref={listHref("tree", query)} />;
}
