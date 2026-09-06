'use client';

import type { ReactNode } from 'react';

function formatInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-semibold text-stone-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={index}
          className="rounded-md bg-stone-100 px-1.5 py-0.5 font-mono text-[0.85em] text-stone-800"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

type Block =
  | { type: 'heading'; text: string; level: 2 | 3 }
  | { type: 'list'; items: string[] }
  | { type: 'paragraph'; text: string };

function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length) {
      blocks.push({ type: 'list', items: [...listItems] });
      listItems = [];
    }
  };

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    const headingMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      flushList();
      blocks.push({ type: 'heading', text: headingMatch[1], level: trimmed.startsWith('###') ? 3 : 2 });
      continue;
    }

    const boldHeading = trimmed.match(/^(?:[^\w\s]\s*)?\*\*(.+)\*\*:?\s*$/);
    if (boldHeading) {
      flushList();
      blocks.push({ type: 'heading', text: boldHeading[1], level: 3 });
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    if (bulletMatch) {
      listItems.push(bulletMatch[1]);
      continue;
    }

    flushList();
    blocks.push({ type: 'paragraph', text: trimmed });
  }

  flushList();
  return blocks;
}

type AssistantMessageContentProps = {
  content: string;
  variant?: 'light' | 'dark';
};

export function AssistantMessageContent({ content, variant = 'light' }: AssistantMessageContentProps) {
  const blocks = parseBlocks(content);
  const isDark = variant === 'dark';

  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const className =
            block.level === 2
              ? `font-display text-base tracking-tight ${isDark ? 'text-white' : 'text-stone-900'}`
              : `text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-stone-300' : 'text-stone-500'}`;
          return (
            <h3 key={index} className={className}>
              {formatInline(block.text)}
            </h3>
          );
        }

        if (block.type === 'list') {
          return (
            <ul
              key={index}
              className={`space-y-1.5 pl-0 ${isDark ? 'text-stone-100' : 'text-stone-700'}`}
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="flex gap-2">
                  <span
                    className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${
                      isDark ? 'bg-stone-400' : 'bg-stone-400'
                    }`}
                  />
                  <span className="min-w-0 flex-1">{formatInline(item)}</span>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={index} className={isDark ? 'text-stone-100' : 'text-stone-700'}>
            {formatInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}
