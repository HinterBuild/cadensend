"use client";

import type { IssueContent } from '@/types';
import { errorMessage } from '@/lib/errors';
import { useCallback, useEffect, useRef, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Save, Send, RefreshCw, Plus, Trash2, ArrowUp, ArrowDown,
  Bold, Code, List, Braces, History, CalendarClock, Ban,
  Clock, FileText, Layers, Palette, Sparkles, Truck,
} from 'lucide-react';
import { issueApi } from '@/lib/api';
import { defaultIssuePresentation, normalizeIssuePresentation, presentationPreset } from '@/lib/emailPresentation';
import {
  Issue,
  IssuePresentation,
  IssueVersionSummary,
  ContentBlock,
  VisualSpec,
  EmailStylePreset,
} from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { IssueDeliveryChecklist } from '@/components/issues/IssueDeliveryChecklist';
import { ContentStructurePanel } from '@/components/issues/ContentStructurePanel';
import { IssueEditorPreview, type PreviewTab } from '@/components/issues/IssueEditorPreview';
import { IssueStylePanel } from '@/components/issues/IssueStylePanel';
import { IssueVersionPanel } from '@/components/issues/IssueVersionPanel';
import { analyzeContentStructure } from '@/lib/contentStructure';

type BlockCitation = { source_id?: string; chunk_id?: string; text?: string };
type EditorBlock = { id: string; type: string; title?: string; text: string; citations?: BlockCitation[] };
type EditorVisual = { id: string; type?: string; content?: string; alt_text?: string };
type EditorTab = 'content' | 'design' | 'delivery';

const EDITOR_TABS: Array<{ id: EditorTab; label: string; icon: typeof FileText }> = [
  { id: 'content', label: 'Content', icon: FileText },
  { id: 'design', label: 'Design', icon: Palette },
  { id: 'delivery', label: 'Delivery', icon: Truck },
];

