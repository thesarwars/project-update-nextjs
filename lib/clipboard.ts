"use client";

/**
 * Puts the update on the clipboard as *both* rich text and plain text.
 *
 * Slack, Google Docs, Notion and mail clients read `text/html` and format the
 * paste themselves. Discord and anything plain reads `text/plain`, which we fill
 * with markdown so it still renders bold text and bullets. One copy, both worlds.
 */
export async function copyRich(html: string, text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return true;
    } catch {
      // Fall through — some browsers reject multi-format writes.
    }
  }

  if (copyHtmlViaSelection(html)) return true;
  return copyPlain(text);
}

export async function copyPlain(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyTextViaSelection(text);
  }
}

/** Legacy path: select offscreen rich content and let the browser copy it. */
function copyHtmlViaSelection(html: string): boolean {
  const host = document.createElement("div");
  host.setAttribute("contenteditable", "true");
  host.innerHTML = html; // built by lib/format.ts with escaped content
  Object.assign(host.style, {
    position: "fixed",
    top: "0",
    left: "0",
    opacity: "0",
    pointerEvents: "none",
    whiteSpace: "pre-wrap",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(host);

  const selection = window.getSelection();
  const saved = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
  try {
    const range = document.createRange();
    range.selectNodeContents(host);
    selection?.removeAllRanges();
    selection?.addRange(range);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    selection?.removeAllRanges();
    if (saved) selection?.addRange(saved);
    host.remove();
  }
}

function copyTextViaSelection(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  Object.assign(area.style, { position: "fixed", top: "0", left: "0", opacity: "0" });
  document.body.appendChild(area);
  try {
    area.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
