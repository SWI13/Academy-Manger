"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { Icon, type IconName } from "./Icon";

/**
 * Confirmation that something happened, away from where it happened.
 *
 * The rule for using these: a toast reports an outcome the user cannot
 * already see. Saving a mark sheet that stays on screen gets one; a rejection
 * that visibly turns the payment red does not need one on top.
 *
 * Errors are not toasted. An error belongs beside the control that caused it,
 * where it can still be read after the four seconds are up - so this carries
 * successes and neutral notices, and every failure in this application is
 * rendered inline instead.
 */

type Tone = "ok" | "info" | "warn";

type Toast = {
  id: number;
  tone: Tone;
  title: string;
  description?: string;
};

const ICONS: Record<Tone, IconName> = {
  ok: "check-circle",
  info: "info",
  warn: "alert",
};

const TONES: Record<Tone, string> = {
  ok: "text-ok",
  info: "text-info",
  warn: "text-warn",
};

type Push = (toast: Omit<Toast, "id">) => void;

const ToastContext = createContext<Push | null>(null);

const LIFETIME_MS = 4500;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback<Push>((toast) => {
    // Date.now() collides when two land in the same millisecond, which is
    // exactly what a batch save does. The random suffix keeps keys unique.
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-2), { ...toast, id }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        // Polite, not assertive: this announces after whatever the user is
        // doing, rather than interrupting them mid-sentence.
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
      >
        {toasts.map((toast) => (
          <Item key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Item({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      className="animate-toast pointer-events-auto flex w-full max-w-sm items-start gap-3 glass-strong rounded-xl border border-rule p-3.5"
    >
      <Icon name={ICONS[toast.tone]} size={18} className={`mt-px ${TONES[toast.tone]}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 text-sm text-ink-soft">{toast.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-m-1 rounded-md p-1 text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink"
      >
        <Icon name="close" size={15} />
      </button>
    </div>
  );
}

/**
 * Push a toast.
 *
 * Returns a no-op outside the provider rather than throwing: a component that
 * wants to say "saved" should not be able to crash the page it saved.
 */
export function useToast(): Push {
  const push = useContext(ToastContext);
  return useMemo(() => push ?? (() => {}), [push]);
}
