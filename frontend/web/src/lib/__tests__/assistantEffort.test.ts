import { effortLabel, normalizeEffort } from '@/lib/assistantEffort';

describe('assistantEffort', () => {
  it('normalizes effort aliases', () => {
    expect(normalizeEffort('high')).toBe('high');
    expect(normalizeEffort('very-high')).toBe('very_high');
    expect(normalizeEffort('MAX')).toBe('max');
    expect(normalizeEffort('unknown')).toBe('high');
  });

  it('returns labels for effort levels', () => {
    expect(effortLabel('low')).toBe('Low');
    expect(effortLabel('very_high')).toBe('Very high');
  });
});
