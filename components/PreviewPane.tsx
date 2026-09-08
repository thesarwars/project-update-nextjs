"use client";

import { useState } from "react";
import { LuCheck, LuCode, LuCopy, LuEye } from "react-icons/lu";
import { Button } from "./ui";
import { FLAVORS, type CopyFlavor, type RenderOptions } from "@/lib/format";

interface Props {
  html: string;
  text: string;
  isEmpty: boolean;
  flavor: CopyFlavor;
  onFlavorChange: (flavor: CopyFlavor) => void;
  options: RenderOptions;
  onOptionsChange: (options: RenderOptions) => void;
  copied: boolean;
  onCopy: () => void;
}

type Tab = "preview" | "text";

export default function PreviewPane({
  html,
  text,
  isEmpty,
  flavor,
  onFlavorChange,
  options,
  onOptionsChange,
  copied,
  onCopy,
}: Props) {
  const [tab, setTab] = useState<Tab>("preview");
  const activeFlavor = FLAVORS.find((f) => f.id === flavor) ?? FLAVORS[0];

  return (
    <div className="flex h-full flex-col rounded-xl border border-line bg-surface card-shadow">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <div className="flex rounded-lg bg-surface-sunken p-0.5">
          <TabButton active={tab === "preview"} onClick={() => setTab("preview")}>
            <LuEye className="h-3.5 w-3.5" />
            Preview
          </TabButton>
          <TabButton active={tab === "text"} onClick={() => setTab("text")}>
            <LuCode className="h-3.5 w-3.5" />
            Text
          </TabButton>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Chip
            active={options.includeHeader}
            onClick={() => onOptionsChange({ ...options, includeHeader: !options.includeHeader })}
          >
            Heading
          </Chip>
          <Chip
            active={options.omitEmptyPeople}
            onClick={() =>
              onOptionsChange({
                ...options,
                omitEmptyPeople: !options.omitEmptyPeople,
                omitEmptySections: !options.omitEmptyPeople,
              })
            }
          >
            Hide empty
          </Chip>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 thin-scroll">
        {isEmpty ? (
          <p className="py-10 text-center text-[13px] text-muted">
            Nothing to show yet — start typing on the left.
          </p>
        ) : tab === "preview" ? (
          <div className="preview-body" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <pre className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-5">
            {text}
          </pre>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-line px-3 py-2.5">
        <Button variant="primary" size="lg" onClick={onCopy} disabled={isEmpty} className="flex-1">
          {copied ? <LuCheck className="h-4 w-4" /> : <LuCopy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy update"}
        </Button>
        <label className="sr-only" htmlFor="copy-flavor">
          Copy format
        </label>
        <select
          id="copy-flavor"
          value={flavor}
          onChange={(e) => onFlavorChange(e.target.value as CopyFlavor)}
          title={activeFlavor.hint}
          className="h-10 shrink-0 rounded-lg border border-line bg-surface px-2 text-[13px] text-foreground outline-none focus:border-accent"
        >
          {FLAVORS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </footer>
      <p className="px-3 pb-2.5 text-[11px] leading-4 text-muted">{activeFlavor.hint}</p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-xs font-medium transition ${
        active ? "bg-surface text-foreground card-shadow" : "text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-7 rounded-full border px-2.5 text-[11px] font-medium transition ${
        active
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-line text-muted hover:border-line-strong hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
