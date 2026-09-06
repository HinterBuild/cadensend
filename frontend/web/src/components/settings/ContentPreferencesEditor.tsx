'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ContentPreferences, CustomGoal, CustomVoice } from '@/types/contentPreferences';

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-stone-800';

type ContentPreferencesEditorProps = {
  prefs: ContentPreferences;
  saving?: boolean;
  onSave: (prefs: ContentPreferences) => Promise<void>;
};

export function ContentPreferencesEditor({ prefs, saving, onSave }: ContentPreferencesEditorProps) {
  const [voices, setVoices] = useState<CustomVoice[]>(prefs.custom_voices);
  const [goals, setGoals] = useState<CustomGoal[]>(prefs.custom_goals);
  const [voiceLabel, setVoiceLabel] = useState('');
  const [voiceHint, setVoiceHint] = useState('');
  const [goalLabel, setGoalLabel] = useState('');
  const [goalText, setGoalText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setVoices(prefs.custom_voices);
    setGoals(prefs.custom_goals);
  }, [prefs]);

  const addVoice = () => {
    const label = voiceLabel.trim();
    if (!label) {
      setError('Voice name is required');
      return;
    }
    setVoices((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label,
        value: '',
        hint: voiceHint.trim() || undefined,
      },
    ]);
    setVoiceLabel('');
    setVoiceHint('');
    setError(null);
  };

  const addGoal = () => {
    const label = goalLabel.trim();
    const text = goalText.trim();
    if (!label) {
      setError('Goal name is required');
      return;
    }
    if (text.length < 10) {
      setError('Goal text must be at least 10 characters');
      return;
    }
    setGoals((prev) => [...prev, { id: crypto.randomUUID(), label, text }]);
    setGoalLabel('');
    setGoalText('');
    setError(null);
  };

  const handleSave = async () => {
    setError(null);
    try {
      await onSave({ custom_voices: voices, custom_goals: goals });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Custom voices</h3>
        <p className="mt-1 text-xs text-gray-500">
          These appear alongside Instructor, Newsletter, and Briefing when creating a series.
        </p>

        {voices.length > 0 && (
          <ul className="mt-3 space-y-2">
            {voices.map((voice) => (
              <li
                key={voice.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{voice.label}</p>
                  {voice.hint && <p className="mt-0.5 text-xs text-gray-500">{voice.hint}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => setVoices((prev) => prev.filter((v) => v.id !== voice.id))}
                  className="shrink-0 text-gray-400 hover:text-red-600"
                  aria-label={`Remove ${voice.label}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            type="text"
            value={voiceLabel}
            onChange={(e) => setVoiceLabel(e.target.value)}
            placeholder="Voice name (e.g. Founder memo)"
            className={inputClass}
          />
          <input
            type="text"
            value={voiceHint}
            onChange={(e) => setVoiceHint(e.target.value)}
            placeholder="Optional style hint for the AI"
            className={inputClass}
          />
        </div>
        <button
          type="button"
          onClick={addVoice}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-stone-700 hover:text-stone-900"
        >
          <Plus className="h-4 w-4" />
          Add voice
        </button>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-900">Custom goals</h3>
        <p className="mt-1 text-xs text-gray-500">
          Saved as quick-pick chips on the series creation form.
        </p>

        {goals.length > 0 && (
          <ul className="mt-3 space-y-2">
            {goals.map((goal) => (
              <li
                key={goal.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{goal.label}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-gray-600">{goal.text}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setGoals((prev) => prev.filter((g) => g.id !== goal.id))}
                  className="shrink-0 text-gray-400 hover:text-red-600"
                  aria-label={`Remove ${goal.label}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 space-y-3">
          <input
            type="text"
            value={goalLabel}
            onChange={(e) => setGoalLabel(e.target.value)}
            placeholder="Goal name (e.g. Product launch)"
            className={inputClass}
          />
          <textarea
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
            rows={3}
            placeholder="By the end of this series, you should be able to..."
            className={`${inputClass} resize-none`}
          />
        </div>
        <button
          type="button"
          onClick={addGoal}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-stone-700 hover:text-stone-900"
        >
          <Plus className="h-4 w-4" />
          Add goal
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save voices & goals'}
      </button>
    </div>
  );
}
