"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

interface Toast {
  id: number;
  message: string;
}

const ToastContext = createContext<((message: string) => void) | null>(null);

/**
 * One toast host for the whole app, so anything — a view, a dialog, a failed mutation —
 * can report without owning its own timer and portal.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // A ref, not state: the id is bookkeeping, and bumping it must not schedule a render
  // of its own or nest a setState inside another updater.
  const nextId = useRef(0);

  const show = useCallback((message: string) => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts((list) => [...list, { id, message }]);
  }, []);

  useEffect(() => {
    if (!toasts.length) return;
    const oldest = toasts[0];
    const timer = setTimeout(
      () => setToasts((list) => list.filter((t) => t.id !== oldest.id)),
      3200,
    );
    return () => clearTimeout(timer);
  }, [toasts]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toasts.length ? (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role="status"
              className="rounded-full border border-line bg-surface px-4 py-2 text-[12.5px] card-shadow"
            >
              {toast.message}
            </div>
          ))}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

/** Show a transient message. Throws if used outside a ToastProvider. */
export function useToast(): (message: string) => void {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside a <ToastProvider>");
  return show;
}
