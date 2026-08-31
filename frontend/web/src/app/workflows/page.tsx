"use client";

import { useEffect, useState } from 'react';
import { platformApi } from '@/lib/api';
import { useRequireAuth } from '@/contexts/AuthContext';
import type { PlatformWorkflow } from '@/types';

export default function WorkflowsPage() {
  const { loading: authLoading } = useRequireAuth();
  const [workflows, setWorkflows] = useState<PlatformWorkflow[]>([]);
  const [selected, setSelected] = useState<PlatformWorkflow | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    platformApi.workflows()
      .then((r) => setWorkflows(r.data ?? []))
      .finally(() => setLoading(false));
  }, [authLoading]);

  const pipelines = workflows.filter((w) => w.category === 'pipeline');
  const agents = workflows.filter((w) => w.category === 'agent');
  const modes = workflows.filter((w) => w.category === 'mode');

  const runWorkflow = async (wf: PlatformWorkflow) => {
    setRunning(true);
    setResult(null);
    try {
      const res = await platformApi.runWorkflow(wf.id, { topic: 'Sample newsletter', goal: 'Test workflow' }, '');
      const data = (res as { data?: { final?: string; status?: string } }).data;
      setResult(data?.final?.slice(0, 500) ?? data?.status ?? 'Complete');
    } catch (e) {
      setResult(e instanceof Error ? e.message : 'Run failed');
    } finally {
      setRunning(false);
    }
  };

  if (authLoading || loading) {
    return <div className="p-8 text-stone-500">Loading workflows…</div>;
  }

  const Section = ({ title, items }: { title: string; items: PlatformWorkflow[] }) => (
    <section className="mb-10">
      <h2 className="mb-4 font-display text-xl text-stone-900">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((wf) => (
          <button
            key={wf.id}
            type="button"
            onClick={() => setSelected(wf)}
            className={`rounded-2xl border p-4 text-left transition-colors ${
              selected?.id === wf.id ? 'border-stone-900 bg-stone-50' : 'border-[#e7e0d6] bg-white hover:border-stone-400'
            }`}
          >
            <h3 className="font-medium text-stone-900">{wf.name}</h3>
            <p className="mt-1 text-sm text-stone-600">{wf.description}</p>
          </button>
        ))}
      </div>
    </section>
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-8">
        <h1 className="font-display text-3xl text-stone-900">Agent Workflows</h1>
        <p className="mt-2 max-w-2xl text-sm text-stone-600">
          Visual workflow builder foundation: multi-agent pipelines, specialist agents, and generation modes.
          Assign a workflow mode to a series to apply it during issue generation.
        </p>
      </header>

      <Section title="Multi-agent pipelines" items={pipelines} />
      <Section title="Specialist agents" items={agents} />
      <Section title="Generation modes" items={modes} />

      {selected && (
        <div className="rounded-2xl border border-[#e7e0d6] bg-white p-6">
          <h3 className="font-display text-lg text-stone-900">{selected.name}</h3>
          <p className="mt-1 text-sm text-stone-600">{selected.description}</p>
          <button
            type="button"
            disabled={running}
            onClick={() => runWorkflow(selected)}
            className="mt-4 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {running ? 'Running…' : 'Dry-run workflow'}
          </button>
          {result && (
            <pre className="mt-4 max-h-48 overflow-auto rounded-xl bg-[#faf8f5] p-4 text-xs text-stone-700">{result}</pre>
          )}
        </div>
      )}
    </div>
  );
}
