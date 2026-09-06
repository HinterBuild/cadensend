'use client';

import { Check, ShieldCheck, X } from 'lucide-react';
import type { AssistantMessage } from '@/types/assistant';

type PermissionCardProps = {
  message: AssistantMessage;
  onApprove: () => void;
  onDeny: () => void;
  busy?: boolean;
};

export function PermissionCard({ message, onApprove, onDeny, busy }: PermissionCardProps) {
  const perm = message.permission;
  if (!perm) return null;

  const done = perm.status === 'done';
  const denied = perm.status === 'denied';
  const pending = perm.status === 'pending';

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-b from-amber-50 to-white shadow-sm">
      <div className="flex items-start gap-3 border-b border-amber-100 px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stone-900">Approval required</p>
          <p className="mt-0.5 text-sm text-stone-600">{perm.label}</p>
        </div>
      </div>

      <div className="px-4 py-3">
        {pending && (
          <p className="text-xs text-stone-500">Review the details below, then approve to run this in your workspace.</p>
        )}
        {perm.status === 'executing' && (
          <p className="text-xs text-stone-500">Executing…</p>
        )}
        {done && <p className="text-xs font-medium text-emerald-700">Completed successfully.</p>}
        {denied && <p className="text-xs text-stone-500">Action cancelled.</p>}
        {perm.status === 'error' && (
          <p className="text-xs text-red-700">{perm.error || 'Action failed.'}</p>
        )}

        {pending && Object.keys(perm.payload).length > 0 && (
          <dl className="mt-3 space-y-1.5 rounded-xl bg-white/80 p-3 ring-1 ring-amber-100">
            {Object.entries(perm.payload).map(([key, value]) => (
              <div key={key} className="grid grid-cols-[minmax(0,7rem)_1fr] gap-2 text-xs">
                <dt className="font-medium capitalize text-stone-500">{key.replace(/_/g, ' ')}</dt>
                <dd className="break-words text-stone-800">{String(value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {pending && (
        <div className="flex gap-2 border-t border-amber-100 bg-amber-50/50 px-4 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={onApprove}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDeny}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
