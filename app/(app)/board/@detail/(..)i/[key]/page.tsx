import IssueDetailPane from "@/components/issues/IssueDetailPane";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** The same interception as the backlog and tree, so the board keeps its columns. */
export default async function InterceptedIssue({ params, searchParams }: PageProps<"/i/[key]">) {
  const user = await requireUser();
  const { key } = await params;
  const query = await searchParams;
  const project = typeof query.project === "string" ? `?project=${encodeURIComponent(query.project)}` : "";

  return <IssueDetailPane user={user} issueKey={key} backHref={`/board${project}`} />;
}
