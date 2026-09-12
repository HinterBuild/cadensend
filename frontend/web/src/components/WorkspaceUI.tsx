import type { ReactNode } from 'react';
import { AlertCircle, ArrowUpRight, Search, SearchX } from 'lucide-react';

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0"><p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-800">{eyebrow}</p>
      <h1 className="font-display text-3xl tracking-tight text-stone-900 sm:text-4xl">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">{description}</p>
    </div>{actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </header>;
}

export function SummaryCards({ items }: { items: { label: string; value: number | string; hint?: string }[] }) {
  return <dl className="mb-8 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">{items.map(item =>
    <div key={item.label} className="surface min-w-0 flex-1 px-5 py-4">
      <dt className="text-xs font-medium text-stone-500">{item.label}</dt>
      <dd className="mt-2 text-3xl font-semibold tracking-tight text-stone-900 tabular-nums">{item.value}</dd>
      {item.hint && <dd className="mt-1 text-xs text-stone-500">{item.hint}</dd>}
    </div>)}
  </dl>;
}

export function SearchField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="relative block w-full sm:max-w-md">
    <span className="sr-only">{label}</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" aria-hidden="true" />
    <input type="search" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || label} className="field-input pl-10" />
  </label>;
}

export function EmptyState({ title, description, action, icon }: { title: string; description: string; action?: ReactNode; icon?: ReactNode }) {
  return <div className="surface px-6 py-14 text-center">
    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700" aria-hidden="true">{icon || <ArrowUpRight className="h-6 w-6" />}</div>
    <h2 className="text-lg font-semibold tracking-tight text-stone-900">{title}</h2>
    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-600">{description}</p>
    {action && <div className="mt-5 flex justify-center">{action}</div>}
  </div>;
}

export function EmptyResults({ onClear }: { onClear: () => void }) {
  return <EmptyState title="No results match this view" description="Try another search or clear your filters." icon={<SearchX className="h-6 w-6" />} action={<button type="button" onClick={onClear} className="button-secondary">Clear filters</button>} />;
}

export function ErrorNotice({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
    <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" /><div className="min-w-0 flex-1 break-words">{children}</div>
    {onRetry && <button type="button" onClick={onRetry} className="button-secondary !border-red-200 !text-red-800">Try again</button>}
  </div>;
}

export function PageSkeleton({ label }: { label: string }) {
  return <div role="status" aria-label={label} className="mx-auto max-w-6xl px-4 py-8 sm:px-8"><span className="sr-only">{label}</span>
    <div aria-hidden="true"><div className="mb-3 h-9 w-48 animate-pulse rounded-lg bg-stone-200" /><div className="mb-8 h-4 w-2/3 animate-pulse rounded bg-stone-200" />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({length: 6}, (_, i) => <div key={i} className="surface h-44 animate-pulse" />)}</div></div>
  </div>;
}
