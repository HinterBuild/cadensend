export type ContentCheckSeverity = 'error' | 'warning' | 'info';

export type ContentCheck = {
  id: string;
  severity: ContentCheckSeverity;
  message: string;
  suggestion?: string;
  blockIndex?: number;
};

export type ContentStructureInput = {
  content_blocks?: Array<{
    title?: string;
    text?: string;
  }>;
  visual_specs?: Array<{
    type?: string;
    content?: string;
    alt_text?: string;
  }>;
};

type SegmentKind = 'prose' | 'code' | 'diagram' | 'table';

type Segment = {
  kind: SegmentKind;
  lang: string;
  proseChars: number;
  blockIndex: number;
};

const FENCE_RE = /```([a-zA-Z0-9_+-]*)\s*\n([\s\S]*?)```/g;

function isTableBlock(text: string) {
  const lines = text.split('\n').filter((line) => line.trim());
  if (lines.length < 2) return false;
  return lines.every((line) => line.trim().startsWith('|') && line.includes('|', 1));
}

function classifyFence(lang: string): SegmentKind {
  const normalized = lang.toLowerCase();
  if (normalized === 'mermaid' || normalized === 'd2') return 'diagram';
  return 'code';
}

function parseBlockSegments(text: string, blockIndex: number): Segment[] {
  const source = (text || '').replace(/\r\n/g, '\n');
  if (!source.trim()) return [];

  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  FENCE_RE.lastIndex = 0;

  while ((match = FENCE_RE.exec(source)) !== null) {
    const prose = source.slice(lastIndex, match.index);
    const proseTrimmed = prose.trim();
    if (proseTrimmed) {
      segments.push({
        kind: isTableBlock(proseTrimmed) ? 'table' : 'prose',
        lang: '',
        proseChars: proseTrimmed.length,
        blockIndex,
      });
    }
    segments.push({
      kind: classifyFence(match[1] || ''),
      lang: match[1] || '',
      proseChars: 0,
      blockIndex,
    });
    lastIndex = match.index + match[0].length;
  }

  const tail = source.slice(lastIndex).trim();
  if (tail) {
    segments.push({
      kind: isTableBlock(tail) ? 'table' : 'prose',
      lang: '',
      proseChars: tail.length,
      blockIndex,
    });
  }

  if (segments.length === 0 && source.trim()) {
    segments.push({
      kind: 'prose',
      lang: '',
      proseChars: source.trim().length,
      blockIndex,
    });
  }

  return segments;
}

function isTechnical(kind: SegmentKind) {
  return kind === 'code' || kind === 'diagram';
}

function pushCheck(
  checks: ContentCheck[],
  seen: Set<string>,
  check: ContentCheck,
) {
  const key = `${check.id}:${check.blockIndex ?? 'all'}`;
  if (seen.has(key)) return;
  seen.add(key);
  checks.push(check);
}

