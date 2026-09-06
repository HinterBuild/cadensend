/**
 * Tests for series form default options.
 */

import { DEFAULT_GOAL_STARTERS, DEFAULT_TONE_OPTIONS } from '@/lib/seriesFormOptions';

describe('seriesFormOptions', () => {
  it('exposes default tone presets', () => {
    expect(DEFAULT_TONE_OPTIONS.length).toBeGreaterThanOrEqual(3);
    expect(DEFAULT_TONE_OPTIONS.map((t) => t.value)).toContain('instructor');
  });

  it('exposes default goal starters with text', () => {
    expect(DEFAULT_GOAL_STARTERS.length).toBeGreaterThanOrEqual(3);
    for (const goal of DEFAULT_GOAL_STARTERS) {
      expect(goal.label.length).toBeGreaterThan(0);
      expect(goal.text.length).toBeGreaterThan(20);
    }
  });
});
