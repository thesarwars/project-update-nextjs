"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/** An offer to reverse what the message just reported, e.g. Undo. */
export interface ToastAction {
  label: string;
  run: () => void;
}

interface Toast {
  id: number;
  message: string;
  action?: ToastAction;
}

export type ToastInput = string | { message: string; action?: ToastAction };

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

/** Long enough to read a sentence, and long enough to decide to undo it. */
const PLAIN_MS = 3200;
const ACTION_MS = 8000;

/**
 * One toast host for the whole app, so anything — a view, a dialog, a failed mutation —
 * can report without owning its own timer and portal.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // A ref, not state: the id is bookkeeping, and bumping it must not schedule a render
  // of its own or nest a setState inside another updater.
  const nextId = useRef(0);

  const show = useCallback((toast: ToastInput) => {
    const id = nextId.current;
    nextId.current += 1;
    const next = typeof toast === "string" ? { message: toast } : toast;
    setToasts((list) => [...list, { id, ...next }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (!toasts.length) return;
    const oldest = toasts[0];
    const timer = setTimeout(
      () => dismiss(oldest.id),
      oldest.action ? ACTION_MS : PLAIN_MS,
    );
    return () => clearTimeout(timer);
  }, [toasts, dismiss]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toasts.length ? (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role="status"
              // The host stays click-through so a toast never blocks the page; only a
              // toast that offers something takes clicks back.
              className={`flex items-center gap-3 rounded-full border border-line bg-surface px-4 py-2 text-[12.5px] card-shadow ${
                toast.action ? "pointer-events-auto" : ""
              }`}
            >
              {toast.message}
              {toast.action ? (
                <button
                  type="button"
                  onClick={() => {
                    dismiss(toast.id);
                    toast.action!.run();
                  }}
                  className="font-medium text-accent hover:underline"
                >
                  {toast.action.label}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

/** Show a transient message, optionally with something to click. */
export function useToast(): (toast: ToastInput) => void {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside a <ToastProvider>");
  return show;
}
