"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown, GitBranch, Sparkles, Wand2 } from 'lucide-react';
import { platformApi, seriesApi } from '@/lib/api';
import { useRequireAuth } from '@/contexts/AuthContext';
import type { PlatformWorkflow, Series } from '@/types';

type RecommendedPreset = {
  id: string;
  name: string;
  tagline: string;
  when: string;
  steps: string[];
};

const RECOMMENDED: RecommendedPreset[] = [
  {
    id: 'default',
    name: 'Standard',
    tagline: 'Fastest — one AI pass',
    when: 'Simple newsletters and quick first drafts',
    steps: ['Write draft'],
  },
  {
    id: 'researcher_writer_editor',
    name: 'Research flow',
    tagline: 'Research → write → edit',
    when: 'Long-form or educational series that need structure',
    steps: ['Research', 'Write', 'Edit'],
  },
  {
    id: 'source_first',
    name: 'Source-grounded',
    tagline: 'Only uses your ingested sources',
    when: 'Fact-heavy content where citations matter',
    steps: ['Retrieve sources', 'Write with evidence'],
  },
  {
    id: 'comparison',
    name: 'Compare models',
    tagline: 'Merge outputs from multiple models',
    when: 'When you want the strongest combined draft',
    steps: ['Draft A', 'Draft B', 'Merge best parts'],
  },
];

const SECTIONS = [
  { key: 'pipeline', title: 'Writing flows', subtitle: 'AI runs multiple steps in order', defaultOpen: false },
  { key: 'agent', title: 'Add-on reviewers', subtitle: 'Optional checks before you approve an issue', defaultOpen: false },
  { key: 'mode', title: 'Writing strategies', subtitle: 'How the AI approaches the draft', defaultOpen: false },
] as const;

