'use client';

import Link from 'next/link';
import { ArrowUpRight, BookOpen, Layers } from 'lucide-react';
import type { Series } from '@/types';
import { AnalyticsPreview } from './AnalyticsPreview';

type EntityPreviewProps = {
  entityType?: string;
  output: string;
};

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function EntityPreview({ entityType, output }: EntityPreviewProps) {
  if (!entityType || !output) return null;

  if (entityType === 'analytics') {
    return <AnalyticsPreview output={output} />;
  }

  if (entityType === 'series_list') {
    const data = safeParse<{ series?: Series[] }>(output);
    const items = data?.series || [];
    if (!items.length) {
      return <p className="text-xs text-stone-500">No series found.</p>;
    }
    return (
      <div className="mt-2 grid gap-2">
        {items.slice(0, 5).map((s) => (
          <Link
            key={s.id}
            href={`/series/${s.id}`}
            className="flex items-center justify-between rounded-xl border border-[#e7e0d6] bg-[#faf8f5] px-3 py-2 text-sm no-underline hover:border-stone-300"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-stone-900">{s.topic}</p>
              <p className="truncate text-xs text-stone-500">{s.status}</p>
            </div>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-stone-400" />
          </Link>
        ))}
      </div>
    );
  }

  if (entityType === 'series') {
    const data = safeParse<{ data?: Series }>(output);
    const s = data?.data;
    if (!s) return null;
    return (
      <Link
        href={`/series/${s.id}`}
        className="mt-2 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 px-3 py-3 text-sm no-underline"
      >
        <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
        <div className="min-w-0">
          <p className="font-medium text-stone-900">{s.topic}</p>
          <p className="line-clamp-2 text-xs text-stone-600">{s.goal}</p>
        </div>
        <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-emerald-700" />
      </Link>
    );
  }

  if (entityType === 'issue_list') {
    const data = safeParse<{ data?: Array<{ id: string; title?: string; status?: string }> }>(output);
    const items = data?.data || [];
    if (!items.length) return <p className="text-xs text-stone-500">No issues yet.</p>;
    return (
      <div className="mt-2 grid gap-2">
        {items.slice(0, 6).map((issue) => (
          <Link
            key={issue.id}
            href={`/issues/${issue.id}`}
            className="flex items-center justify-between rounded-xl border border-[#e7e0d6] bg-white px-3 py-2 text-sm no-underline hover:border-stone-300"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Layers className="h-3.5 w-3.5 shrink-0 text-stone-400" />
              <span className="truncate text-stone-800">{issue.title || `Issue ${issue.id.slice(0, 8)}`}</span>
            </div>
            <span className="shrink-0 text-xs capitalize text-stone-500">{issue.status}</span>
          </Link>
        ))}
      </div>
    );
  }

  if (entityType === 'issue') {
    const data = safeParse<{ data?: { id: string; title?: string; status?: string } }>(output);
    const issue = data?.data;
    if (!issue) return null;
    return (
      <Link
        href={`/issues/${issue.id}`}
        className="mt-2 flex items-center gap-2 rounded-xl border border-[#e7e0d6] bg-white px-3 py-2 text-sm no-underline hover:border-stone-300"
      >
        <Layers className="h-4 w-4 text-stone-500" />
        <span className="font-medium text-stone-900">{issue.title || 'Issue'}</span>
        <span className="ml-auto text-xs capitalize text-stone-500">{issue.status}</span>
      </Link>
    );
  }

  if (entityType === 'skills_list') {
    const data = safeParse<{ data?: Array<{ id: string; name: string; description?: string }> }>(output);
    const items = data?.data || [];
    if (!items.length) return <p className="text-xs text-stone-500">No skills found.</p>;
    return (
      <div className="mt-2 grid gap-1.5">
        {items.slice(0, 6).map((skill) => (
          <div key={skill.id} className="rounded-lg border border-[#e7e0d6] bg-white px-3 py-2 text-sm">
            <p className="font-medium text-stone-900">{skill.name}</p>
            <p className="text-xs text-stone-500">{skill.id}</p>
          </div>
        ))}
      </div>
    );
  }

  if (entityType === 'connectors_list') {
    const data = safeParse<{ data?: Array<{ id: string; name: string; configured?: boolean }> }>(output);
    const items = data?.data || [];
    if (!items.length) return <p className="text-xs text-stone-500">No connectors found.</p>;
    return (
      <div className="mt-2 grid gap-1.5">
        {items.slice(0, 6).map((conn) => (
          <div key={conn.id} className="flex items-center justify-between rounded-lg border border-[#e7e0d6] bg-white px-3 py-2 text-sm">
            <span className="font-medium text-stone-900">{conn.name}</span>
            <span className="text-xs text-stone-500">{conn.configured ? 'Configured' : 'Not set up'}</span>
          </div>
        ))}
      </div>
    );
  }

  if (entityType === 'workflows_list') {
    const data = safeParse<{ data?: Array<{ id: string; name: string; description?: string }> }>(output);
    const items = data?.data || [];
    if (!items.length) return <p className="text-xs text-stone-500">No workflows found.</p>;
    return (
      <div className="mt-2 grid gap-1.5">
        {items.slice(0, 6).map((wf) => (
          <div key={wf.id} className="rounded-lg border border-[#e7e0d6] bg-white px-3 py-2 text-sm">
            <p className="font-medium text-stone-900">{wf.name}</p>
            <p className="text-xs text-stone-500">{wf.id}</p>
          </div>
        ))}
      </div>
    );
  }

  if (entityType === 'evaluation') {
    const data = safeParse<{ data?: Record<string, unknown> }>(output);
    const scores = data?.data;
    if (!scores) return null;
    const entries = Object.entries(scores).filter(([, v]) => typeof v === 'number' || typeof v === 'string');
    return (
      <div className="mt-2 grid gap-1 rounded-lg border border-[#e7e0d6] bg-white p-3 text-xs">
        {entries.slice(0, 8).map(([key, value]) => (
          <div key={key} className="flex justify-between gap-2">
            <span className="capitalize text-stone-500">{key.replace(/_/g, ' ')}</span>
            <span className="font-medium text-stone-800">{String(value)}</span>
          </div>
        ))}
      </div>
    );
  }

  if (entityType === 'retrieval') {
    const data = safeParse<{ results?: Array<{ text?: string; source?: string; score?: number }> }>(output);
    const items = data?.results || [];
    if (!items.length) return <p className="text-xs text-stone-500">No matching sources.</p>;
    return (
      <div className="mt-2 space-y-2">
        {items.slice(0, 4).map((chunk, i) => (
          <div key={i} className="rounded-lg border border-[#e7e0d6] bg-white p-2 text-xs text-stone-700">
            <p className="line-clamp-3">{chunk.text}</p>
            {chunk.source && <p className="mt-1 text-[10px] text-stone-400">{chunk.source}</p>}
          </div>
        ))}
      </div>
    );
  }

  if (entityType === 'plan') {
    const data = safeParse<{ plan?: Record<string, unknown>; status?: string }>(output);
    const plan = data?.plan;
    const modules = (plan?.modules as Array<{ title?: string }>) || [];
    return (
      <div className="mt-2 rounded-xl border border-[#e7e0d6] bg-white px-3 py-3 text-sm">
        <p className="font-medium text-stone-900">Plan status: {data?.status || 'unknown'}</p>
        {modules.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-stone-600">
            {modules.slice(0, 6).map((m, i) => (
              <li key={i}>{m.title || `Module ${i + 1}`}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return null;
}
