"use client";

import { useState } from "react";
import { Copy, Monitor, RefreshCw, Smartphone, Tablet } from "lucide-react";
import { EmailPreview } from "@/components/LessonPreview";
import type { IssuePresentation } from "@/types";

export type PreviewTab = "inbox" | "styled" | "rendered" | "plaintext" | "html";
export type PreviewDevice = "desktop" | "tablet" | "mobile";

type EditorBlock = {
  title?: string;
  text: string;
  citations?: Array<{ source_id?: string; text?: string }>;
};

type EditorVisual = { type?: string; content?: string; alt_text?: string };

const DEVICE_WIDTH: Record<PreviewDevice, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "390px",
};

const TABS: Array<{ value: PreviewTab; label: string }> = [
  { value: "inbox", label: "Inbox" },
  { value: "styled", label: "Styled" },
  { value: "rendered", label: "Rendered" },
  { value: "plaintext", label: "Plain text" },
  { value: "html", label: "HTML" },
];

function blocksToPlainText(
  subject: string,
  preheader: string,
  blocks: EditorBlock[],
): string {
  const lines: string[] = [];
  if (subject) lines.push(subject, "");
  if (preheader) lines.push(preheader, "");
  blocks.forEach((block) => {
    if (block.title) lines.push(block.title.toUpperCase(), "");
    const body = block.text
      .replace(/```[\s\S]*?```/g, "[diagram]")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/^#{1,6}\s+/gm, "");
    lines.push(body.trim(), "");
  });
  return lines.join("\n").trim();
}

function InboxMockup({
  subject,
  preheader,
  sender = "Cadensend",
}: {
  subject: string;
  preheader: string;
  sender?: string;
}) {
  const displaySubject = subject || "Untitled issue";
  const snippet = preheader || "Add a preheader to improve open rates in Gmail and Apple Mail.";
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-100 bg-stone-50 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Inbox preview</p>
        <p className="mt-0.5 text-xs text-stone-500">How subscribers see this in their inbox list</p>
      </div>
      <div className="divide-y divide-stone-100">
        <div className="flex items-start gap-3 bg-blue-50/60 px-4 py-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-900 text-xs font-semibold text-white">
            {sender.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-sm font-semibold text-stone-900">{sender}</p>
              <span className="shrink-0 text-[11px] text-stone-500">now</span>
            </div>
            <p className="truncate text-sm font-medium text-stone-900">{displaySubject}</p>
            <p className="line-clamp-2 text-sm text-stone-600">{snippet}</p>
          </div>
          <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500" aria-hidden="true" />
        </div>
        <div className="flex items-start gap-3 px-4 py-3 opacity-50">
          <div className="mt-0.5 h-9 w-9 shrink-0 rounded-full bg-stone-200" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-stone-700">Other newsletter</p>
            <p className="truncate text-sm text-stone-500">Weekly digest — 3 stories for you</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function IssueEditorPreview({
  subject,
  preheader,
  blocks,
  visuals,
  presentation,
  previewTab,
  onPreviewTabChange,
  previewHtml,
  previewHtmlLoading,
  previewHtmlError,
  onRefreshHtml,
  renderPreviewMuted,
  dirty,
}: {
  subject: string;
  preheader: string;
  blocks: EditorBlock[];
  visuals: EditorVisual[];
  presentation: IssuePresentation;
  previewTab: PreviewTab;
  onPreviewTabChange: (tab: PreviewTab) => void;
  previewHtml: string;
  previewHtmlLoading: boolean;
  previewHtmlError: string | null;
  onRefreshHtml: () => void;
  renderPreviewMuted: string;
  dirty: boolean;
}) {
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [copied, setCopied] = useState(false);
  const plainText = blocksToPlainText(subject, preheader, blocks);
  const showDeviceChrome = previewTab === "styled" || previewTab === "inbox";

  const copyPlainText = async () => {
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#e7e0d6] bg-white shadow-sm">
      <div className="shrink-0 border-b border-[#e7e0d6] px-4 py-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-sm font-semibold text-stone-900">Live preview</h2>
            <p className="text-xs text-stone-500">{renderPreviewMuted}</p>
          </div>
          {dirty ? (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
              Unsaved
            </span>
          ) : (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
              Synced
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => onPreviewTabChange(tab.value)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                previewTab === tab.value
                  ? "bg-stone-900 text-white"
                  : "bg-[#faf8f5] text-stone-600 hover:bg-stone-200/70"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {showDeviceChrome ? (
          <div className="mt-3 flex items-center gap-1 rounded-xl bg-[#faf8f5] p-1">
            {(
              [
                { value: "desktop", label: "Desktop", icon: Monitor },
                { value: "tablet", label: "Tablet", icon: Tablet },
                { value: "mobile", label: "Mobile", icon: Smartphone },
              ] as const
            ).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setDevice(value)}
                aria-label={`${label} preview`}
                title={label}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                  device === value
                    ? "bg-white text-stone-900 shadow-sm"
                    : "text-stone-500 hover:text-stone-800"
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto p-4"
        style={{ backgroundColor: previewTab === "html" ? "#0c0a09" : presentation.background_color }}
      >
        <div
          className="mx-auto transition-all duration-200"
          style={{ maxWidth: showDeviceChrome ? DEVICE_WIDTH[device] : "100%" }}
        >
          {previewTab === "inbox" ? (
            <div className="space-y-4">
              <InboxMockup subject={subject} preheader={preheader} />
              {device !== "desktop" ? (
                <p className="text-center text-[11px] text-stone-500">
                  Open the email on {device} to see the full styled layout below.
                </p>
              ) : null}
            </div>
          ) : null}

          {previewTab === "styled" ? (
            <EmailPreview
              subject={subject}
              preheader={preheader}
              blocks={blocks}
              visuals={visuals}
              presentation={presentation}
            />
          ) : null}

          {previewTab === "rendered" ? (
            <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
              {previewHtmlLoading ? (
                <div className="px-4 py-16 text-center text-sm text-stone-500">Loading rendered HTML…</div>
              ) : previewHtmlError ? (
                <div className="space-y-3 px-4 py-16 text-center">
                  <p className="text-sm text-red-600">{previewHtmlError}</p>
                  <button
                    type="button"
                    onClick={onRefreshHtml}
                    className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    Retry
                  </button>
                </div>
              ) : (
                <iframe
                  title="Rendered email HTML"
                  srcDoc={previewHtml}
                  className="h-[min(900px,70vh)] w-full bg-white"
                />
              )}
            </div>
          ) : null}

          {previewTab === "plaintext" ? (
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Plain-text fallback
                </p>
                <button
                  type="button"
                  onClick={copyPlainText}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs text-stone-700 hover:bg-stone-50"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-stone-800">
                {plainText || "Add content to generate the plain-text version."}
              </pre>
            </div>
          ) : null}

          {previewTab === "html" ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-stone-400">Server HTML</p>
                <button
                  type="button"
                  onClick={onRefreshHtml}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-600 bg-stone-900 px-3 py-1.5 text-xs text-stone-200 hover:bg-stone-800"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Refresh
                </button>
              </div>
              <textarea
                readOnly
                value={previewHtml}
                className="h-[min(900px,70vh)] w-full rounded-xl border border-stone-700 bg-stone-950 px-4 py-3 font-mono text-xs leading-relaxed text-stone-100"
              />
              {previewHtmlError ? <p className="text-sm text-red-400">{previewHtmlError}</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
