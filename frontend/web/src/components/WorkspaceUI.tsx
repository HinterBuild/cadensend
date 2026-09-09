import type { ReactNode } from 'react';
import { Search, SearchX } from 'lucide-react';

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0"><p className="text-xs uppercase tracking-[0.2em] text-stone-500">{eyebrow}</p>
      <h1 className="font-display mt-1 text-3xl text-stone-900 sm:text-4xl">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">{description}</p>
    </div>{actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </header>;
}

export function SummaryCards({ items }: { items: { label: string; value: number | string }[] }) {
  return <dl className="mb-6 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">{items.map(item =>
    <div key={item.label} className="min-w-0 flex-1 rounded-lg border border-[#e7e0d6] bg-white p-4">
      <dt className="text-xs text-stone-500">{item.label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-stone-900">{item.value}</dd>
    </div>)}
  </dl>;
}

export function SearchField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="relative block w-full sm:max-w-md">
    <span className="sr-only">{label}</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
    <input type="search" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || label} className="w-full rounded-lg border border-[#e7e0d6] bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200" />
  </label>;
}

export function EmptyResults({ onClear }: { onClear: () => void }) {
  return <div className="rounded-lg border border-dashed border-[#d8cfc2] bg-white px-5 py-10 text-center">
    <SearchX className="mx-auto mb-3 h-6 w-6 text-stone-400" aria-hidden="true" />
    <p className="font-medium text-stone-900">No results match this view</p><p className="mt-1 text-sm text-stone-500">Try another search or clear your filters.</p>
    <button type="button" onClick={onClear} className="mt-4 rounded-lg border border-[#e7e0d6] px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50">Clear filters</button>
  </div>;
}

export function PageSkeleton({ label }: { label: string }) {
  return <div role="status" aria-label={label} className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8"><span className="sr-only">{label}</span>
    <div aria-hidden="true"><div className="mb-3 h-9 w-48 animate-pulse rounded-lg bg-stone-200" /><div className="mb-8 h-4 w-2/3 animate-pulse rounded bg-stone-200" />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({length: 6}, (_, i) => <div key={i} className="h-44 animate-pulse rounded-lg border border-[#e7e0d6] bg-white" />)}</div></div>
  </div>;
}
