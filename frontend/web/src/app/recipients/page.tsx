"use client";

import { SearchField, SummaryCards, PageHeader, PageSkeleton, ErrorNotice, EmptyResults } from '@/components/WorkspaceUI';

import { useCallback, useEffect, useState } from 'react';
import { UserPlus, MailCheck, Trash2, Ban, RotateCw } from 'lucide-react';
import { ConfirmDialog } from '@/components/Modal';
import { recipientApi } from '@/lib/api';
import { Recipient } from '@/types';
import { useRequireAuth } from '@/contexts/AuthContext';

export default function RecipientsPage() {
  const { loading: authLoading } = useRequireAuth();
  const [query, setQuery] = useState('');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Recipient | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => recipientApi.list()
    .then(response => { setRecipients(response.data ?? []); setError(null); })
    .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load recipients'))
    .finally(() => setLoading(false)), []);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setAdding(true);
    setError(null);
    setNotice('');
    try {
      const response = await recipientApi.create(email.trim());
      setNotice(response.warning || `Verification email sent to ${email.trim()}.`);
      setEmail('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add recipient');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (rcpt: Recipient) => {
    setDeleteError('');
    setBusyId(rcpt.id);
    try {
      await recipientApi.remove(rcpt.id);
      setSelected(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to remove recipient');
    } finally {
      setBusyId(null);
    }
  };

  const handleResend = async (rcpt: Recipient) => {
    setBusyId(rcpt.id);
    setNotice('');
    try {
      await recipientApi.resendVerification(rcpt.id);
      setNotice(`Verification re-sent to ${rcpt.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend verification');
    } finally {
      setBusyId(null);
    }
  };

  const toggleSuppressed = async (rcpt: Recipient) => {
    setBusyId(rcpt.id);
    try {
      await recipientApi.setSuppressed(rcpt.id, !rcpt.suppressed);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update recipient');
    } finally {
      setBusyId(null);
    }
  };

  if (authLoading || loading) return <PageSkeleton label="Loading recipients" />;

  const deliverable = recipients.filter((r) => r.verified && !r.suppressed).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
      <PageHeader eyebrow="Audience" title="Recipients" description="Manage the people who receive your series. Only verified, subscribed addresses receive email." />
      {error && <ErrorNotice onRetry={() => void load()}>{error}</ErrorNotice>}
      {notice && (
        <div role="status" className="mt-6 rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm text-green-800">
          {notice}
        </div>
      )}

      <div className="mt-6"><SummaryCards items={[{ label: 'Recipients', value: recipients.length }, { label: 'Ready to receive', value: deliverable }, { label: 'Awaiting verification', value: recipients.filter(r => !r.verified && !r.suppressed).length }]} /></div>
      <form onSubmit={handleAdd} className="surface mt-6 flex flex-col gap-3 p-5 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="reader@example.com"
          autoComplete="email"
          disabled={adding}
          aria-label="Recipient email"
          className="field-input min-w-0 flex-1"
        />
        <button
          type="submit"
          disabled={adding}
          className="button-primary"
        >
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          {adding ? 'Adding…' : 'Add recipient'}
        </button>
      </form>

      <p className="mt-3 text-xs text-stone-500">
        {deliverable} of {recipients.length} recipient{recipients.length === 1 ? '' : 's'} will receive sends.
      </p>

      <div className="mt-6"><SearchField label="Search recipients" placeholder="Find an email address…" value={query} onChange={setQuery} /></div>
      {recipients.length > 0 && !recipients.some(r => r.email.toLowerCase().includes(query.trim().toLowerCase())) && <div className="mt-5"><EmptyResults onClear={() => setQuery('')} /></div>}
      <ul className="surface mt-6 divide-y divide-stone-100 empty:hidden">
        {recipients.length === 0 ? (
          <li className="px-6 py-12 text-center text-sm text-stone-500">
            No recipients yet. Add the people who should receive your series.
          </li>
        ) : (
          recipients.filter(r => r.email.toLowerCase().includes(query.trim().toLowerCase())).map((rcpt) => (
            <li key={rcpt.id} className="flex flex-wrap items-center gap-2 px-4 py-4 sm:gap-3 sm:px-5">
              <div className="min-w-0 basis-full sm:flex-1">
                <p className="truncate text-sm font-medium text-stone-900">{rcpt.email}</p>
                <p className="mt-0.5 text-xs text-stone-500">
                  {rcpt.suppressed ? (
                    <>Suppressed ({rcpt.suppression_reason || 'unsubscribed'})</>
                  ) : rcpt.verified ? (
                    <>Verified</>
                  ) : (
                    <>Awaiting verification</>
                  )}
                </p>
              </div>
              {!rcpt.verified && !rcpt.suppressed && (
                <button
                  type="button"
                  onClick={() => handleResend(rcpt)}
                  disabled={busyId !== null}
                  title="Resend verification email"
                  aria-label={`Resend verification to ${rcpt.email}`}
                  className="icon-button"
                >
                  <MailCheck className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={() => toggleSuppressed(rcpt)}
                disabled={busyId !== null}
                title={rcpt.suppressed ? 'Resume sending' : 'Stop sending (unsubscribe)'}
                aria-label={rcpt.suppressed ? `Resume sending to ${rcpt.email}` : `Unsubscribe ${rcpt.email}`}
                className={`icon-button ${
                  rcpt.suppressed ? 'text-emerald-700 hover:bg-emerald-50' : 'text-amber-700 hover:bg-amber-50'
                }`}
              >
                {rcpt.suppressed ? <RotateCw className="h-4 w-4" aria-hidden="true" /> : <Ban className="h-4 w-4" aria-hidden="true" />}
              </button>
              <button
                type="button"
                onClick={() => { setDeleteError(''); setSelected(rcpt); }}
                disabled={busyId !== null}
                title="Remove recipient"
                aria-label={`Remove ${rcpt.email}`}
                className="icon-button hover:!bg-red-50 hover:!text-red-700"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))
        )}
      </ul>
      {selected && <ConfirmDialog title="Remove recipient?" description={`Remove ${selected.email} from your audience? They will no longer receive your series.`} confirmLabel="Remove recipient" busy={busyId !== null} error={deleteError} onConfirm={() => void handleRemove(selected)} onClose={() => setSelected(null)} />}
    </div>
  );
}
