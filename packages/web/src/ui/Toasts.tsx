import { useEffect } from 'react';
import { useApp, useGame } from './context.ts';
import type { Toast } from '../store/state.ts';

const TTL_MS = 5000;
/** Only the newest few: a burst of events shouldn't wall off the screen. */
const MAX_VISIBLE = 3;

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.slice(-MAX_VISIBLE).map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const { controller } = useApp();
  useEffect(() => {
    const h = setTimeout(() => controller.dismissToast(toast.id), TTL_MS);
    return () => clearTimeout(h);
  }, [controller, toast.id]);
  return (
    <div className={`toast ${toast.kind}`}>
      {toast.text}
    </div>
  );
}
