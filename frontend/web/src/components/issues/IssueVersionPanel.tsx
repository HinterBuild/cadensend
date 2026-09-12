"use client";

import type { IssueContent } from '@/types';
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  Clock3,
  FileText,
  History,
  Layers,
  RotateCcw,
  X,
} from "lucide-react";
import { issueApi } from "@/lib/api";
import { normalizeIssuePresentation } from "@/lib/emailPresentation";
import { EmailPreview } from "@/components/LessonPreview";
import type { IssuePresentation, IssueVersionSummary } from "@/types";

type VersionDetail = IssueVersionSummary & {
  content_json?: string | Record<string, unknown> | null;
};

type ParsedVersion = {
  subject: string;
  preheader: string;
  blocks: Array<{ title?: string; text: string }>;
  visuals: Array<{ type?: string; content?: string; alt_text?: string }>;
  presentation: IssuePresentation;
};

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleString();
}

function parseVersionContent(raw: VersionDetail["content_json"]): ParsedVersion {
  let parsed: Partial<IssueContent> | null = null;
  if (raw && typeof raw === "object") {
    parsed = raw as Partial<IssueContent>;
  } else if (typeof raw === "string" && raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }

  const blocks = Array.isArray(parsed?.content_blocks)
    ? parsed.content_blocks.map((block: IssueContent['content_blocks'][number]) => ({
        title: block?.title,
        text: block?.text || "",
      }))
    : [];
  const visuals = Array.isArray(parsed?.visual_specs)
    ? parsed.visual_specs.map((spec: IssueContent['visual_specs'][number]) => ({
        type: spec?.type,
        content: spec?.content,
        alt_text: spec?.alt_text,
      }))
    : [];

  return {
    subject: parsed?.subject || "",
    preheader: parsed?.preheader || "",
    blocks,
    visuals,
    presentation: normalizeIssuePresentation(parsed?.presentation),
  };
}

function DiffPill({ label, current, selected }: { label: string; current: string; selected: string }) {
  if (current === selected) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <p className="font-semibold">{label} changed</p>
      <p className="mt-1 text-amber-800">
        <span className="text-amber-700">Now:</span> {current || "—"}
      </p>
      <p className="mt-0.5 text-amber-800">
        <span className="text-amber-700">Selected:</span> {selected || "—"}
      </p>
    </div>
  );
}

