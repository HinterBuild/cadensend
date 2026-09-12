'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Native modal semantics provide focus containment and make the page inert. */
export function Modal({ title, children, onClose, busy = false, wide = false }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  return (
    <dialog ref={ref} aria-labelledby={titleId} aria-busy={busy}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      className={`app-dialog ${wide ? 'max-w-2xl' : 'max-w-lg'}`}>
      <div className="flex items-center justify-between gap-4 border-b border-stone-200 px-6 py-5">
        <h2 id={titleId} className="text-lg font-semibold tracking-tight">{title}</h2>
        <button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label={`Close ${title.toLowerCase()}`}>
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="p-6">{children}</div>
    </dialog>
  );
}

export function ConfirmDialog({ title, description, confirmLabel, busy, error, onConfirm, onClose }: {
  title: string; description: string; confirmLabel: string; busy: boolean; error?: string | null;
  onConfirm: () => void; onClose: () => void;
}) {
  return <Modal title={title} onClose={onClose} busy={busy}>
    <p className="text-sm leading-6 text-stone-600">{description}</p>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="mt-6 flex flex-wrap justify-end gap-3">
      <button type="button" autoFocus disabled={busy} onClick={onClose} className="button-secondary">Cancel</button>
      <button type="button" disabled={busy} onClick={onConfirm} className="button-danger">{busy ? 'Removing…' : confirmLabel}</button>
    </div>
  </Modal>;
}
