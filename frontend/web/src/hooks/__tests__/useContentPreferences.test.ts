/**
 * Tests for useContentPreferences hook.
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { useContentPreferences } from '@/hooks/useContentPreferences';
import { contentPreferencesApi } from '@/lib/api';
import { EMPTY_CONTENT_PREFERENCES } from '@/types/contentPreferences';

jest.mock('@/lib/api', () => ({
  contentPreferencesApi: {
    get: jest.fn(),
    update: jest.fn(),
  },
}));

describe('useContentPreferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads preferences on mount', async () => {
    (contentPreferencesApi.get as jest.Mock).mockResolvedValue({
      data: {
        custom_voices: [{ id: 'v1', label: 'Coach', value: 'coach' }],
        custom_goals: [],
      },
    });

    const { result } = renderHook(() => useContentPreferences());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.prefs.custom_voices).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('sets error when load fails', async () => {
    (contentPreferencesApi.get as jest.Mock).mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useContentPreferences());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('network down');
    expect(result.current.prefs).toEqual(EMPTY_CONTENT_PREFERENCES);
  });

  it('save updates local prefs', async () => {
    (contentPreferencesApi.get as jest.Mock).mockResolvedValue({ data: EMPTY_CONTENT_PREFERENCES });
    const next = {
      custom_voices: [],
      custom_goals: [{ id: 'g1', label: 'Labs', text: 'Hands-on practice every week.' }],
    };
    (contentPreferencesApi.update as jest.Mock).mockResolvedValue({ data: next });

    const { result } = renderHook(() => useContentPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.save(next);
    });

    expect(result.current.prefs).toEqual(next);
  });
});
