"use client";

import { usePathname } from "next/navigation";

/**
 * Shows the detail slot only while the URL is actually an issue.
 *
 * Parallel routes keep a slot's active subpage across a client-side navigation even when
 * the new URL does not match it — that is what makes the pane survive an edit or a
 * refresh of the list beside it. It also means navigating *away* leaves the pane on
 * screen: closing an issue moved the URL back to the list and the pane stayed, and so did
 * clicking the list in the sidebar. `default.tsx` does not help, because it is only
 * rendered after a full page load.
 *
 * The slot's own route cannot notice this — it has already matched, once — so the guard
 * lives here, in the one place that can read the URL as it changes.
 */
export default function DetailSlot({ children }: { children: React.ReactNode }) {
  return usePathname().startsWith("/i/") ? <>{children}</> : null;
}
