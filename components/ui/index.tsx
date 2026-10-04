"use client";
import Link from "next/link";
import { cloneElement, useEffect, useId, useRef } from "react";
import { ArrowUpRight, LoaderCircle } from "lucide-react";
import { cx } from "@/lib/utils";
export function Button({
  children,
  className,
  variant = "primary",
  loading = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cx("button", `button-${variant}`, className)}
    >
      {loading && (
        <LoaderCircle size={17} className="spin" aria-hidden="true" />
      )}
      {children}
    </button>
  );
}
export function LinkButton({
  href,
  children,
  className,
  variant = "primary",
  arrow = false,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "ghost";
  arrow?: boolean;
}) {
  return (
    <Link href={href} className={cx("button", `button-${variant}`, className)}>
      {children}
      {arrow && (
        <ArrowUpRight size={18} className="directional" aria-hidden="true" />
      )}
    </Link>
  );
}
export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cx("badge", className)}>{children}</span>;
}
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} aria-hidden="true" />;
}
export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {children}
    </div>
  );
}
export function FormField({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactElement<{ id?: string; "aria-describedby"?: string }>;
  hint?: string;
}) {
  const id = useId();
  const controlId = children.props.id || id;
  const hintId = `${id}-hint`;
  return (
    <div className="form-field">
      <label htmlFor={controlId}>{label}</label>
      {cloneElement(children, {
        id: controlId,
        ...(hint
          ? {
              "aria-describedby": [children.props["aria-describedby"], hintId]
                .filter(Boolean)
                .join(" "),
            }
          : {}),
      })}
      {hint && <small id={hintId}>{hint}</small>}
    </div>
  );
}
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          type="button"
          onClick={onClose}
          aria-label="Close / إغلاق"
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