function newVisual(): EditorVisual {
  return {
    id: `visual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'mermaid',
    content: '',
    alt_text: '',
  };
}

function parseIssueContent(issue: Issue): {
  subject: string;
  preheader: string;
  blocks: EditorBlock[];
  visuals: EditorVisual[];
  presentation: IssuePresentation;
} {
  const raw = issue.content_json;
  let parsed: Partial<IssueContent> | null = null;
  if (raw && typeof raw === 'object') {
    parsed = raw as Partial<IssueContent>;
  } else if (typeof raw === 'string' && raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }

  const blocks = Array.isArray(parsed?.content_blocks)
    ? parsed.content_blocks.map((block: ContentBlock & { id?: string }, index: number) => ({
        id: block.id || `block-${index}`,
        type: block.type || 'markdown',
        title: block.title,
        text: block.text || '',
        // Citations must round-trip through saves or grounded-source
        // metadata would be silently dropped by PATCH /issues/:id.
        citations: Array.isArray(block.citations) ? block.citations : undefined,
      }))
    : [];

  const visuals = Array.isArray(parsed?.visual_specs)
    ? parsed.visual_specs.map((spec: VisualSpec & { id?: string; content?: string; alt_text?: string }, index: number) => ({
        id: spec.id || `visual-${index}`,
        type: spec.type,
        content: spec.content,
        alt_text: spec.alt_text,
      }))
    : [];

  return {
    subject: parsed?.subject || issue.objective || '',
    preheader: parsed?.preheader || '',
    blocks,
    visuals,
    presentation: normalizeIssuePresentation(parsed?.presentation),
  };
}

function toLocalInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const AUTOSAVE_DELAY_MS = 2500;

export default function IssueEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testNotice, setTestNotice] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [versions, setVersions] = useState<IssueVersionSummary[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
  const [editorTab, setEditorTab] = useState<EditorTab>('content');
  const [previewTab, setPreviewTab] = useState<PreviewTab>('inbox');
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewHtmlLoading, setPreviewHtmlLoading] = useState(false);
  const [previewHtmlError, setPreviewHtmlError] = useState<string | null>(null);

  const [content, setContent] = useState({
    subject: '',
    preheader: '',
    blocks: [] as EditorBlock[],
    visuals: [] as EditorVisual[],
    presentation: defaultIssuePresentation(),
  });

  const blockTextareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const contentRef = useRef(content);
  useEffect(() => { contentRef.current = content; }, [content]);

  const loadIssue = useCallback(() => issueApi.get(id).then(response => {
    const issueData = response.data;
    setIssue(issueData);
    setContent(parseIssueContent(issueData));
    setScheduledAt(toLocalInput(issueData.scheduled_at));
    setDirty(false);
    setError(null);
  }).catch((err: unknown) => setError(errorMessage(err) || 'Failed to load issue'))
    .finally(() => setLoading(false)), [id]);

  useEffect(() => { if (id) void loadIssue(); }, [id, loadIssue]);

  const loadPreviewHtml = useCallback(() => fetch(issueApi.previewHtmlUrl(id), { headers: { Accept: 'text/html' } })
    .then(async response => {
      if (!response.ok) throw new Error('Preview HTML is not ready yet');
      setPreviewHtml(await response.text());
      setPreviewHtmlError(null);
    }).catch((err: unknown) => { setPreviewHtml(''); setPreviewHtmlError(errorMessage(err) || 'Failed to load rendered HTML'); })
    .finally(() => setPreviewHtmlLoading(false)), [id]);

  const loadVersions = useCallback(() => issueApi.versions(id)
    .then(response => setVersions(response.data ?? []))
    .catch(() => setVersions([])), [id]);

  useEffect(() => { if (id && issue) void loadVersions(); }, [id, issue, loadVersions]);
  useEffect(() => { if (issue?.content_json) void loadPreviewHtml(); }, [issue?.content_json, issue?.updated_at, loadPreviewHtml]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  // Poll while generating.
  useEffect(() => {
    if (!id || issue?.status !== 'generating') {
      return;
    }
    const timer = setInterval(async () => {
      try {
        const response = await issueApi.get(id);
        setIssue(response.data);
        if (response.data.status !== 'generating') {
          setContent(parseIssueContent(response.data));
          setGenerating(false);
          setDirty(false);
        }
      } catch (err) {
        console.error('Failed to refresh issue status:', err);
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [id, issue?.status]);

  const editable = issue ? !issue.locked && issue.status !== 'sent' : false;

  const saveIssue = useCallback(async (silent = false) => {
    if (!id || !editable) return false;
    if (!silent) setSaving(true);
    const snapshot = contentRef.current;
    try {
      const response = await issueApi.update(id, {
        subject: contentRef.current.subject,
        preheader: contentRef.current.preheader,
        content_blocks: contentRef.current.blocks,
        visual_specs: contentRef.current.visuals.map(({ id: visualId, ...visual }) => ({
          id: visualId,
          ...visual,
        })),
        presentation: contentRef.current.presentation,
        scheduled_at: scheduledAt || undefined,
        // Background saves are throttled by the version snapshotter;
        // explicit Save Draft captures history immediately.
        ...(silent ? { autosave: true } : {}),
      });
      setIssue(response.data);
      if (contentRef.current === snapshot) setDirty(false);
      setLastSavedAt(new Date().toLocaleTimeString());
      return true;
    } catch (err: unknown) {
      setError(errorMessage(err) || 'Could not save your changes. Your edits are still in the editor.');
      return false;
    } finally {
      if (!silent) setSaving(false);
    }
  }, [id, editable, scheduledAt]);

  // Autosave: debounce writes after edits.
  useEffect(() => {
    if (!dirty || !editable) return;
    const timer = setTimeout(() => {
      saveIssue(true);
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [content, dirty, editable, saveIssue]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const navigateAway = async (target: string) => {
    if (dirty) {
      const ok = window.confirm('You have unsaved changes. Save before leaving?');
      if (ok) {
        const saved = await saveIssue();
        if (!saved) return;
      }
    }
    router.push(target);
  };

  const updateContent = (updater: (current: typeof content) => typeof content) => {
    setContent((current) => updater(current));
    setDirty(true);
  };

  const generateIssue = async (refreshFromCurrent = false) => {
    if (!id) return;
    if (dirty) {
      const ok = window.confirm(`${refreshFromCurrent ? 'Refreshing' : 'Generating'} will replace your current draft. It will be saved as a version first. Continue?`);
      if (!ok) return;
      await saveIssue(true);
    }
    setGenerating(true);
    setError(null);
    try {
      await issueApi.generate(id, {
        ...(user?.preferred_model ? { model: user.preferred_model } : {}),
        ...(refreshFromCurrent ? { refresh_from_current: true } : {}),
      });
      setIssue((current) => (current ? { ...current, status: 'generating' } : current));
    } catch (err: unknown) {
      setError(errorMessage(err) || `Failed to ${refreshFromCurrent ? 'refresh' : 'generate'} issue`);
      setGenerating(false);
    }
  };

  const cancelGeneration = async () => {
    if (!id) return;
    if (!window.confirm('Stop generating this issue? Any progress is discarded.')) return;
    setError(null);
    try {
      await issueApi.cancelGeneration(id);
      await loadIssue();
    } catch (err: unknown) {
      setError(errorMessage(err) || 'Failed to cancel generation');
      await loadIssue();
    }
  };

  const sendTestEmail = async () => {
    if (!id) return;
    setSendingTest(true);
    setError(null);
    setTestNotice('');
    try {
      const result = await issueApi.testSend(id, testEmail.trim() || undefined);
      const email = (result as { email?: string }).email || user?.email || 'your inbox';
      setTestNotice(`Test email sent to ${email}.`);
    } catch (err: unknown) {
      setError(errorMessage(err) || 'Failed to send test email');
    } finally {
      setSendingTest(false);
    }
  };

  const approveIssue = async () => {
    if (!id) return;
    if (!scheduledAt) {
      setError('Set a send time before approving.');
      return;
    }
    const structureErrors = analyzeContentStructure({
      content_blocks: content.blocks,
      visual_specs: content.visuals,
    }).filter((check) => check.severity === 'error');
    if (structureErrors.length > 0) {
      const proceed = window.confirm(
        `This issue has ${structureErrors.length} content-flow issue${structureErrors.length === 1 ? '' : 's'} (diagram/code order). Approve anyway?`,
      );
      if (!proceed) return;
    }
    try {
      await issueApi.approve(id, { scheduled_at: new Date(scheduledAt).toISOString() });
      if (issue) {
        router.push(`/series/${issue.series_id}`);
      }
    } catch (err: unknown) {
      setError(errorMessage(err) || 'Failed to approve issue');
    }
  };

  const rescheduleIssue = async () => {
    if (!id || !scheduledAt) return;
    setError(null);
    try {
      await issueApi.reschedule(id, new Date(scheduledAt).toISOString());
      setIssue((current) => (current ? { ...current, scheduled_at: new Date(scheduledAt).toISOString() } : current));
      setTestNotice('Send time updated.');
    } catch (err: unknown) {
      setError(errorMessage(err) || 'Failed to reschedule issue');
    }
  };

  const cancelSend = async () => {
    if (!id) return;
    if (!window.confirm('Cancel this scheduled send? The issue stays ready; you can approve it again later.')) return;
    setError(null);
    try {
      await issueApi.cancelSend(id);
      await loadIssue();
    } catch (err: unknown) {
      setError(errorMessage(err) || 'Failed to cancel the send');
    }
  };

  const restoreVersion = async (version: number) => {
    if (!id) return;
    if (!window.confirm(`Restore version ${version}? Your current draft is saved as a new version first.`)) return;
    setRestoringVersion(version);
    setError(null);
    try {
      if (dirty) await saveIssue(true);
      await issueApi.restoreVersion(id, version);
      await loadIssue();
      setShowVersions(false);
    } catch (err: unknown) {
      setError(errorMessage(err) || 'Failed to restore version');
    } finally {
      setRestoringVersion(null);
    }
  };

  // --- block operations -------------------------------------------------

  const addBlock = () => {
    updateContent((current) => ({
      ...current,
      blocks: [...current.blocks, { id: `block-${Date.now()}`, type: 'markdown', title: '', text: '' }],
    }));
  };

  const removeBlock = (index: number) => {
    updateContent((current) => ({
      ...current,
      blocks: current.blocks.filter((_, i) => i !== index),
    }));
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    updateContent((current) => {
      const blocks = [...current.blocks];
      const target = index + direction;
      if (target < 0 || target >= blocks.length) return current;
      [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
      return { ...current, blocks };
    });
  };

  const addVisual = () => {
    updateContent((current) => ({
      ...current,
      visuals: [...current.visuals, newVisual()],
    }));
  };

  const removeVisual = (visualId: string) => {
    updateContent((current) => ({
      ...current,
      visuals: current.visuals.filter((visual) => visual.id !== visualId),
    }));
  };

  const updateVisual = (visualId: string, patch: Partial<EditorVisual>) => {
    updateContent((current) => ({
      ...current,
      visuals: current.visuals.map((visual) => (visual.id === visualId ? { ...visual, ...patch } : visual)),
    }));
  };

  const updatePresentation = (patch: Partial<IssuePresentation>) => {
    updateContent((current) => ({
      ...current,
      presentation: normalizeIssuePresentation({
        ...current.presentation,
        ...patch,
      }),
    }));
  };

  const applyStylePreset = (preset: EmailStylePreset) => {
    updateContent((current) => ({
      ...current,
      presentation: normalizeIssuePresentation({
        ...presentationPreset(preset),
        font_pair: current.presentation.font_pair,
        diagram_theme: current.presentation.diagram_theme,
        diagram_style: current.presentation.diagram_style,
      }),
    }));
  };

  // --- markdown toolbar ---------------------------------------------------

  const insertTemplate = (blockId: string, template: string) => {
    const textarea = blockTextareaRefs.current[blockId];
    if (!textarea) return;
    const { selectionStart, selectionEnd, value } = textarea;
    const next = value.slice(0, selectionStart) + template + value.slice(selectionEnd);
    updateContent((current) => ({
      ...current,
      blocks: current.blocks.map((b) => (b.id === blockId ? { ...b, text: next } : b)),
    }));
    requestAnimationFrame(() => {
      textarea.focus();
      const pos = selectionStart + template.length;
      textarea.setSelectionRange(pos, pos);
    });
  };

  const wrapSelection = (blockId: string, before: string, after: string = before) => {
    const textarea = blockTextareaRefs.current[blockId];
    if (!textarea) return;
    const { selectionStart, selectionEnd, value } = textarea;
    const selected = value.slice(selectionStart, selectionEnd) || 'text';
    const next = value.slice(0, selectionStart) + before + selected + after + value.slice(selectionEnd);
    updateContent((current) => ({
      ...current,
      blocks: current.blocks.map((b) => (b.id === blockId ? { ...b, text: next } : b)),
    }));
    requestAnimationFrame(() => {
      textarea.focus();
      const pos = selectionStart + before.length + selected.length + after.length;
      textarea.setSelectionRange(pos, pos);
    });
  };

  const prefixLines = (blockId: string, prefix: string) => {
    const textarea = blockTextareaRefs.current[blockId];
    if (!textarea) return;
    const { selectionStart, selectionEnd, value } = textarea;
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const segment = value.slice(lineStart, selectionEnd);
    const replaced = segment
      .split('\n')
      .map((line) => (line.trim() ? `${prefix}${line}` : line))
      .join('\n');
    const next = value.slice(0, lineStart) + replaced + value.slice(selectionEnd);
    updateContent((current) => ({
      ...current,
      blocks: current.blocks.map((b) => (b.id === blockId ? { ...b, text: next } : b)),
    }));
  };

  // --- stats --------------------------------------------------------------

  const totalWords = content.blocks.reduce(
    (sum, block) => sum + block.text.trim().split(/\s+/).filter(Boolean).length,
    0,
  );
  const readMinutes = Math.max(1, Math.round(totalWords / 200));
  const subjectLength = content.subject.length;
  const subjectOk = subjectLength > 0 && subjectLength <= 60;
  const diagramCount =
    content.blocks.filter((block) => /```(mermaid|d2)\b/i.test(block.text)).length +
    content.visuals.filter((visual) => (visual.content || '').trim()).length;
  const citationCount = content.blocks.reduce(
    (sum, block) => sum + (block.citations?.length ?? 0),
    0,
  );
  const renderPreviewMuted = dirty
    ? 'Server-rendered views update after save or autosave.'
    : 'Preview matches what recipients will receive.';
  const hasRefreshableContent = content.blocks.some((block) => block.text.trim()) || content.visuals.some((visual) => (visual.content || '').trim());

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2 border-stone-900 mx-auto"
            role="status"
            aria-label="Loading"
          ></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (error && !issue) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="text-center">
          <p role="alert" aria-live="assertive" className="text-red-600">
            {error}
          </p>
        </div>
      </div>
    );
  }

  const canReschedule = issue?.status === 'approved' && scheduledAt && new Date(scheduledAt).getTime() > now;

  return (
    <div className="flex min-h-full flex-col bg-[#f6f3ee]">
      <header className="sticky top-0 z-30 border-b border-[#e7e0d6] bg-[#faf8f5]/95 backdrop-blur supports-[backdrop-filter]:bg-[#faf8f5]/80">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <button
                type="button"
                aria-label="Back to series"
                onClick={() => issue && navigateAway(`/series/${issue.series_id}`)}
                className="relative z-10 shrink-0 rounded-lg p-2 text-stone-600 hover:bg-stone-200/70 hover:text-stone-900"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
                  Issue #{issue?.sequence_no} · Editor
                </p>
                <h1 className="truncate font-display text-lg font-semibold text-stone-900 sm:text-xl">
                  {content.subject || 'Untitled issue'}
                </h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {dirty ? (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800" role="status">
                  Unsaved changes
                </span>
              ) : lastSavedAt ? (
                <span className="text-xs text-stone-500 tabular-nums">Saved {lastSavedAt}</span>
              ) : null}
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  issue?.status === 'approved' || issue?.status === 'ready'
                    ? 'bg-emerald-100 text-emerald-900'
                    : issue?.status === 'sent'
                    ? 'bg-violet-100 text-violet-900'
                    : issue?.status === 'failed'
                    ? 'bg-red-100 text-red-900'
                    : issue?.status === 'generating' || issue?.status === 'pending'
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-stone-100 text-stone-700'
                }`}
              >
                {issue?.status === 'generating' ? 'Generating' : issue?.status}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-[#e7e0d6] py-2.5">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => saveIssue()}
                disabled={saving || !editable}
                className="inline-flex items-center gap-1.5 surface px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = !showVersions;
                  setShowVersions(next);
                  if (next) loadVersions();
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${
                  showVersions
                    ? 'border-stone-900 bg-stone-900 text-white'
                    : 'border-[#e7e0d6] bg-white text-stone-800 hover:bg-stone-50'
                }`}
              >
                <History className="h-4 w-4" aria-hidden="true" />
                Versions{versions.length ? ` (${versions.length})` : ''}
              </button>
            </div>
            <div className="hidden h-6 w-px bg-[#e7e0d6] sm:block" aria-hidden="true" />
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => generateIssue(false)}
                disabled={generating || issue?.status === 'generating' || !editable}
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {(generating || issue?.status === 'generating')
                  ? 'Generating…'
                  : issue?.status === 'ready' || issue?.status === 'failed'
                  ? 'Regenerate'
                  : 'Generate'}
              </button>
              <button
                type="button"
                onClick={() => generateIssue(true)}
                disabled={generating || issue?.status === 'generating' || !editable || !hasRefreshableContent}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Refresh draft
              </button>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={sendTestEmail}
                disabled={sendingTest || generating || issue?.status === 'generating'}
                className="inline-flex items-center gap-1.5 surface px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                {sendingTest ? 'Sending…' : 'Test send'}
              </button>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="test@you.com"
                aria-label="Custom test email address"
                className="hidden w-40 surface px-3 py-1.5 text-sm text-stone-900 placeholder:text-stone-400 lg:block"
              />
              {issue?.status !== 'approved' && issue?.status !== 'sent' && (
                <button
                  type="button"
                  onClick={approveIssue}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Approve & schedule
                </button>
              )}
              {canReschedule && (
                <>
                  <button
                    type="button"
                    onClick={rescheduleIssue}
                    className="inline-flex items-center gap-1.5 surface px-3 py-1.5 text-sm text-stone-800 hover:bg-stone-50"
                  >
                    <CalendarClock className="h-4 w-4" aria-hidden="true" />
                    Reschedule
                  </button>
                  <button
                    type="button"
                    onClick={cancelSend}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                  >
                    <Ban className="h-4 w-4" aria-hidden="true" />
                    Cancel send
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {(issue?.status === 'generating' || generating) && (
          <div className="mb-6 rounded-lg bg-yellow-50 border border-yellow-200 p-4" role="status" aria-live="polite">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-yellow-700" aria-hidden="true"></div>
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-900">Generating issue content</p>
                <p className="text-sm text-yellow-800">The backend is working on this. You can leave this page and come back.</p>
              </div>
              <button
                type="button"
                onClick={cancelGeneration}
                aria-label="Stop generating this issue"
                className="inline-flex items-center gap-1.5 rounded-lg border border-yellow-300 bg-white px-3 py-2 text-sm font-medium text-yellow-900 hover:bg-yellow-100"
              >
                <Ban className="h-4 w-4" aria-hidden="true" />
                Cancel generation
              </button>
            </div>
          </div>
        )}
        {issue?.status === 'failed' && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4" role="alert">
            <p className="text-sm text-red-700">{issue.generate_error || error || 'Issue generation failed.'}</p>
          </div>
        )}
        {error && issue && issue.status !== 'failed' && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4" role="alert">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        {testNotice && (
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4" role="status">
            <p className="text-sm text-green-800">{testNotice}</p>
          </div>
        )}

        <IssueVersionPanel
          issueId={id}
          open={showVersions}
          versions={versions}
          currentSubject={content.subject}
          currentPreheader={content.preheader}
          currentBlockCount={content.blocks.length}
          currentWordCount={totalWords}
          editable={editable}
          restoringVersion={restoringVersion}
          onClose={() => setShowVersions(false)}
          onRestore={restoreVersion}
        />

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Words', value: totalWords.toLocaleString(), icon: FileText },
            { label: 'Read time', value: `~${readMinutes} min`, icon: Clock },
            { label: 'Blocks', value: String(content.blocks.length), icon: Layers },
            { label: 'Diagrams', value: String(diagramCount), icon: Sparkles },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-[#e7e0d6] bg-white px-4 py-3">
              <div className="flex items-center gap-2 text-stone-500">
                <stat.icon className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-medium uppercase tracking-wide">{stat.label}</span>
              </div>
              <p className="mt-1 font-display text-xl font-semibold text-stone-900">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex gap-1 rounded-xl border border-[#e7e0d6] bg-white p-1">
              {EDITOR_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setEditorTab(tab.id)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    editorTab === tab.id
                      ? 'bg-stone-900 text-white shadow-sm'
                      : 'text-stone-600 hover:bg-[#faf8f5] hover:text-stone-900'
                  }`}
                >
                  <tab.icon className="h-4 w-4" aria-hidden="true" />
                  {tab.label}
                </button>
              ))}
            </div>

            {editorTab === 'delivery' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-[#e7e0d6] bg-white p-5 space-y-5">
                  <div>
                    <label htmlFor="send-at" className="mb-1.5 block text-sm font-medium text-stone-700">
                      Send at
                    </label>
                    <input
                      id="send-at"
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => {
                        setScheduledAt(e.target.value);
                        setDirty(true);
                      }}
                      className="w-full rounded-xl border border-[#e7e0d6] px-3 py-2 text-stone-900 bg-white"
                    />
                    <p className="mt-1.5 text-xs text-stone-500">
                      Approve schedules a real send at this time. Approved issues can be rescheduled until they go out.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="subject" className="mb-1.5 block text-sm font-medium text-stone-700">
                      Subject{' '}
                      <span className={`font-normal text-xs ${subjectLength > 60 ? 'text-amber-700' : 'text-stone-400'}`}>
                        {subjectLength}/60
                      </span>
                    </label>
                    <input
                      id="subject"
                      type="text"
                      value={content.subject}
                      onChange={(e) => updateContent((c) => ({ ...c, subject: e.target.value }))}
                      className="w-full rounded-xl border border-[#e7e0d6] px-3 py-2 text-stone-900 bg-white"
                      placeholder="Enter issue subject"
                    />
                  </div>

                  <div>
                    <label htmlFor="preheader" className="mb-1.5 block text-sm font-medium text-stone-700">
                      Preheader
                    </label>
                    <textarea
                      id="preheader"
                      value={content.preheader}
                      onChange={(e) => updateContent((c) => ({ ...c, preheader: e.target.value }))}
                      rows={2}
                      className="w-full rounded-xl border border-[#e7e0d6] px-3 py-2 text-stone-900 bg-white"
                      placeholder="Brief summary shown in inbox previews"
                    />
                  </div>
                </div>

                <IssueDeliveryChecklist
                  subjectLength={subjectLength}
                  hasPreheader={!!content.preheader.trim()}
                  hasBlocks={content.blocks.length > 0}
                  hasSchedule={!!scheduledAt}
                  subjectOk={subjectOk}
                />

                {citationCount > 0 && (
                  <p className="text-xs text-stone-500">
                    {citationCount} grounded source citation{citationCount === 1 ? '' : 's'} across content blocks.
                  </p>
                )}
              </div>
            )}

            {editorTab === 'design' && (
              <IssueStylePanel
                presentation={content.presentation}
                onApplyPreset={applyStylePreset}
                onUpdate={updatePresentation}
              />
            )}

            {editorTab === 'content' && (
              <div className="space-y-4">
              <ContentStructurePanel
                content={{ content_blocks: content.blocks, visual_specs: content.visuals }}
              />
              <div className="rounded-2xl border border-[#e7e0d6] bg-white p-5 space-y-6">
              <div className="mb-4 flex items-center justify-between">
                <label className="block text-sm font-semibold text-stone-900">
                  Content blocks
                </label>
                <span className="text-xs text-stone-500 tabular-nums">
                  {totalWords} words · ~{readMinutes} min read
                </span>
              </div>
              <div className="space-y-4">
                {content.blocks.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed border-[#e7e0d6] py-10 text-center">
                    <p className="mb-3 text-stone-500">No content blocks yet.</p>
                    <button
                      type="button"
                      onClick={addBlock}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Add a block
                    </button>
                  </div>
                ) : (
                  content.blocks.map((block, idx) => (
                    <div key={block.id} className="rounded-xl border border-[#e7e0d6] p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-stone-800">Block {idx + 1}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveBlock(idx, -1)}
                            disabled={idx === 0}
                            aria-label={`Move block ${idx + 1} up`}
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                          >
                            <ArrowUp className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveBlock(idx, 1)}
                            disabled={idx === content.blocks.length - 1}
                            aria-label={`Move block ${idx + 1} down`}
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                          >
                            <ArrowDown className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeBlock(idx)}
                            aria-label={`Delete block ${idx + 1}`}
                            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      <div className="mb-2 flex flex-wrap gap-1" role="toolbar" aria-label="Formatting">
                        <button
                          type="button"
                          onClick={() => wrapSelection(block.id, '**')}
                          aria-label="Bold selection"
                          title="Bold"
                          className="rounded border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50"
                        >
                          <Bold className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => wrapSelection(block.id, '`')}
                          aria-label="Code selection"
                          title="Inline code"
                          className="rounded border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50"
                        >
                          <Code className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => wrapSelection(block.id, '\n```\n', '\n```\n')}
                          aria-label="Code block selection"
                          title="Code block"
                          className="rounded border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50"
                        >
                          <Braces className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => prefixLines(block.id, '- ')}
                          aria-label="Bullet list lines"
                          title="Bullet list"
                          className="rounded border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50"
                        >
                          <List className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => insertTemplate(block.id, '\n```mermaid\nflowchart TD\n  A[Idea] --> B[Example]\n```\n')}
                          aria-label="Insert Mermaid diagram"
                          title="Mermaid diagram"
                          className="rounded border border-gray-200 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                        >
                          Mermaid
                        </button>
                        <button
                          type="button"
                          onClick={() => insertTemplate(block.id, '\n```d2\nconcept: Learning\nconcept -> issue: explained by\n```\n')}
                          aria-label="Insert D2 diagram"
                          title="D2 diagram"
                          className="rounded border border-gray-200 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                        >
                          D2
                        </button>
                      </div>

                      <input
                        type="text"
                        value={block.title || ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          updateContent((current) => ({
                            ...current,
                            blocks: current.blocks.map((b) => (b.id === block.id ? { ...b, title: value } : b)),
                          }));
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2 text-gray-900 bg-white focus-visible:ring-2 focus-visible:ring-stone-800"
                        placeholder="Block title (optional)"
                        aria-label={`Block ${idx + 1} title`}
                      />
                      <textarea
                        ref={(el) => {
                          blockTextareaRefs.current[block.id] = el;
                        }}
                        value={block.text}
                        onChange={(e) => {
                          const value = e.target.value;
                          updateContent((current) => ({
                            ...current,
                            blocks: current.blocks.map((b) => (b.id === block.id ? { ...b, text: value } : b)),
                          }));
                        }}
                        rows={8}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm text-gray-900 bg-white focus-visible:ring-2 focus-visible:ring-stone-800"
                        placeholder="Block content (markdown)..."
                        aria-label={`Block ${idx + 1} content`}
                      />
                    </div>
                  ))
                )}
                {content.blocks.length > 0 && (
                  <button
                    type="button"
                    onClick={addBlock}
                    className="inline-flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add block
                  </button>
                )}
              </div>

            <section className="space-y-4 border-t border-[#e7e0d6] pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-stone-900">Detached visuals</h3>
                  <p className="text-xs text-stone-500">Diagrams that render after the lesson body instead of inline.</p>
                </div>
                <button
                  type="button"
                  onClick={addVisual}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add visual
                </button>
              </div>

              {content.visuals.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500">
                  No detached visuals yet. Inline Mermaid or D2 inside blocks still works.
                </div>
              ) : (
                <div className="space-y-4">
                  {content.visuals.map((visual, idx) => (
                    <div key={visual.id} className="rounded-lg border border-gray-200 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Visual {idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeVisual(visual.id)}
                          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-700"
                          aria-label={`Delete visual ${idx + 1}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-sm font-medium text-gray-700">Format</label>
                          <select
                            value={visual.type || 'mermaid'}
                            onChange={(e) => updateVisual(visual.id, { type: e.target.value })}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus-visible:ring-2 focus-visible:ring-stone-800"
                          >
                            <option value="mermaid">Mermaid</option>
                            <option value="d2">D2</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium text-gray-700">Caption</label>
                          <input
                            type="text"
                            value={visual.alt_text || ''}
                            onChange={(e) => updateVisual(visual.id, { alt_text: e.target.value })}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus-visible:ring-2 focus-visible:ring-stone-800"
                            placeholder="Diagram caption"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Source</label>
                        <textarea
                          value={visual.content || ''}
                          onChange={(e) => updateVisual(visual.id, { content: e.target.value })}
                          rows={8}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm text-gray-900 bg-white focus-visible:ring-2 focus-visible:ring-stone-800"
                          placeholder={visual.type === 'd2' ? 'concept: Reader\nconcept -> takeaway: understands' : 'flowchart TD\n  A[Start] --> B[Finish]'}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
              </div>
              </div>
            )}
          </div>

          <div className="xl:sticky xl:top-36 xl:w-[min(520px,42%)] xl:shrink-0 xl:self-start">
            <div className="h-[min(900px,calc(100vh-10rem))]">
              <IssueEditorPreview
                subject={content.subject}
                preheader={content.preheader}
                blocks={content.blocks}
                visuals={content.visuals}
                presentation={content.presentation}
                previewTab={previewTab}
                onPreviewTabChange={setPreviewTab}
                previewHtml={previewHtml}
                previewHtmlLoading={previewHtmlLoading}
                previewHtmlError={previewHtmlError}
                onRefreshHtml={loadPreviewHtml}
                renderPreviewMuted={renderPreviewMuted}
                dirty={dirty}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
