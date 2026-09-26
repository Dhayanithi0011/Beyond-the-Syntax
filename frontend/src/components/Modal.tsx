import { ReactNode } from "react";

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-black/70 px-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`animate-pop-in card w-full ${wide ? "max-w-2xl" : "max-w-sm"} p-0 overflow-hidden`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="font-semibold text-text">{title}</h3>
          <button aria-label="Close dialog" className="text-muted hover:text-text" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-3 border-t border-line px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}