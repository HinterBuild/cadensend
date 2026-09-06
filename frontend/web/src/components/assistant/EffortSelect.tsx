'use client';

import { ChevronDown, Gauge } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  EFFORT_OPTIONS,
  type AssistantEffort,
  effortLabel,
} from '@/lib/assistantEffort';

type EffortSelectProps = {
  value: AssistantEffort;
  onChange: (effort: AssistantEffort) => void;
  variant?: 'light' | 'dark';
  disabled?: boolean;
};

export function EffortSelect({
  value,
  onChange,
  variant = 'light',
  disabled,
}: EffortSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = EFFORT_OPTIONS.find((o) => o.id === value) || EFFORT_OPTIONS[1];

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  const isDark = variant === 'dark';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title={`Effort: ${active.hint}`}
        className={`inline-flex h-9 w-full items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium transition-colors disabled:opacity-50 ${
          isDark
            ? 'border border-white/15 bg-white/10 text-stone-100 hover:bg-white/15'
            : 'border border-[#e7e0d6] bg-white text-stone-700 hover:border-stone-300'
        }`}
      >
        <Gauge className="h-3.5 w-3.5 shrink-0 opacity-70" />
        <span className="truncate">{effortLabel(value)}</span>
        <span className="ml-auto inline-flex gap-0.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <span
              key={i}
              className={`h-2 w-0.5 rounded-full ${
                i < active.bars
                  ? isDark ? 'bg-amber-300' : 'bg-stone-800'
                  : isDark ? 'bg-white/20' : 'bg-stone-300'
              }`}
            />
          ))}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>

      {open && (
        <div
          className={`absolute bottom-full left-0 z-50 mb-1 w-52 overflow-hidden rounded-xl border shadow-lg ${
            isDark ? 'border-stone-600 bg-stone-900' : 'border-[#e7e0d6] bg-white'
          }`}
        >
          {EFFORT_OPTIONS.map((opt) => {
            const selected = opt.id === value;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onChange(opt.id);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm transition-colors ${
                  selected
                    ? isDark ? 'bg-white/10 text-white' : 'bg-stone-50 text-stone-900'
                    : isDark ? 'text-stone-300 hover:bg-white/5' : 'text-stone-700 hover:bg-[#faf8f5]'
                }`}
              >
                <span className="mt-1 inline-flex gap-0.5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <span
                      key={i}
                      className={`h-2.5 w-0.5 rounded-full ${
                        i < opt.bars
                          ? isDark ? 'bg-amber-300' : 'bg-stone-800'
                          : isDark ? 'bg-white/25' : 'bg-stone-300'
                      }`}
                    />
                  ))}
                </span>
                <span>
                  <span className="block font-medium">{opt.label}</span>
                  <span className={`block text-xs ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
                    {opt.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
