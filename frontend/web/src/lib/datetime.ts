// A <input type="datetime-local"> value ("2026-09-26T15:00") has no offset.
// The backend reads offset-less times as server-local (UTC in containers),
// so sending the raw value shifts the send time by the user's UTC offset.
// Always convert through Date, which interprets it in the browser's zone.
export function localInputToISO(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
