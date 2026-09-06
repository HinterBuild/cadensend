'use client';

import Link from 'next/link';
import { ArrowUpRight, CheckCircle2, Clock, Globe, Layers, Target } from 'lucide-react';
import type { Series } from '@/types';

type SeriesCreatedCardProps = {
  output: string;
};

function safeParse(raw: string): Series | null {
  try {
    const parsed = JSON.parse(raw) as { data?: Series };
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

export function SeriesCreatedCard({ output }: SeriesCreatedCardProps) {
  const series = safeParse(output);
  if (!series) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50/80 to-white">
      <div className="flex items-start gap-3 border-b border-emerald-100 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-900">Series created</p>
          <p className="mt-0.5 truncate text-base font-medium text-stone-900">{series.topic}</p>
        </div>
        <Link
          href={`/series/${series.id}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200 no-underline hover:bg-emerald-50"
        >
          Open
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <dl className="grid gap-3 p-4 sm:grid-cols-2">
        {series.goal && (
          <div className="flex gap-2 sm:col-span-2">
            <Target className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wider text-stone-500">Goal</dt>
              <dd className="mt-0.5 text-sm text-stone-700">{series.goal}</dd>
            </div>
          </div>
        )}
        {series.level && (
          <div className="flex gap-2">
            <Layers className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wider text-stone-500">Level</dt>
              <dd className="mt-0.5 text-sm capitalize text-stone-900">{series.level}</dd>
            </div>
          </div>
        )}
        {series.cadence && (
          <div className="flex gap-2">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wider text-stone-500">Cadence</dt>
              <dd className="mt-0.5 text-sm capitalize text-stone-900">
                {series.cadence}
                {series.send_time ? ` · ${series.send_time}` : ''}
              </dd>
            </div>
          </div>
        )}
        {series.timezone && (
          <div className="flex gap-2">
            <Globe className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wider text-stone-500">Timezone</dt>
              <dd className="mt-0.5 text-sm text-stone-900">{series.timezone}</dd>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <Layers className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />
          <div>
            <dt className="text-[10px] font-medium uppercase tracking-wider text-stone-500">Status</dt>
            <dd className="mt-0.5 text-sm capitalize text-stone-900">{series.status || 'draft'}</dd>
          </div>
        </div>
      </dl>
    </div>
  );
}
