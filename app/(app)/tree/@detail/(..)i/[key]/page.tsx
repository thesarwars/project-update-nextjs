import IssueDetailPane from "@/components/issues/IssueDetailPane";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** The same interception as the backlog, so the tree keeps its shape while you read. */
export default async function InterceptedIssue({ params, searchParams }: PageProps<"/i/[key]">) {
  const user = await requireUser();
  const { key } = await params;
  const query = await searchParams;
  const search = new URLSearchParams();
  if (typeof query.project === "string") search.set("project", query.project);
  if (typeof query.root === "string") search.set("root", query.root);
  const suffix = search.toString();

  return (
    <IssueDetailPane user={user} issueKey={key} backHref={`/tree${suffix ? `?${suffix}` : ""}`} />
  );
}
