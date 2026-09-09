"use client";

import { useEffect, useState } from 'react';
import { platformApi } from '@/lib/api';
import { useRequireAuth } from '@/contexts/AuthContext';
import { ConnectorLogo } from '@/lib/connectorLogos';
import type { PlatformConnector } from '@/types';

export default function ConnectorsPage() {
  const { loading: authLoading } = useRequireAuth();
  const [connectors, setConnectors] = useState<PlatformConnector[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [configuring, setConfiguring] = useState<PlatformConnector | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);

  const load = () => {
    platformApi.connectors()
      .then((r) => setConnectors(r.data ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading]);

  const handleSync = async (id: string, name?: string) => {
    setSyncing(id);
    setSyncResult(null);
    try {
      const result = await platformApi.syncConnector(id, { oauth_connected: Boolean(apiKey) });
      const status = (result as { status?: string }).status ?? 'completed';
      const fetched = (result as { items_fetched?: number }).items_fetched ?? 0;
      const label = name || id;
      setSyncResult(`${label}: ${status} (${fetched} items fetched)`);
    } catch (e) {
      setSyncResult(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(null);
    }
  };

  const handleSaveConfig = async () => {
    if (!configuring) return;
    setSavingConfig(true);
    try {
      await platformApi.saveConnectorConfig(configuring.id, {
        api_key: apiKey,
        oauth_connected: Boolean(apiKey),
      });
      setConfiguring(null);
      setApiKey('');
      load();
      setSyncResult(`${configuring.name} configured.`);
    } catch (e) {
      setSyncResult(e instanceof Error ? e.message : 'Failed to save config');
    } finally {
      setSavingConfig(false);
    }
  };

  if (authLoading || loading) {
    return <div className="p-8 text-stone-500">Loading connectors…</div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-8">
        <h1 className="font-display text-3xl text-stone-900">Connectors</h1>
        <p className="mt-2 max-w-2xl text-sm text-stone-600">
          Connect apps and sync content into your source library.
        </p>
      </header>

      {syncResult && (
        <p className="mb-4 rounded-xl border border-[#e7e0d6] bg-[#faf8f5] px-4 py-2 text-sm text-stone-700">{syncResult}</p>
      )}

      {configuring && (
        <div className="mb-6 rounded-2xl border border-stone-900 bg-white p-6">
          <div className="flex items-center gap-3">
            <ConnectorLogo id={configuring.id} name={configuring.name} domain={configuring.domain} logoUrl={configuring.logo_url} />
            <div>
              <h2 className="font-display text-lg text-stone-900">Configure {configuring.name}</h2>
              <p className="mt-0.5 text-sm text-stone-600">Auth: {configuring.auth}</p>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-stone-700 mb-1">API key / access token</label>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
              className="w-full max-w-md rounded-xl border border-[#e7e0d6] px-3 py-2 text-sm" />
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={handleSaveConfig} disabled={savingConfig}
              className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {savingConfig ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setConfiguring(null)}
              className="rounded-lg border border-[#e7e0d6] px-4 py-2 text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {connectors.map((c) => (
          <article key={c.id} className="rounded-2xl border border-[#e7e0d6] bg-white p-5">
            <div className="mb-3 flex items-start gap-3">
              <ConnectorLogo id={c.id} name={c.name} domain={c.domain} logoUrl={c.logo_url} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-lg text-stone-900">{c.name}</h2>
                  <span className="shrink-0 text-xs uppercase tracking-wide text-stone-400">{c.auth}</span>
                </div>
              </div>
            </div>
            {(c as PlatformConnector & { configured?: boolean }).configured && (
              <span className="mb-2 inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">Configured</span>
            )}
            <p className="text-sm text-stone-600">{c.description}</p>
            <p className="mt-2 text-xs text-stone-500">Syncs: {c.sync || '—'}</p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setConfiguring(c)}
                className="rounded-lg border border-[#e7e0d6] px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-[#faf8f5]">
                Configure
              </button>
              <button type="button" disabled={syncing === c.id} onClick={() => handleSync(c.id, c.name)}
                className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                {syncing === c.id ? 'Syncing…' : 'Sync'}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
