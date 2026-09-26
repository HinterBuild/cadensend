import { localInputToISO } from '../datetime';

it('converts a datetime-local value using the browser timezone', () => {
  expect(localInputToISO('2026-09-26T15:00')).toBe(new Date('2026-09-26T15:00').toISOString());
});

it('returns undefined for empty or invalid input', () => {
  expect(localInputToISO('')).toBeUndefined();
  expect(localInputToISO('not a date')).toBeUndefined();
});
