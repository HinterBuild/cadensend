"use client";

import { CheckCircle2, ShieldAlert } from "lucide-react";
import type { IssueQuality, IssueQualityScores } from "@/types";

const SCORE_LABEL: Record<keyof IssueQualityScores, string> = {
  grounding: "Grounding",
  novelty: "Novelty",
  structure: "Structure",
  cta: "Call to action",
  tone_safety: "Tone safety",
  editorial: "Editorial",
};

function toneFor(score: number): "error" | "warning" | "success" {
  if (score >= 0.75) return "success";
  if (score >= 0.5) return "warning";
  return "error";
}

const TONE_STYLES = {
  error: "border-red-200 bg-red-50 text-red-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
};

/**
 * Surfaces the generation-time quality assessment already computed by the
 * AI engine (grounding/novelty/structure/etc.) and stored on the issue as
 * content_json._quality. Read-only — this reflects the model's own
 * self-check at generation time, not a live re-evaluation.
 */
export function IssueQualityPanel({ quality }: { quality?: IssueQuality }) {
  if (!quality) return null;

  const overall = Math.round((quality.overall_score ?? 0) * 100);
  const tone = quality.passed ? toneFor(quality.overall_score) : "error";
  const scoreEntries = Object.entries(quality.scores ?? {}) as [keyof IssueQualityScores, number][];

  return (
    <section className="rounded-2xl border border-[#e7e0d6] bg-white p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold text-stone-900">Generation quality</h3>
          <p className="text-sm text-stone-600">
            The AI engine&apos;s own grounding and quality self-check from when this issue was generated.
          </p>
        </div>
        <div className={`rounded-xl border px-3 py-2 text-right ${TONE_STYLES[tone]}`}>
          <p className="text-xs font-semibold uppercase tracking-wide">Confidence</p>
          <p className="text-lg font-bold tabular-nums">{overall}%</p>
        </div>
      </div>

      {!quality.passed && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            This issue did not clear the quality gate on generation (it may have exhausted revision
            attempts). Review citations and claims before sending.
          </span>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {scoreEntries.map(([key, value]) => (
          <div key={key} className="rounded-xl border border-[#e7e0d6] bg-stone-50 px-3 py-2">
            <dt className="text-xs text-stone-500">{SCORE_LABEL[key] ?? key}</dt>
            <dd className="text-sm font-semibold tabular-nums text-stone-900">
              {Math.round((value ?? 0) * 100)}%
            </dd>
          </div>
        ))}
      </dl>

      {quality.banned_hits?.length > 0 && (
        <p className="mt-3 text-xs text-red-700">
          Flagged phrases: {quality.banned_hits.join(", ")}
        </p>
      )}

      {quality.passed && quality.banned_hits?.length === 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs text-stone-500">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
          Passed the generation-time quality gate.
        </div>
      )}
    </section>
  );
}
