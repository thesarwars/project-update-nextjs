import Composer from "@/components/Composer";
import { requireUser } from "@/lib/auth";

// Reads the session cookie, so it can never be prerendered — which also keeps
// `next build` from opening the database.
export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser("/");
  return <Composer currentUser={{ id: user.id, name: user.name, role: user.role }} />;
}
