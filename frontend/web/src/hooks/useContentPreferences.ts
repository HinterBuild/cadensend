'use client';

import { useCallback, useEffect, useState } from 'react';
import { contentPreferencesApi } from '@/lib/api';
import type { ContentPreferences } from '@/types/contentPreferences';
import { EMPTY_CONTENT_PREFERENCES } from '@/types/contentPreferences';

export function useContentPreferences() {
  const [prefs, setPrefs] = useState<ContentPreferences>(EMPTY_CONTENT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await contentPreferencesApi.get();
      setPrefs(res.data ?? EMPTY_CONTENT_PREFERENCES);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load preferences');
      setPrefs(EMPTY_CONTENT_PREFERENCES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async (next: ContentPreferences) => {
    setError(null);
    const res = await contentPreferencesApi.update(next);
    setPrefs(res.data ?? next);
    return res.data ?? next;
  }, []);

  return { prefs, loading, error, reload: load, save };
}
