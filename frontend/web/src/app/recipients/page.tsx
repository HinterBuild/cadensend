"use client";

import { SearchField, SummaryCards } from '@/components/WorkspaceUI';

import { useCallback, useEffect, useState } from 'react';
import { UserPlus, MailCheck, Trash2, Ban, RotateCw } from 'lucide-react';
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
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await recipientApi.list();
      setRecipients(response.data ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recipients');
    } finally {
      setLoading(false);
    }
  }, []);

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
    if (!window.confirm(`Remove ${rcpt.email} from the audience?`)) return;
    setBusyId(rcpt.id);
    try {
      await recipientApi.remove(rcpt.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove recipient');
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

  if (authLoading || loading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-stone-800" role="status" aria-label="Loading recipients" />
        <p className="mt-4 text-stone-500">Loading recipients…</p>
      </div>
    );
  }

  const deliverable = recipients.filter((r) => r.verified && !r.suppressed).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-2">
        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Audience</p>
        <h1 className="font-display mt-1 text-3xl tracking-tight text-stone-900 sm:text-4xl">Recipients</h1>
        <p className="mt-2 max-w-2xl text-sm text-stone-500">
          Issues are delivered to verified recipients of your workspace. Unverified or unsubscribed
          addresses are skipped automatically.
        </p>
      </div>

      {error && (
        <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="mt-6 rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm text-green-800">
          {notice}
        </div>
      )}

      <div className="mt-6"><SummaryCards items={[{ label: 'Recipients', value: recipients.length }, { label: 'Ready to receive', value: deliverable }, { label: 'Awaiting verification', value: recipients.filter(r => !r.verified && !r.suppressed).length }]} /></div>
      <form onSubmit={handleAdd} className="mt-8 flex flex-col gap-3 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="reader@example.com"
          aria-label="Recipient email"
          className="flex-1 rounded-lg border border-stone-300 px-3 py-2.5 text-stone-900 bg-white focus-visible:ring-2 focus-visible:ring-stone-800 focus-visible:border-transparent"
        />
        <button
          type="submit"
          disabled={adding}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
        >
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          {adding ? 'Adding…' : 'Add recipient'}
        </button>
      </form>

      <p className="mt-3 text-xs text-stone-500">
        {deliverable} of {recipients.length} recipient{recipients.length === 1 ? '' : 's'} will receive sends.
      </p>

      <div className="mt-6"><SearchField label="Search recipients" placeholder="Find an email address…" value={query} onChange={setQuery} /></div>
      {recipients.length > 0 && !recipients.some(r => r.email.toLowerCase().includes(query.trim().toLowerCase())) && <p role="status" className="mt-4 text-sm text-stone-600">No recipients match. <button type="button" onClick={() => setQuery('')} className="underline">Clear search</button></p>}
      <ul className="mt-6 divide-y divide-[#efe8dc] rounded-lg border border-[#e7e0d6] bg-white">
        {recipients.length === 0 ? (
          <li className="px-6 py-12 text-center text-sm text-stone-500">
            No recipients yet. Add the people who should receive your series.
          </li>
        ) : (
          recipients.filter(r => r.email.toLowerCase().includes(query.trim().toLowerCase())).map((rcpt) => (
            <li key={rcpt.id} className="flex items-center gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
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
                  disabled={busyId === rcpt.id}
                  title="Resend verification email"
                  aria-label={`Resend verification to ${rcpt.email}`}
                  className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-800 disabled:opacity-50"
                >
                  <MailCheck className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={() => toggleSuppressed(rcpt)}
                disabled={busyId === rcpt.id}
                title={rcpt.suppressed ? 'Resume sending' : 'Stop sending (unsubscribe)'}
                aria-label={rcpt.suppressed ? `Resume sending to ${rcpt.email}` : `Unsubscribe ${rcpt.email}`}
                className={`rounded-lg p-2 disabled:opacity-50 ${
                  rcpt.suppressed ? 'text-emerald-700 hover:bg-emerald-50' : 'text-amber-700 hover:bg-amber-50'
                }`}
              >
                {rcpt.suppressed ? <RotateCw className="h-4 w-4" aria-hidden="true" /> : <Ban className="h-4 w-4" aria-hidden="true" />}
              </button>
              <button
                type="button"
                onClick={() => handleRemove(rcpt)}
                disabled={busyId === rcpt.id}
                title="Remove recipient"
                aria-label={`Remove ${rcpt.email}`}
                className="rounded-lg p-2 text-stone-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
