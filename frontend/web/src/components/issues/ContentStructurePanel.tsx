"use client";

import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import {
  analyzeContentStructure,
  contentStructureScore,
  type ContentCheck,
  type ContentStructureInput,
} from "@/lib/contentStructure";

const ICONS = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle2,
};

const STYLES = {
  error: "border-red-200 bg-red-50 text-red-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-sky-200 bg-sky-50 text-sky-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
};

function CheckRow({ check }: { check: ContentCheck }) {
  const Icon = ICONS[check.severity];
  return (
    <li className="flex items-start gap-3 rounded-xl border border-[#e7e0d6] bg-white px-3 py-2.5">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${
        check.severity === 'error'
          ? 'text-red-600'
          : check.severity === 'warning'
          ? 'text-amber-600'
          : 'text-sky-600'
      }`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-stone-900">{check.message}</p>
        {check.suggestion ? (
          <p className="mt-0.5 text-xs text-stone-600">{check.suggestion}</p>
        ) : null}
      </div>
    </li>
  );
}

export function ContentStructurePanel({
  content,
  compact = false,
}: {
  content: ContentStructureInput;
  compact?: boolean;
}) {
  const checks = analyzeContentStructure(content);
  const { score, errors, warnings, infos } = contentStructureScore(checks);
  const tone =
    errors > 0 ? 'error' : warnings > 0 ? 'warning' : checks.length > 0 ? 'info' : 'success';
  const Icon = ICONS[tone];

  if (compact) {
    if (checks.length === 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          Structure OK
        </span>
      );
    }
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
          errors > 0
            ? 'bg-red-50 text-red-800'
            : warnings > 0
            ? 'bg-amber-50 text-amber-800'
            : 'bg-sky-50 text-sky-800'
        }`}
        title={checks.map((check) => check.message).join(' · ')}
      >
        <Icon className="h-3 w-3" aria-hidden="true" />
        {errors > 0 ? `${errors} structure issue${errors === 1 ? '' : 's'}` : `${warnings || infos} suggestion${(warnings || infos) === 1 ? '' : 's'}`}
      </span>
    );
  }

  return (
    <section className="rounded-2xl border border-[#e7e0d6] bg-white p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold text-stone-900">Content flow checks</h3>
          <p className="text-sm text-stone-600">
            Validates diagram, code, and prose order for readable emails.
          </p>
        </div>
        <div className={`rounded-xl border px-3 py-2 text-right ${STYLES[tone]}`}>
          <p className="text-xs font-semibold uppercase tracking-wide">Flow score</p>
          <p className="text-lg font-bold tabular-nums">{score}</p>
        </div>
      </div>

      {checks.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          Diagrams and code blocks are in a sensible order with enough surrounding context.
        </div>
      ) : (
        <ul className="space-y-2">
          {checks.map((check, index) => (
            <CheckRow key={`${check.id}-${check.blockIndex ?? 'all'}-${index}`} check={check} />
          ))}
        </ul>
      )}
    </section>
  );
}
