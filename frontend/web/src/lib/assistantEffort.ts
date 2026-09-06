export type AssistantEffort = 'low' | 'high' | 'very_high' | 'max';

export const ASSISTANT_EFFORT_KEY = 'cadensend.assistant.effort';

export const EFFORT_OPTIONS: Array<{
  id: AssistantEffort;
  label: string;
  hint: string;
  bars: number;
}> = [
  { id: 'low', label: 'Low', hint: 'Fast, minimal tools', bars: 1 },
  { id: 'high', label: 'High', hint: 'Balanced (default)', bars: 2 },
  { id: 'very_high', label: 'Very high', hint: 'Thorough research & edits', bars: 3 },
  { id: 'max', label: 'Max', hint: 'Maximum depth & tool rounds', bars: 4 },
];

export function normalizeEffort(value: string | null | undefined): AssistantEffort {
  const key = (value || 'high').toLowerCase().replace(/-/g, '_');
  if (key === 'low' || key === 'high' || key === 'very_high' || key === 'max') {
    return key;
  }
  return 'high';
}

export function loadStoredEffort(): AssistantEffort {
  try {
    return normalizeEffort(localStorage.getItem(ASSISTANT_EFFORT_KEY));
  } catch {
    return 'high';
  }
}

export function saveStoredEffort(effort: AssistantEffort) {
  try {
    localStorage.setItem(ASSISTANT_EFFORT_KEY, effort);
  } catch {
    // ignore
  }
}

export function effortLabel(effort: AssistantEffort): string {
  return EFFORT_OPTIONS.find((o) => o.id === effort)?.label ?? 'High';
}
