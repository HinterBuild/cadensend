"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, BookOpen, CalendarDays, CheckCircle2, FlaskConical, Layers3, Plus, RefreshCw, Search, Sparkles } from 'lucide-react';
import { platformApi } from '@/lib/api';
import { useRequireAuth } from '@/contexts/AuthContext';
import type { PlatformSkill } from '@/types';

const CATEGORY_COLORS: Record<string, string> = {
  briefing: 'bg-amber-100 text-amber-900 ring-amber-200',
  digest: 'bg-blue-100 text-blue-900 ring-blue-200',
  narrative: 'bg-rose-100 text-rose-900 ring-rose-200',
  product: 'bg-emerald-100 text-emerald-900 ring-emerald-200',
  education: 'bg-indigo-100 text-indigo-900 ring-indigo-200',
  research: 'bg-violet-100 text-violet-900 ring-violet-200',
  community: 'bg-cyan-100 text-cyan-900 ring-cyan-200',
  support: 'bg-orange-100 text-orange-900 ring-orange-200',
  sales: 'bg-lime-100 text-lime-900 ring-lime-200',
  market: 'bg-fuchsia-100 text-fuchsia-900 ring-fuchsia-200',
  repurpose: 'bg-sky-100 text-sky-900 ring-sky-200',
  events: 'bg-yellow-100 text-yellow-900 ring-yellow-200',
  marketing: 'bg-pink-100 text-pink-900 ring-pink-200',
  editorial: 'bg-stone-200 text-stone-800 ring-stone-300',
  curation: 'bg-teal-100 text-teal-900 ring-teal-200',
  internal: 'bg-slate-200 text-slate-800 ring-slate-300',
  investor: 'bg-purple-100 text-purple-900 ring-purple-200',
  hiring: 'bg-green-100 text-green-900 ring-green-200',
  retention: 'bg-red-100 text-red-900 ring-red-200',
};

const formatLabel = (value: string) => value.replace(/_/g, ' ');

