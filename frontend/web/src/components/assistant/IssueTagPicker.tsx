'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Layers, Search, X } from 'lucide-react';
import { seriesApi } from '@/lib/api';

export type TaggedIssue = {
  id: string;
  title: string;
  seriesTopic?: string;
};

type IssueTagPickerProps = {
  tagged: TaggedIssue[];
  onChange: (issues: TaggedIssue[]) => void;
  disabled?: boolean;
};

type IssueOption = TaggedIssue & { seriesId: string };

export function IssueTagPicker({ tagged, onChange, disabled }: IssueTagPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<IssueOption[]>([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const loadOptions = useCallback(async () => {
    setLoading(true);
    try {
      const seriesRes = await seriesApi.list();
      const seriesList = seriesRes.series || [];
      const collected: IssueOption[] = [];
      for (const series of seriesList.slice(0, 8)) {
        const issuesRes = await seriesApi.getIssues(series.id);
        for (const issue of issuesRes.data || []) {
          collected.push({
            id: issue.id,
            title: issue.title || `Issue ${issue.id.slice(0, 8)}`,
            seriesTopic: series.topic,
            seriesId: series.id,
          });
        }
      }
      setOptions(collected);
    } catch {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && options.length === 0) {
      void loadOptions();
    }
  }, [open, options.length, loadOptions]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  const filtered = options.filter((opt) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      opt.title.toLowerCase().includes(q) ||
      opt.id.toLowerCase().includes(q) ||
      (opt.seriesTopic || '').toLowerCase().includes(q)
    );
  });

  const toggleIssue = (issue: IssueOption) => {
    if (tagged.some((t) => t.id === issue.id)) {
      onChange(tagged.filter((t) => t.id !== issue.id));
    } else {
      onChange([...tagged, { id: issue.id, title: issue.title, seriesTopic: issue.seriesTopic }]);
    }
  };

  return (
    <div ref={rootRef} className="mx-auto mb-2 max-w-3xl">
      {tagged.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {tagged.map((issue) => (
            <span
              key={issue.id}
              className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs text-indigo-900"
            >
              <Layers className="h-3 w-3" />
              <span className="max-w-[12rem] truncate">{issue.title}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(tagged.filter((t) => t.id !== issue.id))}
                className="rounded-full p-0.5 hover:bg-indigo-100 disabled:opacity-50"
                aria-label={`Remove ${issue.title}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#e7e0d6] bg-white px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:border-stone-300 disabled:opacity-50"
        >
          <Layers className="h-3.5 w-3.5" />
          Tag issue
        </button>

        {open && (
          <div className="absolute bottom-full left-0 z-20 mb-2 w-80 overflow-hidden rounded-xl border border-[#e7e0d6] bg-white shadow-lg">
            <div className="border-b border-[#e7e0d6] p-2">
              <div className="flex items-center gap-2 rounded-lg bg-[#faf8f5] px-2 py-1.5">
                <Search className="h-3.5 w-3.5 text-stone-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search issues…"
                  className="flex-1 bg-transparent text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none"
                />
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto p-1">
              {loading && <p className="px-3 py-2 text-xs text-stone-500">Loading issues…</p>}
              {!loading && filtered.length === 0 && (
                <p className="px-3 py-2 text-xs text-stone-500">No issues found.</p>
              )}
              {filtered.map((issue) => {
                const selected = tagged.some((t) => t.id === issue.id);
                return (
                  <button
                    key={issue.id}
                    type="button"
                    onClick={() => toggleIssue(issue)}
                    className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[#faf8f5] ${
                      selected ? 'bg-indigo-50' : ''
                    }`}
                  >
                    <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-stone-900">{issue.title}</p>
                      <p className="truncate text-xs text-stone-500">{issue.seriesTopic}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
