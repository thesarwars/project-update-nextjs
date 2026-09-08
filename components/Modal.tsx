"use client";

import { useEffect, useRef } from "react";
import { IconButton } from "./ui";
import { LuX } from "react-icons/lu";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}

/** Native <dialog>, so focus trapping and Escape come for free. */
export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "max-w-lg",
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  /** Where the pointer went down, so a drag that ends on the backdrop does not close. */
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // showModal() puts focus on the first focusable child, which is the close button.
      // React's own autoFocus ran at mount, before this, so it has already been undone.
      el.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === ref.current;
      }}
      onClick={(e) => {
        // Both ends of the interaction must be the backdrop. Selecting text in an input
        // and releasing outside the dialog would otherwise discard the whole form.
        if (pressedBackdrop.current && e.target === ref.current) onClose();
      }}
      className={`m-auto w-[calc(100vw-2rem)] ${width} rounded-2xl border border-line bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/45 backdrop:backdrop-blur-[2px]`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
        </div>
        <IconButton label="Close" variant="ghost" size="sm" onClick={onClose}>
          <LuX className="h-4 w-4" />
        </IconButton>
      </div>
      <div className="max-h-[65vh] overflow-y-auto px-5 py-4 thin-scroll">{children}</div>
      {footer ? (
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>
      ) : null}
    </dialog>
  );
}
