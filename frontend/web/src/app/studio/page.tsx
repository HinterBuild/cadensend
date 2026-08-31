"use client";

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { platformApi } from '@/lib/api';
import { useRequireAuth } from '@/contexts/AuthContext';
import type { EvaluationResult, PlatformSkill } from '@/types';

export default function StudioPage() {
  const { loading: authLoading } = useRequireAuth();
  const searchParams = useSearchParams();
  const [skills, setSkills] = useState<PlatformSkill[]>([]);
  const [skillId, setSkillId] = useState(searchParams.get('skill') || 'daily_brief');
  const [topic, setTopic] = useState('AI infrastructure trends');
  const [goal, setGoal] = useState('Inform technical leaders');
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    platformApi.skills().then((r) => setSkills(r.data ?? []));
  }, [authLoading]);

  const runPreview = async () => {
    setLoading(true);
    setPreview(null);
    setEvaluation(null);
    try {
      const res = await platformApi.sandbox(skillId, { topic, goal, level: 'intermediate' });
      const data = (res as { data?: Record<string, unknown> }).data ?? null;
      setPreview(data);
      const evalRes = await platformApi.evaluate({
        subject: `Preview: ${topic}`,
        content_blocks: [{ type: 'markdown', title: 'Preview', text: String(data?.system_overlay ?? '') }],
      });
      setEvaluation(evalRes.data);
    } catch (e) {
      setPreview({ error: e instanceof Error ? e.message : 'Preview failed' });
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return <div className="p-8 text-stone-500">Loading studio…</div>;
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-8">
        <h1 className="font-display text-3xl text-stone-900">Newsletter Sandbox</h1>
        <p className="mt-2 text-sm text-stone-600">
          Test skills, prompts, and evaluation harness before real sends. No content is persisted.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-[#e7e0d6] bg-white p-6">
          <label className="block text-sm font-medium text-stone-700">
            Skill
            <select
              value={skillId}
              onChange={(e) => setSkillId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#e7e0d6] px-3 py-2 text-sm"
            >
              {skills.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-stone-700">
            Topic
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#e7e0d6] px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-medium text-stone-700">
            Goal
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#e7e0d6] px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={loading}
            onClick={runPreview}
            className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? 'Running…' : 'Preview prompt overlay'}
          </button>
        </div>

        <div className="space-y-4">
          {preview && (
            <div className="rounded-2xl border border-[#e7e0d6] bg-white p-6">
              <h2 className="font-display text-lg text-stone-900">Prompt overlay</h2>
              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-[#faf8f5] p-4 text-xs text-stone-700">
                {String(preview.system_overlay ?? JSON.stringify(preview, null, 2))}
              </pre>
            </div>
          )}
          {evaluation && (
            <div className="rounded-2xl border border-[#e7e0d6] bg-white p-6">
              <h2 className="font-display text-lg text-stone-900">Evaluation harness</h2>
              <p className="mt-2 text-sm text-stone-600">
                Score: {(evaluation.overall_score * 100).toFixed(0)}% — {evaluation.passed ? 'Passed' : 'Needs work'}
              </p>
              <ul className="mt-3 space-y-1 text-sm text-stone-600">
                {Object.entries(evaluation.scores).map(([k, v]) => (
                  <li key={k} className="flex justify-between">
                    <span className="capitalize">{k.replace(/_/g, ' ')}</span>
                    <span className="tabular-nums">{(v * 100).toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
