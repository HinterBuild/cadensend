'use client';

import { CheckCircle2, ChevronDown, ChevronUp, Loader2, Wrench } from 'lucide-react';
import { useState } from 'react';
import type { AssistantToolResult } from '@/types/assistant';
import { humanizeToolName } from '@/lib/assistantActions';
import { EntityPreview } from './EntityPreview';

const RICH_ENTITY_TYPES = new Set(['analytics', 'series_list', 'series', 'issue_list', 'issue', 'plan']);

export function ToolExecutionCard({ tool }: { tool: AssistantToolResult }) {
  const running = tool.status === 'running';
  const hasRichPreview = Boolean(tool.entityType && RICH_ENTITY_TYPES.has(tool.entityType));
  const [expanded, setExpanded] = useState(!hasRichPreview);

  if (running) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[#e7e0d6] bg-white px-3 py-2.5 text-sm text-stone-600">
        <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
        <span>{humanizeToolName(tool.name)}…</span>
      </div>
    );
  }

  if (hasRichPreview && tool.output) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-2 rounded-lg px-1 py-0.5 text-left text-[11px] font-medium uppercase tracking-wider text-stone-400 hover:text-stone-600"
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          {humanizeToolName(tool.name)}
          {expanded ? <ChevronUp className="ml-auto h-3.5 w-3.5" /> : <ChevronDown className="ml-auto h-3.5 w-3.5" />}
        </button>
        {expanded && <EntityPreview entityType={tool.entityType} output={tool.output} />}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#e7e0d6] bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-stone-100 bg-stone-50/80 px-3 py-2">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        <Wrench className="h-3.5 w-3.5 text-stone-400" />
        <span className="text-xs font-medium text-stone-700">{humanizeToolName(tool.name)}</span>
      </div>
      {tool.output && (
        <div className="px-3 py-2.5">
          <EntityPreview entityType={tool.entityType} output={tool.output} />
          {!tool.entityType && (
            <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded-lg bg-[#faf8f5] p-2 text-[11px] leading-relaxed text-stone-600">
              {tool.output.slice(0, 1200)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
