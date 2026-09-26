import { createContext, useCallback, useContext, useState, ReactNode } from "react";

type ToastKind = "success" | "error" | "warning" | "info";

type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
};

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi>({
  success: () => {},
  error: () => {},
  warning: () => {},
  info: () => {},
});

const ICONS: Record<ToastKind, string> = {
  success: "✓",
  error: "✕",
  warning: "⚠",
  info: "ℹ",
};

const STYLES: Record<ToastKind, string> = {
  success: "border-success/40 text-success",
  error: "border-danger/40 text-danger",
  warning: "border-warning/40 text-warning",
  info: "border-primary/40 text-primary",
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev.slice(-3), { id, kind, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  const api: ToastApi = {
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    warning: (m) => push("warning", m),
    info: (m) => push("info", m),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        role="status"
        className="fixed top-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-toast-in pointer-events-auto flex items-start gap-3 rounded-lg border bg-surface/95 backdrop-blur px-4 py-3 shadow-lg shadow-black/10 ${STYLES[t.kind]}`}
          >
            <span aria-hidden className="mt-0.5 shrink-0">{ICONS[t.kind]}</span>
            <p className="text-sm text-text leading-snug">{t.message}</p>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);