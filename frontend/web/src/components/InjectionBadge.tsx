import { InjectionFinding } from '@/types';

const CATEGORY_LABEL: Record<string, string> = {
  instruction_override: 'instruction override',
  role_hijack: 'role hijack',
  exfiltration: 'prompt extraction',
  content_manipulation: 'output manipulation',
  structural_fake: 'fake system markers',
  invisible_chars: 'hidden characters',
  comment_smuggling: 'smuggled comments',
};

/**
 * Shown on sources where the prompt-injection scanner found and removed
 * suspicious patterns before indexing. High-severity sources are blocked at
 * ingestion and surface through the normal failed-status error instead.
 */
export function InjectionBadge({
  status,
  findings,
}: {
  status?: string;
  findings?: InjectionFinding[];
}) {
  if (status !== 'flagged') return null;
  const detail = (findings ?? [])
    .map((finding) => `${CATEGORY_LABEL[finding.category] ?? finding.category} ×${finding.count}`)
    .join(', ');
  const title = detail
    ? `Prompt-injection scanner removed suspicious patterns before indexing (${detail}). The remaining prose is safe to use; review the source if this is unexpected.`
    : 'Prompt-injection scanner removed suspicious patterns before indexing. Review the source if this is unexpected.';
  return (
    <span
      className="rounded-full bg-orange-50 px-2 py-0.5 text-orange-700"
      title={title}
    >
      Sanitized by security scan
    </span>
  );
}
