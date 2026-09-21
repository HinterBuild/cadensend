const STALE_AFTER_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Shown on sources that have not been successfully re-indexed within the
 * default freshness window, so stale reference material is visible before
 * it gets cited in a new issue. Purely informational — re-ingest to clear it.
 */
export function StaleBadge({ lastVerifiedAt }: { lastVerifiedAt?: string }) {
  if (!lastVerifiedAt) return null;
  const verified = new Date(lastVerifiedAt);
  if (Number.isNaN(verified.getTime())) return null;

  const ageDays = Math.floor((Date.now() - verified.getTime()) / MS_PER_DAY);
  if (ageDays < STALE_AFTER_DAYS) return null;

  return (
    <span
      className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800"
      title={`Last verified ${ageDays} days ago. Re-ingest to confirm it still reflects the source.`}
    >
      May be stale
    </span>
  );
}
