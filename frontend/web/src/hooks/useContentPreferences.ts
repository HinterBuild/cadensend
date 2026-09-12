'use client';

import { useCallback, useEffect, useState } from 'react';
import { contentPreferencesApi } from '@/lib/api';
import type { ContentPreferences } from '@/types/contentPreferences';
import { EMPTY_CONTENT_PREFERENCES } from '@/types/contentPreferences';

export function useContentPreferences() {
  const [prefs, setPrefs] = useState<ContentPreferences>(EMPTY_CONTENT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => contentPreferencesApi.get()
    .then(res => {
      setPrefs({ custom_voices: res.data?.custom_voices ?? [], custom_goals: res.data?.custom_goals ?? [] });
      setError(null);
    })
    .catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Failed to load preferences');
      setPrefs(EMPTY_CONTENT_PREFERENCES);
    })
    .finally(() => setLoading(false)), []);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async (next: ContentPreferences) => {
    setError(null);
    const res = await contentPreferencesApi.update(next);
    setPrefs({ custom_voices: res.data?.custom_voices ?? next.custom_voices, custom_goals: res.data?.custom_goals ?? next.custom_goals });
    return res.data ?? next;
  }, []);

  return { prefs, loading, error, reload: load, save };
}
