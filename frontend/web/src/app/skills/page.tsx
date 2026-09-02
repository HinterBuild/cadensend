"use client";

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { platformApi } from '@/lib/api';
import { useRequireAuth } from '@/contexts/AuthContext';
import type { PlatformSkill } from '@/types';

const CATEGORY_COLORS: Record<string, string> = {
  briefing: 'bg-amber-100 text-amber-900',
  digest: 'bg-blue-100 text-blue-900',
  narrative: 'bg-rose-100 text-rose-900',
  product: 'bg-emerald-100 text-emerald-900',
  education: 'bg-indigo-100 text-indigo-900',
  research: 'bg-violet-100 text-violet-900',
  community: 'bg-cyan-100 text-cyan-900',
  support: 'bg-orange-100 text-orange-900',
  sales: 'bg-lime-100 text-lime-900',
  market: 'bg-fuchsia-100 text-fuchsia-900',
  repurpose: 'bg-sky-100 text-sky-900',
  events: 'bg-yellow-100 text-yellow-900',
  marketing: 'bg-pink-100 text-pink-900',
  editorial: 'bg-stone-200 text-stone-800',
  curation: 'bg-teal-100 text-teal-900',
  internal: 'bg-slate-200 text-slate-800',
  investor: 'bg-purple-100 text-purple-900',
  hiring: 'bg-green-100 text-green-900',
  retention: 'bg-red-100 text-red-900',
};

export default function SkillsPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const userId = user?.id;
  const [skills, setSkills] = useState<PlatformSkill[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedForUser = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading || !userId) return;
    if (loadedForUser.current === userId) return;

    let cancelled = false;
    loadedForUser.current = userId;
    setLoading(true);
    setError(null);

    platformApi.skills()
      .then((r) => {
        if (cancelled) return;
        setSkills(Array.isArray(r.data) ? r.data : []);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load skills');
        setSkills([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, userId]);

  const filtered = skills.filter((s) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      (s.name ?? '').toLowerCase().includes(q) ||
      (s.category ?? '').toLowerCase().includes(q) ||
      (s.description ?? '').toLowerCase().includes(q)
    );
  });

  const reloadSkills = () => {
    if (!userId) return;
    loadedForUser.current = null;
    setLoading(true);
    setError(null);
    platformApi.skills()
      .then((r) => setSkills(Array.isArray(r.data) ? r.data : []))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load skills'))
      .finally(() => setLoading(false));
  };

  if (authLoading || loading) {
    return <div className="p-8 text-stone-500">Loading skills…</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-8">
        <h1 className="font-display text-3xl text-stone-900">Content Skills</h1>
        <p className="mt-2 max-w-2xl text-sm text-stone-600">
          20 specialized generation skills. Assign a skill to a series to shape how issues are written.
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button type="button" onClick={reloadSkills} className="ml-3 underline">
            Retry
          </button>
        </div>
      )}

      {!error && filtered.length === 0 && (
        <p className="mb-4 text-sm text-stone-500">No skills match your filter.</p>
      )}

      <input
        type="search"
        placeholder="Filter skills…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="mb-6 w-full max-w-md rounded-xl border border-[#e7e0d6] bg-white px-4 py-2.5 text-sm"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((skill) => (
          <article
            key={skill.id}
            className="rounded-2xl border border-[#e7e0d6] bg-white p-5 transition-shadow hover:shadow-md"
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <h2 className="font-display text-lg text-stone-900">{skill.name}</h2>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs capitalize ${CATEGORY_COLORS[skill.category] ?? 'bg-stone-100 text-stone-700'}`}>
                {skill.category}
              </span>
            </div>
            <p className="text-sm text-stone-600">{skill.description}</p>
            {Array.isArray(skill.sections) && skill.sections.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1">
                {skill.sections.slice(0, 4).map((sec) => (
                  <li key={sec} className="rounded-md bg-[#faf8f5] px-2 py-0.5 text-xs text-stone-500">
                    {sec.replace(/_/g, ' ')}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex gap-2">
              <Link
                href={`/studio?skill=${skill.id}`}
                className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium !text-white no-underline hover:bg-stone-800"
              >
                Try in Studio
              </Link>
              <Link
                href={`/series/create?skill=${skill.id}`}
                className="rounded-lg border border-[#e7e0d6] px-3 py-1.5 text-xs font-medium !text-stone-700 no-underline hover:bg-[#faf8f5]"
              >
                New series
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