function normalizeSkill(skill: PlatformSkill) {
  return [
    skill.name,
    skill.category,
    skill.description,
    skill.cadence,
    ...(Array.isArray(skill.sections) ? skill.sections : []),
    skill.multi_issue ? 'multi issue course sequence' : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export default function SkillsPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const [skills, setSkills] = useState<PlatformSkill[]>([]);
  const [filter, setFilter] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSkills = useCallback(() => {
    if (!user?.id) return undefined;

    let cancelled = false;
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
  }, [user?.id]);

  useEffect(() => {
    if (authLoading || !user?.id) return;

    let cancelled = false;

    void Promise.resolve().then(() => {
      if (cancelled) return;
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
    });

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    skills.forEach((skill) => {
      if (!skill.category) return;
      counts.set(skill.category, (counts.get(skill.category) ?? 0) + 1);
    });
    return Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [skills]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return skills.filter((skill) => {
      const matchesCategory = selectedCategory === 'all' || skill.category === selectedCategory;
      const matchesQuery = !q || normalizeSkill(skill).includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [filter, selectedCategory, skills]);

  const multiIssueCount = skills.filter((skill) => skill.multi_issue).length;
  const sectionCount = skills.reduce((total, skill) => total + (skill.sections?.length ?? 0), 0);
  const cadenceCount = new Set(skills.map((skill) => skill.cadence).filter(Boolean)).size;

  if (authLoading || (loading && skills.length === 0)) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8 h-8 w-48 animate-pulse rounded-md bg-stone-200" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="rounded-lg border border-[#e7e0d6] bg-white p-5">
              <div className="h-5 w-2/3 animate-pulse rounded bg-stone-200" />
              <div className="mt-4 h-4 w-full animate-pulse rounded bg-stone-100" />
              <div className="mt-2 h-4 w-4/5 animate-pulse rounded bg-stone-100" />
              <div className="mt-5 h-8 w-full animate-pulse rounded bg-stone-100" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-stone-500 ring-1 ring-[#e7e0d6]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Catalog
            </div>
            <h1 className="font-display text-3xl text-stone-900 sm:text-4xl">Content Skills</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              Choose a skill to give Studio or a new series the right structure, cadence, and writing pattern.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[28rem]">
            <div className="rounded-lg border border-[#e7e0d6] bg-white p-3">
              <p className="text-xs text-stone-500">Skills</p>
              <p className="mt-1 text-2xl font-semibold text-stone-900">{skills.length}</p>
            </div>
            <div className="rounded-lg border border-[#e7e0d6] bg-white p-3">
              <p className="text-xs text-stone-500">Sections</p>
              <p className="mt-1 text-2xl font-semibold text-stone-900">{sectionCount}</p>
            </div>
            <div className="rounded-lg border border-[#e7e0d6] bg-white p-3">
              <p className="text-xs text-stone-500">Cadences</p>
              <p className="mt-1 text-2xl font-semibold text-stone-900">{cadenceCount}</p>
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div className="mb-5 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadSkills}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
          <label htmlFor="skill-search" className="sr-only">
            Search skills
          </label>
          <input
            id="skill-search"
            type="search"
            placeholder="Search by name, section, category, cadence..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded-lg border border-[#e7e0d6] bg-white py-2.5 pl-9 pr-3 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:ring-2 focus:ring-stone-200"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold capitalize ${
              selectedCategory === 'all'
                ? 'bg-stone-900 text-white'
                : 'border border-[#e7e0d6] bg-white text-stone-600 hover:bg-[#faf8f5]'
            }`}
          >
            All {skills.length}
          </button>
          {categories.map(([category, count]) => (
            <button
              type="button"
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold capitalize ${
                selectedCategory === category
                  ? 'bg-stone-900 text-white'
                  : 'border border-[#e7e0d6] bg-white text-stone-600 hover:bg-[#faf8f5]'
              }`}
            >
              {category} {count}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2 text-xs text-stone-600">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e7e0d6] bg-white px-3 py-1">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
          {multiIssueCount} multi-issue formats
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e7e0d6] bg-white px-3 py-1">
          <Layers3 className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
          Section-aware generation
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e7e0d6] bg-white px-3 py-1">
          <CalendarDays className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
          Cadence presets
        </span>
      </div>

      {!error && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-[#d8cfc2] bg-white px-5 py-10 text-center">
          <p className="font-medium text-stone-900">No skills match this view.</p>
          <p className="mt-1 text-sm text-stone-500">Clear the search or choose a different category.</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((skill) => (
          <article
            key={skill.id}
            className="flex min-h-[20rem] flex-col rounded-lg border border-[#e7e0d6] bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-xl leading-7 text-stone-900">{skill.name}</h2>
                <p className="mt-1 text-xs text-stone-500">{skill.id}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${CATEGORY_COLORS[skill.category] ?? 'bg-stone-100 text-stone-700 ring-stone-200'}`}>
                {skill.category}
              </span>
            </div>

            <p className="text-sm leading-6 text-stone-600">{skill.description}</p>

            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-[#faf8f5] px-3 py-2">
                <p className="text-stone-500">Cadence</p>
                <p className="mt-1 font-semibold capitalize text-stone-900">{skill.cadence ?? 'Flexible'}</p>
              </div>
              <div className="rounded-lg bg-[#faf8f5] px-3 py-2">
                <p className="text-stone-500">Mode</p>
                <p className="mt-1 font-semibold text-stone-900">{skill.multi_issue ? 'Series' : 'Issue'}</p>
              </div>
            </div>

            {Array.isArray(skill.sections) && skill.sections.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  Outline
                </div>
                <ul className="flex flex-wrap gap-1.5">
                  {skill.sections.map((sec) => (
                    <li key={sec} className="rounded-md border border-[#e7e0d6] bg-white px-2 py-1 text-xs capitalize text-stone-600">
                      {formatLabel(sec)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-auto flex flex-col gap-2 pt-5 sm:flex-row">
              <Link
                href={`/studio?skill=${skill.id}`}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold !text-white no-underline hover:bg-stone-800"
              >
                <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
                Try in Studio
              </Link>
              <Link
                href={`/series/create?skill=${skill.id}`}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-[#e7e0d6] px-3 py-2 text-xs font-semibold !text-stone-700 no-underline hover:bg-[#faf8f5]"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                New series
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
