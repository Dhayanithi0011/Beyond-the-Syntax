import { useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";
import { api } from "../services/api";

/**
 * Anti-cheat visibility watcher. While mounted, any hidden->visible browser
 * transition is treated as a suspected tab/window switch: a blocking-style
 * popup is shown to the participant and (when `notifyUrl` is provided) the
 * event is reported to the backend audit trail for admins.
 */
export function TabSwitchWatcher({ context = "the exam", notifyUrl }: { context?: string; notifyUrl?: string }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const hiddenSinceRef = useRef<number | null>(null);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        hiddenSinceRef.current = Date.now();
      } else if (hiddenSinceRef.current) {
        hiddenSinceRef.current = null;
        setCount((c) => c + 1);
        if (notifyUrl) {
          api.post(notifyUrl, { switched_at: new Date().toISOString() }).catch(() => {});
        }
        setOpen(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [notifyUrl]);

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Tab switch detected">
      <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
        <p className="text-sm">
          You switched away from <span className="font-semibold text-text">{context}</span>. This switch has been
          noticed and recorded.
        </p>
        <p className="mt-2 text-sm text-muted">Please stay on this tab for the rest of the round.</p>
      </div>
      <p className="mt-3 text-xs font-medium text-warning">
        {count > 1 ? `Tab switches noticed: ${count}.` : "Tab switch noticed: 1."}
      </p>
      <button className="btn-primary mt-4 flex w-full justify-center py-2.5 text-sm" onClick={() => setOpen(false)}>
        I understand — continue
      </button>
    </Modal>
  );
}