"use client";

import { useEffect, useRef } from "react";

import { Button, IconButton } from "./Button";
import { Icon, type IconName } from "./Icon";

/**
 * A dialog, using the platform's own.
 *
 * `<dialog showModal>` gives the focus trap, the inert background, the escape
 * key and the top layer for free, and gets them right in ways a div with
 * role="dialog" reliably does not. What is left to do here is the animation,
 * the scrim, and closing on a click outside.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // Escape fires `cancel` before `close`; both end up here so the parent's
    // state cannot drift out of step with the element's.
    const handle = () => onClose();
    dialog.addEventListener("close", handle);
    return () => dialog.removeEventListener("close", handle);
  }, [onClose]);

  const width =
    size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-md";

  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      onClick={(event) => {
        // The backdrop is the dialog element itself; anything inside the panel
        // stops here before it reaches this handler.
        if (event.target === ref.current) onClose();
      }}
      className={`m-auto w-[calc(100vw-2rem)] ${width} glass-strong rounded-xl border border-rule p-0 text-ink shadow-xl backdrop:bg-black/70 backdrop:backdrop-blur-[3px] open:animate-pop`}
    >
      <div className="flex items-start justify-between gap-4 p-5 pb-0">
        <div className="min-w-0">
          <h2 id="modal-title" className="text-base font-semibold text-ink">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              {description}
            </p>
          ) : null}
        </div>
        <IconButton icon="close" label="Close" size="sm" onClick={onClose} />
      </div>

      {children ? <div className="p-5 pt-4">{children}</div> : <div className="h-1" />}

      {footer ? (
        <div className="flex flex-wrap justify-end gap-2 border-t border-rule bg-black/30 p-4">
          {footer}
        </div>
      ) : null}
    </dialog>
  );
}

/**
 * The dialog in front of something that cannot be taken back.
 *
 * Deliberately not a wrapper that fires on mount: a confirmation is worth
 * nothing if the button that opened it already did the thing. The destructive
 * action is the one styled as destructive, and it is never the one focus
 * lands on first.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Back",
  tone = "danger",
  icon,
  busy = false,
  disabled = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  icon?: IconName;
  busy?: boolean;
  /** For a reason box that has to be filled in before the action is allowed. */
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="quiet" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            busy={busy}
            disabled={disabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {icon ? (
        <span
          aria-hidden
          className={`mb-3 flex size-10 items-center justify-center rounded-md border ${
            tone === "danger"
              ? "border-bad-line bg-bad-wash text-bad"
              : "border-accent-line bg-accent-soft text-accent"
          }`}
        >
          <Icon name={icon} size={18} />
        </span>
      ) : null}
      {children}
    </Modal>
  );
}
