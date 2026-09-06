'use client';

import { useEffect, useState } from 'react';
import { Calendar, Check, ClipboardList } from 'lucide-react';
import type { AssistantSeriesSetupForm, AssistantSeriesSetupValues } from '@/types/assistant';
import {
  SERIES_CADENCE_OPTIONS,
  SERIES_DURATION_OPTIONS,
  SERIES_LEVEL_OPTIONS,
  SERIES_TIMEZONES,
  SERIES_WEEKDAYS,
} from '@/lib/seriesFormOptions';

type SeriesSetupFormCardProps = {
  form: AssistantSeriesSetupForm;
  onSubmit: (values: AssistantSeriesSetupValues) => void;
  busy?: boolean;
};

const inputClass =
  'w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200';

function normalizeSendDays(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((d) => d.trim()).filter(Boolean);
  }
  return ['Monday'];
}

export function SeriesSetupFormCard({ form, onSubmit, busy }: SeriesSetupFormCardProps) {
  const defaults = form.defaults;
  const [values, setValues] = useState<AssistantSeriesSetupValues>({
    topic: defaults.topic || '',
    goal: defaults.goal || '',
    level: defaults.level || 'beginner',
    duration: defaults.duration || '1 month',
    cadence: defaults.cadence || 'weekly',
    send_time: defaults.send_time || '09:00',
    send_days: normalizeSendDays(defaults.send_days),
    timezone: defaults.timezone || 'UTC',
  });

  useEffect(() => {
    setValues({
      topic: defaults.topic || '',
      goal: defaults.goal || '',
      level: defaults.level || 'beginner',
      duration: defaults.duration || '1 month',
      cadence: defaults.cadence || 'weekly',
      send_time: defaults.send_time || '09:00',
      send_days: normalizeSendDays(defaults.send_days),
      timezone: defaults.timezone || 'UTC',
    });
  }, [defaults]);

  const submitted = form.status === 'submitted';
  const showDayPicker = values.cadence === 'weekly' || values.cadence === 'biweekly';

  const toggleDay = (day: string) => {
    setValues((prev) => {
      const has = prev.send_days.includes(day);
      const next = has ? prev.send_days.filter((d) => d !== day) : [...prev.send_days, day];
      return { ...prev, send_days: next.length ? next : [day] };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitted || busy) return;
    onSubmit(values);
  };

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-[#e0d8cc] bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b border-stone-100 bg-[#faf8f5] px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-stone-900 text-white">
          <ClipboardList className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stone-900">Series setup</p>
          <p className="mt-0.5 text-sm text-stone-600">
            {submitted ? 'Settings saved — preparing your series.' : 'Fill in the schedule details below.'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 px-4 py-4">
        <div className="rounded-xl bg-stone-50 px-3 py-3 ring-1 ring-stone-100">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">Topic</p>
          <p className="mt-1 text-sm font-medium text-stone-900">{values.topic}</p>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-stone-400">Goal</p>
          <p className="mt-1 text-sm text-stone-700">{values.goal}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-stone-600">Level</span>
            <select
              disabled={submitted}
              value={values.level}
              onChange={(e) => setValues((v) => ({ ...v, level: e.target.value }))}
              className={inputClass}
            >
              {SERIES_LEVEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-stone-600">Duration</span>
            <select
              disabled={submitted}
              value={values.duration}
              onChange={(e) => setValues((v) => ({ ...v, duration: e.target.value }))}
              className={inputClass}
            >
              {SERIES_DURATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-stone-600">Cadence</span>
            <select
              disabled={submitted}
              value={values.cadence}
              onChange={(e) => setValues((v) => ({ ...v, cadence: e.target.value }))}
              className={inputClass}
            >
              {SERIES_CADENCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-stone-600">Send time</span>
            <input
              type="time"
              disabled={submitted}
              value={values.send_time}
              onChange={(e) => setValues((v) => ({ ...v, send_time: e.target.value }))}
              className={inputClass}
            />
          </label>

          <label className="block space-y-1.5 sm:col-span-2">
            <span className="text-xs font-medium text-stone-600">Timezone</span>
            <select
              disabled={submitted}
              value={values.timezone}
              onChange={(e) => setValues((v) => ({ ...v, timezone: e.target.value }))}
              className={inputClass}
            >
              {SERIES_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </label>
        </div>

        {showDayPicker && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-stone-600">Send days</span>
            <div className="flex flex-wrap gap-2">
              {SERIES_WEEKDAYS.map((day) => {
                const active = values.send_days.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={submitted}
                    onClick={() => toggleDay(day)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? 'bg-stone-900 text-white'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    } disabled:opacity-60`}
                  >
                    {day.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!submitted && (
          <button
            type="submit"
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            <Calendar className="h-4 w-4" />
            Continue with these settings
          </button>
        )}

        {submitted && (
          <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-emerald-700">
            <Check className="h-3.5 w-3.5" />
            Settings submitted
          </p>
        )}
      </form>
    </div>
  );
}