export function analyzeContentStructure(input: ContentStructureInput): ContentCheck[] {
  const blocks = input.content_blocks ?? [];
  const visuals = (input.visual_specs ?? []).filter((visual) => (visual.content || '').trim());
  const checks: ContentCheck[] = [];
  const seen = new Set<string>();

  const allSegments: Segment[] = [];
  blocks.forEach((block, blockIndex) => {
    const segments = parseBlockSegments(block.text || '', blockIndex);
    allSegments.push(...segments);

    if (segments.length === 0) return;

    const first = segments[0];
    const last = segments[segments.length - 1];

    if (isTechnical(first.kind)) {
      pushCheck(checks, seen, {
        id: 'block_opens_with_technical',
        severity: 'warning',
        message: `Block ${blockIndex + 1} opens with a ${first.kind === 'diagram' ? 'diagram' : 'code block'}.`,
        suggestion: 'Add a short intro sentence before diagrams and code so readers know why they matter.',
        blockIndex,
      });
    }

    if (segments.length > 1 && isTechnical(last.kind)) {
      pushCheck(checks, seen, {
        id: 'block_ends_with_technical',
        severity: 'warning',
        message: `Block ${blockIndex + 1} ends with a ${last.kind === 'diagram' ? 'diagram' : 'code block'}.`,
        suggestion: 'Follow technical sections with a takeaway sentence or transition.',
        blockIndex,
      });
    }

    for (let i = 0; i < segments.length - 1; i += 1) {
      const current = segments[i];
      const next = segments[i + 1];
      if (current.kind === 'diagram' && next.kind === 'diagram') {
        pushCheck(checks, seen, {
          id: 'consecutive_diagrams_in_block',
          severity: 'error',
          message: `Block ${blockIndex + 1} places two diagrams back-to-back.`,
          suggestion: 'Separate diagrams with prose that explains each step before showing the next one.',
          blockIndex,
        });
      }
      if (current.kind === 'code' && next.kind === 'code') {
        pushCheck(checks, seen, {
          id: 'consecutive_code_in_block',
          severity: 'warning',
          message: `Block ${blockIndex + 1} stacks code blocks without explanation between them.`,
          suggestion: 'Explain what the first snippet does before showing another one.',
          blockIndex,
        });
      }
      if (next.kind === 'diagram' && current.kind === 'prose' && current.proseChars < 48) {
        pushCheck(checks, seen, {
          id: 'thin_context_before_diagram',
          severity: 'warning',
          message: `Block ${blockIndex + 1} has very little setup before a diagram.`,
          suggestion: 'Add a sentence or two describing what the reader should look for in the diagram.',
          blockIndex,
        });
      }
      if (next.kind === 'code' && current.kind === 'prose' && current.proseChars < 32) {
        pushCheck(checks, seen, {
          id: 'thin_context_before_code',
          severity: 'info',
          message: `Block ${blockIndex + 1} jumps into code with minimal setup.`,
          suggestion: 'Briefly say what the snippet demonstrates before the fence.',
          blockIndex,
        });
      }
    }

    segments.forEach((segment) => {
      if (segment.kind === 'code' && !segment.lang.trim()) {
        pushCheck(checks, seen, {
          id: 'code_missing_language',
          severity: 'info',
          message: `Block ${blockIndex + 1} has a code fence without a language tag.`,
          suggestion: 'Use ```bash, ```python, ```yaml, etc. so email clients render it cleanly.',
          blockIndex,
        });
      }
    });
  });

  if (allSegments.length > 0) {
    const firstOverall = allSegments[0];
    const lastOverall = allSegments[allSegments.length - 1];

    if (isTechnical(firstOverall.kind)) {
      pushCheck(checks, seen, {
        id: 'email_opens_with_technical',
        severity: 'error',
        message: 'The email opens with a diagram or code block before any introduction.',
        suggestion: 'Start with a hook paragraph, then introduce visuals and snippets.',
      });
    }

    if (isTechnical(lastOverall.kind)) {
      pushCheck(checks, seen, {
        id: 'email_ends_with_technical',
        severity: 'warning',
        message: 'The email ends on a diagram or code block.',
        suggestion: 'Close with a summary, next step, or call to action after the last technical element.',
      });
    }

    let diagramStreak = 0;
    let codeStreak = 0;
    allSegments.forEach((segment) => {
      if (segment.kind === 'diagram') {
        diagramStreak += 1;
        codeStreak = 0;
      } else if (segment.kind === 'code') {
        codeStreak += 1;
        diagramStreak = 0;
      } else if (segment.kind === 'prose') {
        diagramStreak = 0;
        codeStreak = 0;
      }
      if (diagramStreak >= 2) {
        pushCheck(checks, seen, {
          id: 'consecutive_diagrams',
          severity: 'error',
          message: 'Multiple diagrams appear in a row across the email.',
          suggestion: 'Alternate diagrams with explanatory prose so each one lands clearly.',
          blockIndex: segment.blockIndex,
        });
        diagramStreak = 0;
      }
      if (codeStreak >= 3) {
        pushCheck(checks, seen, {
          id: 'consecutive_code_blocks',
          severity: 'warning',
          message: 'Three or more code blocks appear back-to-back.',
          suggestion: 'Break up long code sequences with commentary or partial snippets.',
          blockIndex: segment.blockIndex,
        });
        codeStreak = 0;
      }
    });
  }

  if (blocks.length > 1) {
    blocks.forEach((block, blockIndex) => {
      const hasTechnical = /```/.test(block.text || '');
      if (hasTechnical && !block.title?.trim()) {
        pushCheck(checks, seen, {
          id: 'missing_block_title',
          severity: 'info',
          message: `Block ${blockIndex + 1} includes code or diagrams but has no title.`,
          suggestion: 'Add a block title so readers know what each section covers.',
          blockIndex,
        });
      }
    });
  }

  const inlineDiagrams = allSegments.some((segment) => segment.kind === 'diagram');
  if (visuals.length > 0 && inlineDiagrams) {
    pushCheck(checks, seen, {
      id: 'mixed_diagram_placement',
      severity: 'info',
      message: 'This issue uses both inline diagrams and detached visuals.',
      suggestion: 'Keep inline diagrams near the text they explain; reserve detached visuals for summary figures at the end.',
    });
  }

  if (visuals.length > 0 && blocks.length > 0) {
    const lastBlock = blocks[blocks.length - 1];
    const lastSegments = parseBlockSegments(lastBlock.text || '', blocks.length - 1);
    const lastKind = lastSegments[lastSegments.length - 1]?.kind;
    if (lastKind && isTechnical(lastKind)) {
      pushCheck(checks, seen, {
        id: 'detached_visual_after_technical_end',
        severity: 'warning',
        message: 'Detached visuals will render after a body that already ends on code or a diagram.',
        suggestion: 'Add a short closing paragraph before detached visuals, or move the diagram inline.',
        blockIndex: blocks.length - 1,
      });
    }
  }

  return checks;
}

export function contentStructureScore(checks: ContentCheck[]) {
  const errors = checks.filter((check) => check.severity === 'error').length;
  const warnings = checks.filter((check) => check.severity === 'warning').length;
  const infos = checks.filter((check) => check.severity === 'info').length;
  const score = Math.max(0, 100 - errors * 20 - warnings * 8 - infos * 2);
  return { score, errors, warnings, infos };
}

export function summarizeContentChecks(checks: ContentCheck[]) {
  const { score, errors, warnings } = contentStructureScore(checks);
  if (errors > 0) return { label: 'Needs reordering', tone: 'error' as const, score };
  if (warnings > 0) return { label: 'Could be tighter', tone: 'warning' as const, score };
  if (checks.length > 0) return { label: 'Good flow', tone: 'info' as const, score };
  return { label: 'Well structured', tone: 'success' as const, score };
}

export function contentStructureFromIssue(contentJson?: string | Record<string, unknown> | null): ContentStructureInput {
  let parsed: Record<string, unknown> | null = null;
  if (contentJson && typeof contentJson === 'object') {
    parsed = contentJson as Record<string, unknown>;
  } else if (typeof contentJson === 'string' && contentJson) {
    try {
      parsed = JSON.parse(contentJson) as Record<string, unknown>;
    } catch {
      parsed = null;
    }
  }
  return {
    content_blocks: Array.isArray(parsed?.content_blocks)
      ? (parsed.content_blocks as ContentStructureInput['content_blocks'])
      : [],
    visual_specs: Array.isArray(parsed?.visual_specs)
      ? (parsed.visual_specs as ContentStructureInput['visual_specs'])
      : [],
  };
}