function workflowSteps(wf: PlatformWorkflow): string[] {
  const agents = wf.metadata?.agents;
  if (Array.isArray(agents)) {
    return agents.map((a) => String(a).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
  }
  const role = wf.metadata?.role;
  if (typeof role === 'string') return [role.replace(/_/g, ' ')];
  return [];
}

function FlowSteps({ steps }: { steps: string[] }) {
  if (!steps.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-stone-600">
      {steps.map((step, i) => (
        <span key={`${step}-${i}`} className="inline-flex items-center gap-1.5">
          {i > 0 && <ArrowRight className="h-3 w-3 shrink-0 text-stone-400" aria-hidden="true" />}
          <span className="rounded-md bg-[#faf8f5] px-2 py-0.5 capitalize">{step}</span>
        </span>
      ))}
    </div>
  );
}

function resolveWorkflow(id: string, workflows: PlatformWorkflow[]): PlatformWorkflow | null {
  const preset = RECOMMENDED.find((p) => p.id === id);
  if (preset) {
    return {
      id: preset.id,
      name: preset.name,
      description: preset.when,
      category: 'mode',
    };
  }
  return workflows.find((w) => w.id === id) ?? null;
}

function presetSteps(id: string): string[] {
  return RECOMMENDED.find((p) => p.id === id)?.steps ?? [];
}

export default function WorkflowsPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const userId = user?.id;
  const loadedForUser = useRef<string | null>(null);

  const [workflows, setWorkflows] = useState<PlatformWorkflow[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [selectedId, setSelectedId] = useState('researcher_writer_editor');
  const [seriesId, setSeriesId] = useState('');
  const [filter, setFilter] = useState('');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SECTIONS.map((s) => [s.key, s.defaultOpen])),
  );
  const [workflowsLoading, setWorkflowsLoading] = useState(true);
  const [seriesLoading, setSeriesLoading] = useState(true);
  const [workflowsError, setWorkflowsError] = useState<string | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [assignNotice, setAssignNotice] = useState<string | null>(null);
  const [previewTopic, setPreviewTopic] = useState('Weekly product update');
  const [previewGoal, setPreviewGoal] = useState('Keep readers informed about what shipped this week');
  const [previewing, setPreviewing] = useState(false);
  const [previewStep, setPreviewStep] = useState(0);
  const [previewResult, setPreviewResult] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (authLoading || !userId) return;
    if (loadedForUser.current === userId) return;
    loadedForUser.current = userId;

    setWorkflowsLoading(true);
    setWorkflowsError(null);
    platformApi.workflows()
      .then((r) => setWorkflows(Array.isArray(r.data) ? r.data : []))
      .catch((e) => {
        setWorkflowsError(e instanceof Error ? e.message : 'Failed to load workflows');
        setWorkflows([]);
      })
      .finally(() => setWorkflowsLoading(false));

    setSeriesLoading(true);
    setSeriesError(null);
    seriesApi.list()
      .then((r) => {
        const list = r.series ?? [];
        setSeriesList(list);
        if (list.length > 0) setSeriesId(list[0].id);
      })
      .catch((e) => {
        setSeriesError(e instanceof Error ? e.message : 'Failed to load series');
        setSeriesList([]);
      })
      .finally(() => setSeriesLoading(false));
  }, [authLoading, userId]);

  const selected = useMemo(() => resolveWorkflow(selectedId, workflows), [selectedId, workflows]);

  const selectedSteps = useMemo(() => {
    const preset = presetSteps(selectedId);
    if (preset.length) return preset;
    if (!selected || selected.id === selectedId && RECOMMENDED.some((p) => p.id === selectedId)) return [];
    return workflowSteps(selected);
  }, [selected, selectedId]);

  const filteredByCategory = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const match = (wf: PlatformWorkflow) =>
      !q ||
      wf.name.toLowerCase().includes(q) ||
      wf.description.toLowerCase().includes(q) ||
      wf.category.toLowerCase().includes(q);

    return {
      pipeline: workflows.filter((w) => w.category === 'pipeline' && match(w)),
      agent: workflows.filter((w) => w.category === 'agent' && match(w)),
      mode: workflows.filter((w) => w.category === 'mode' && match(w)),
    };
  }, [workflows, filter]);

  const pickWorkflow = (id: string) => {
    setSelectedId(id);
    setAssignNotice(null);
    setPreviewResult(null);
    setShowPreview(false);
  };

  const assignToSeries = async () => {
    if (!seriesId || !selectedId) return;
    setAssigning(true);
    setAssignNotice(null);
    try {
      await platformApi.updateSeriesPlatform(seriesId, selectedId);
      const series = seriesList.find((s) => s.id === seriesId);
      setSeriesList((prev) =>
        prev.map((s) => (s.id === seriesId ? { ...s, workflow_mode: selectedId } : s)),
      );
      setAssignNotice(`Applied “${selected?.name ?? selectedId}” to ${series?.topic ?? 'your series'}.`);
    } catch (e) {
      setAssignNotice(e instanceof Error ? e.message : 'Failed to assign workflow');
    } finally {
      setAssigning(false);
    }
  };

  const runPreview = async () => {
    if (selectedId === 'default') {
      setPreviewResult('Standard mode uses a single generation pass. Assign it to a series, then generate an issue to see the output.');
      return;
    }
    setPreviewing(true);
    setPreviewResult(null);
    setPreviewStep(0);
    setShowPreview(true);
    const steps = selectedSteps.length ? selectedSteps : ['Running workflow'];
    const stepTimer = window.setInterval(() => {
      setPreviewStep((n) => (n < steps.length - 1 ? n + 1 : n));
    }, 900);
    try {
      const res = await platformApi.runWorkflow(
        selectedId,
        { topic: previewTopic, goal: previewGoal },
        '',
      );
      const data = (res as { data?: { final?: string; status?: string } }).data;
      setPreviewResult(data?.final?.slice(0, 1200) ?? data?.status ?? 'Preview complete.');
    } catch (e) {
      setPreviewResult(e instanceof Error ? e.message : 'Preview failed. You can still assign this workflow to a series.');
    } finally {
      window.clearInterval(stepTimer);
      setPreviewStep(steps.length - 1);
      setPreviewing(false);
    }
  };

  if (authLoading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-stone-200" />
        <div className="mt-4 h-4 w-full max-w-xl animate-pulse rounded bg-stone-100" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-36 animate-pulse rounded-2xl bg-stone-100" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-8">
        <h1 className="font-display text-3xl text-stone-900">How your newsletter gets written</h1>
        <p className="mt-2 max-w-2xl text-sm text-stone-600">
          <strong className="font-medium text-stone-800">Skills</strong> choose what kind of newsletter you write.{' '}
          <strong className="font-medium text-stone-800">Workflows</strong> choose how the AI produces each issue.
          Pick a workflow below, then assign it to a series.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link href="/skills" className="inline-flex items-center gap-1.5 rounded-lg border border-[#e7e0d6] bg-white px-3 py-1.5 !text-stone-700 no-underline hover:bg-[#faf8f5]">
            <Wand2 className="h-4 w-4" aria-hidden="true" />
            Browse skills
          </Link>
          <Link href="/series/create" className="inline-flex items-center gap-1.5 rounded-lg border border-[#e7e0d6] bg-white px-3 py-1.5 !text-stone-700 no-underline hover:bg-[#faf8f5]">
            <GitBranch className="h-4 w-4" aria-hidden="true" />
            Create series
          </Link>
        </div>
      </header>

      <section className="mb-10">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-600" aria-hidden="true" />
          <h2 className="font-display text-xl text-stone-900">Recommended to start</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {RECOMMENDED.map((preset) => {
            const active = selectedId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => pickWorkflow(preset.id)}
                className={`rounded-2xl border p-5 text-left transition-shadow ${
                  active ? 'border-stone-900 bg-stone-50 shadow-sm' : 'border-[#e7e0d6] bg-white hover:border-stone-400 hover:shadow-md'
                }`}
              >
                <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{preset.tagline}</p>
                <h3 className="mt-1 font-display text-lg text-stone-900">{preset.name}</h3>
                <p className="mt-2 text-sm text-stone-600">{preset.when}</p>
                <FlowSteps steps={preset.steps} />
              </button>
            );
          })}
        </div>
      </section>

      <section className="mb-10 rounded-2xl border border-[#e7e0d6] bg-white p-6">
        <h2 className="font-display text-lg text-stone-900">Assign to a series</h2>
        <p className="mt-1 text-sm text-stone-600">
          Selected: <strong>{selected?.name ?? selectedId}</strong>
          {selected?.description ? ` — ${selected.description}` : ''}
        </p>
        {selectedSteps.length > 0 && <FlowSteps steps={selectedSteps} />}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm">
            <span className="mb-1 block font-medium text-stone-700">Series</span>
            {seriesLoading ? (
              <div className="h-10 animate-pulse rounded-xl bg-stone-100" />
            ) : (
              <select
                value={seriesId}
                onChange={(e) => setSeriesId(e.target.value)}
                disabled={seriesList.length === 0}
                className="w-full rounded-xl border border-[#e7e0d6] bg-white px-3 py-2.5 text-sm text-stone-900 disabled:opacity-60"
              >
                {seriesList.length === 0 && <option value="">No series yet — create one first</option>}
                {seriesList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.topic}
                    {s.workflow_mode && s.workflow_mode !== 'default' ? ` · ${s.workflow_mode.replace(/_/g, ' ')}` : ''}
                  </option>
                ))}
              </select>
            )}
          </label>
          <button
            type="button"
            disabled={assigning || seriesLoading || !seriesId || !selectedId}
            onClick={assignToSeries}
            className="rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {assigning ? 'Applying…' : 'Use on series'}
          </button>
          <Link
            href={`/series/create?workflow=${encodeURIComponent(selectedId)}`}
            className="rounded-lg border border-[#e7e0d6] px-5 py-2.5 text-center text-sm font-medium !text-stone-700 no-underline hover:bg-[#faf8f5]"
          >
            New series with this flow
          </Link>
        </div>
        {seriesError && <p className="mt-2 text-sm text-amber-700">{seriesError}</p>}
        {assignNotice && (
          <p className={`mt-3 text-sm ${assignNotice.startsWith('Applied') ? 'text-emerald-700' : 'text-red-600'}`}>
            {assignNotice}
            {assignNotice.startsWith('Applied') && seriesId && (
              <>
                {' '}
                <Link href={`/series/${seriesId}`} className="underline">
                  Open series
                </Link>
              </>
            )}
          </p>
        )}
      </section>

      <div className="mb-6 rounded-2xl border border-[#e7e0d6] bg-[#faf8f5] p-4 text-sm text-stone-700">
        <p className="font-medium text-stone-900">Skills vs workflows</p>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          <li><span className="font-medium">Skill</span> — what to write (digest, investor update, tutorial)</li>
          <li><span className="font-medium">Workflow</span> — how AI writes it (single pass, research flow, source-grounded)</li>
        </ul>
      </div>

      <input
        type="search"
        placeholder="Search all workflows…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="mb-6 w-full max-w-md rounded-xl border border-[#e7e0d6] bg-white px-4 py-2.5 text-sm"
      />

      {workflowsError && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {workflowsError} — recommended presets above still work.
        </div>
      )}

      {workflowsLoading ? (
        <div className="space-y-3">
          {[1, 2].map((n) => (
            <div key={n} className="h-16 animate-pulse rounded-xl bg-stone-100" />
          ))}
        </div>
      ) : (
        SECTIONS.map((section) => {
          const items = filteredByCategory[section.key];
          if (!items.length && filter) return null;
          const open = openSections[section.key];
          return (
            <section key={section.key} className="mb-6">
              <button
                type="button"
                onClick={() => setOpenSections((prev) => ({ ...prev, [section.key]: !prev[section.key] }))}
                className="flex w-full items-center justify-between rounded-xl border border-[#e7e0d6] bg-white px-4 py-3 text-left"
              >
                <div>
                  <h2 className="font-display text-lg text-stone-900">{section.title}</h2>
                  <p className="text-sm text-stone-600">{section.subtitle}</p>
                </div>
                <span className="flex items-center gap-2 text-sm text-stone-500">
                  {items.length}
                  <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                </span>
              </button>
              {open && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {items.map((wf) => (
                    <button
                      key={wf.id}
                      type="button"
                      onClick={() => pickWorkflow(wf.id)}
                      className={`rounded-2xl border p-4 text-left transition-colors ${
                        selectedId === wf.id ? 'border-stone-900 bg-stone-50' : 'border-[#e7e0d6] bg-white hover:border-stone-400'
                      }`}
                    >
                      <h3 className="font-medium text-stone-900">{wf.name}</h3>
                      <p className="mt-1 text-sm text-stone-600">{wf.description}</p>
                      <FlowSteps steps={workflowSteps(wf)} />
                    </button>
                  ))}
                </div>
              )}
            </section>
          );
        })
      )}

      <section className="mt-10 rounded-2xl border border-[#e7e0d6] bg-white p-6">
        <h2 className="font-display text-lg text-stone-900">Optional: preview before assigning</h2>
        <p className="mt-1 text-sm text-stone-600">
          Runs a sample generation (can take 10–30s). You can assign a workflow without previewing.
        </p>
        {!showPreview ? (
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="mt-4 rounded-lg border border-[#e7e0d6] px-4 py-2 text-sm font-medium text-stone-800 hover:bg-[#faf8f5]"
          >
            Open preview panel
          </button>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-stone-700">Topic</span>
                <input
                  value={previewTopic}
                  onChange={(e) => setPreviewTopic(e.target.value)}
                  className="w-full rounded-xl border border-[#e7e0d6] px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-stone-700">Goal</span>
                <input
                  value={previewGoal}
                  onChange={(e) => setPreviewGoal(e.target.value)}
                  className="w-full rounded-xl border border-[#e7e0d6] px-3 py-2 text-sm"
                />
              </label>
            </div>
            {selectedSteps.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2" role="status" aria-live="polite">
                {selectedSteps.map((step, i) => (
                  <span
                    key={step}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      previewing && i <= previewStep
                        ? 'bg-stone-900 text-white'
                        : previewResult && i <= previewStep
                        ? 'bg-emerald-100 text-emerald-900'
                        : 'bg-[#faf8f5] text-stone-600'
                    }`}
                  >
                    {step}
                  </span>
                ))}
              </div>
            )}
            <button
              type="button"
              disabled={previewing}
              onClick={runPreview}
              className="mt-4 rounded-lg border border-[#e7e0d6] px-4 py-2 text-sm font-medium text-stone-800 hover:bg-[#faf8f5] disabled:opacity-50"
            >
              {previewing ? 'Running preview (this may take a while)…' : `Preview “${selected?.name ?? selectedId}”`}
            </button>
            {previewResult && (
              <div className="mt-4 rounded-xl bg-[#faf8f5] p-4 text-sm leading-relaxed text-stone-700 whitespace-pre-wrap">
                {previewResult}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