export function IssueVersionPanel({
  issueId,
  open,
  versions,
  currentSubject,
  currentPreheader,
  currentBlockCount,
  currentWordCount,
  editable,
  restoringVersion,
  onClose,
  onRestore,
}: {
  issueId: string;
  open: boolean;
  versions: IssueVersionSummary[];
  currentSubject: string;
  currentPreheader: string;
  currentBlockCount: number;
  currentWordCount: number;
  editable: boolean;
  restoringVersion: number | null;
  onClose: () => void;
  onRestore: (version: number) => void;
}) {
  const [chosenVersion, setSelectedVersion] = useState<number | null>(null);
  const [detail, setDetail] = useState<VersionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const selectedVersion = chosenVersion ?? versions.find(version => version.is_current)?.version ?? versions[0]?.version ?? null;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !issueId || selectedVersion == null) {
      return;
    }
    let cancelled = false;

    issueApi
      .getVersion(issueId, selectedVersion)
      .then((response) => {
        if (!cancelled) { setDetail(response.data); setDetailError(null); }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setDetail(null);
          setDetailError(err.message || "Failed to load version");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [issueId, open, selectedVersion]);

  const parsed = useMemo(() => (detail ? parseVersionContent(detail.content_json) : null), [detail]);
  const selectedMeta = versions.find((version) => version.version === selectedVersion) ?? null;

  if (!open) return null;

  return (
    <div
      className="fixed inset-y-0 right-0 left-0 top-[52px] z-50 flex sm:top-0 sm:left-[var(--sidebar-width,16rem)]"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close version history"
        onClick={onClose}
      />
      <aside
        className="relative ml-auto flex h-full w-full max-w-5xl flex-col border-l border-[#e7e0d6] bg-[#faf8f5] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="issue-version-title"
      >
        <div className="flex items-center justify-between border-b border-[#e7e0d6] bg-white px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Issue history</p>
            <h2 id="issue-version-title" className="font-display text-lg font-semibold text-stone-900">
              Version timeline
            </h2>
            <p className="text-sm text-stone-600">
              Preview any snapshot, compare against the live draft, and restore when needed.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="overflow-y-auto border-b border-[#e7e0d6] bg-white lg:border-b-0 lg:border-r">
            <div className="border-b border-[#e7e0d6] px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-stone-600">
                <History className="h-4 w-4" aria-hidden="true" />
                {versions.length} saved version{versions.length === 1 ? "" : "s"}
              </div>
            </div>
            {versions.length === 0 ? (
              <div className="px-4 py-10 text-sm text-stone-500">
                No saved versions yet. Manual saves, regenerations, and restores all create snapshots here.
              </div>
            ) : (
              <ul className="divide-y divide-[#f0ebe3]">
                {versions.map((version) => {
                  const active = selectedVersion === version.version;
                  return (
                    <li key={version.version}>
                      <button
                        type="button"
                        onClick={() => { setSelectedVersion(version.version); setLoadingDetail(true); setDetailError(null); setDetail(null); }}
                        className={`w-full px-4 py-3 text-left transition ${
                          active ? "bg-stone-900 text-white" : "hover:bg-[#faf8f5]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className={`text-sm font-semibold ${active ? "text-white" : "text-stone-900"}`}>
                              Version {version.version}
                              {version.is_current ? (
                                <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                  active ? "bg-white/15 text-white" : "bg-emerald-100 text-emerald-800"
                                }`}>
                                  Live
                                </span>
                              ) : null}
                            </p>
                            <p className={`mt-0.5 truncate text-sm ${active ? "text-stone-200" : "text-stone-700"}`}>
                              {version.subject || "Untitled"}
                            </p>
                          </div>
                          <span className={`shrink-0 text-[11px] ${active ? "text-stone-300" : "text-stone-500"}`}>
                            {formatWhen(version.created_at)}
                          </span>
                        </div>
                        <div className={`mt-2 flex flex-wrap gap-2 text-[11px] ${active ? "text-stone-300" : "text-stone-500"}`}>
                          <span className="inline-flex items-center gap-1">
                            <Layers className="h-3 w-3" aria-hidden="true" />
                            {version.block_count ?? 0} blocks
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <FileText className="h-3 w-3" aria-hidden="true" />
                            {version.word_count ?? 0} words
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="h-3 w-3" aria-hidden="true" />
                            {new Date(version.created_at).toLocaleString()}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex min-h-0 flex-col">
            <div className="border-b border-[#e7e0d6] bg-white px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Preview</p>
                  <h3 className="font-display text-base font-semibold text-stone-900">
                    {selectedMeta ? `Version ${selectedMeta.version}` : "Select a version"}
                  </h3>
                </div>
                {selectedMeta && !selectedMeta.is_current && editable ? (
                  <button
                    type="button"
                    onClick={() => onRestore(selectedMeta.version)}
                    disabled={restoringVersion !== null}
                    className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    {restoringVersion === selectedMeta.version ? "Restoring…" : "Restore this version"}
                  </button>
                ) : null}
              </div>

              {selectedMeta ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <DiffPill label="Subject" current={currentSubject} selected={selectedMeta.subject} />
                  <DiffPill label="Preheader" current={currentPreheader} selected={selectedMeta.preheader} />
                  {(selectedMeta.block_count ?? 0) !== currentBlockCount || (selectedMeta.word_count ?? 0) !== currentWordCount ? (
                    <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 sm:col-span-2">
                      <p className="inline-flex items-center gap-1.5 font-semibold">
                        <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
                        Content size changed
                      </p>
                      <p className="mt-1">
                        Live draft: {currentBlockCount} blocks · {currentWordCount} words
                      </p>
                      <p>
                        Selected version: {selectedMeta.block_count ?? 0} blocks · {selectedMeta.word_count ?? 0} words
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {loadingDetail ? (
                <div className="flex h-full items-center justify-center text-sm text-stone-500">
                  Loading version preview…
                </div>
              ) : detailError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700">
                  {detailError}
                </div>
              ) : parsed ? (
                <div className="mx-auto max-w-3xl">
                  <EmailPreview
                    subject={parsed.subject}
                    preheader={parsed.preheader}
                    blocks={parsed.blocks}
                    visuals={parsed.visuals}
                    presentation={parsed.presentation}
                  />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-stone-500">
                  Choose a version from the timeline to preview it.
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
