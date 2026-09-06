'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  Layers,
  Lightbulb,
  TrendingUp,
} from 'lucide-react';
import type { AnalyticsOverview } from '@/types';

type AnalyticsPreviewProps = {
  output: string;
  compact?: boolean;
};

function safeParse(raw: string): AnalyticsOverview | null {
  try {
    const parsed = JSON.parse(raw) as { data?: AnalyticsOverview };
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

function StatPill({ label, value, tone = 'default' }: { label: string; value: number | string; tone?: 'default' | 'warn' | 'ok' }) {
  const tones = {
    default: 'border-[#e7e0d6] bg-white text-stone-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  };
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${tones[tone]}`}>
      <p className="text-[10px] font-medium uppercase tracking-wider text-stone-500">{label}</p>
      <p className="mt-0.5 font-display text-xl tabular-nums">{value}</p>
    </div>
  );
}

export function AnalyticsPreview({ output, compact = false }: AnalyticsPreviewProps) {
  const data = safeParse(output);
  if (!data) return null;

  const { headline, pipeline, cadence, plan, coverage, improvements, suggestions } = data;

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e0d8cc] bg-gradient-to-b from-white to-[#faf8f5]">
      <div className="flex items-center gap-2 border-b border-[#e7e0d6] bg-stone-900 px-4 py-3 text-white">
        <BarChart3 className="h-4 w-4 text-amber-200" />
        <div>
          <p className="text-sm font-semibold">Workspace insights</p>
          <p className="text-[11px] text-stone-400">Live snapshot from your account</p>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatPill label="Series" value={headline.series_total} />
          <StatPill label="Active" value={headline.series_active} tone="ok" />
          <StatPill label="Issues sent" value={headline.issues_sent} />
          <StatPill
            label="Failed"
            value={pipeline.failed}
            tone={pipeline.failed > 0 ? 'warn' : 'default'}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[#e7e0d6] bg-white p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
              <Layers className="h-3.5 w-3.5" />
              Pipeline
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div>
                <dt className="text-stone-500">Planned modules</dt>
                <dd className="font-medium text-stone-900">{pipeline.planned_modules}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Issues total</dt>
                <dd className="font-medium text-stone-900">{pipeline.issues_total}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Generated</dt>
                <dd className="font-medium text-stone-900">{pipeline.generated}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Sent</dt>
                <dd className="font-medium text-stone-900">{pipeline.sent}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-[#e7e0d6] bg-white p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
              <Calendar className="h-3.5 w-3.5" />
              Cadence
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-stone-500">Due next 7 days</dt>
                <dd className="font-medium text-stone-900">{cadence.due_next_7_days}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-stone-500">Overdue pending</dt>
                <dd className={`font-medium ${cadence.overdue_pending > 0 ? 'text-amber-700' : 'text-stone-900'}`}>
                  {cadence.overdue_pending}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-stone-500">Plan ready</dt>
                <dd className="font-medium text-stone-900">{plan.ready}</dd>
              </div>
            </dl>
          </div>
        </div>

        {!compact && coverage.length > 0 && (
          <div className="rounded-xl border border-[#e7e0d6] bg-white p-3">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
              <TrendingUp className="h-3.5 w-3.5" />
              Series coverage
            </div>
            <ul className="space-y-2">
              {coverage.slice(0, 4).map((row) => (
                <li key={row.series_id}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <Link
                      href={`/series/${row.series_id}`}
                      className="truncate font-medium text-stone-900 no-underline hover:underline"
                    >
                      {row.topic}
                    </Link>
                    <span className="shrink-0 text-xs text-stone-500">
                      {row.issued}/{row.planned}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#efe8dc]">
                    <div
                      className="h-full rounded-full bg-stone-800"
                      style={{ width: `${Math.min(100, Math.max(8, row.percent))}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {improvements.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Needs attention</p>
            {improvements.slice(0, compact ? 2 : 4).map((item, index) => (
              <div
                key={`${item.kind}-${index}`}
                className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-sm"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div className="min-w-0">
                  <p className="font-medium text-stone-900">{item.title}</p>
                  <p className="mt-0.5 text-xs text-stone-600">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {suggestions.length > 0 && !compact && (
          <div className="rounded-xl border border-[#e7e0d6] bg-white p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
              <Lightbulb className="h-3.5 w-3.5" />
              Suggestions
            </div>
            <ul className="space-y-2">
              {suggestions.slice(0, 2).map((s, index) => (
                <li key={index} className="flex gap-2 text-sm text-stone-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>
                    <span className="font-medium text-stone-900">{s.topic}</span>
                    <span className="text-stone-500"> · {s.reason}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Link
          href="/insights"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 no-underline hover:underline"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Open full insights dashboard
        </Link>
      </div>
    </div>
  );
}
