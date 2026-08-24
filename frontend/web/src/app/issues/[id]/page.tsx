"use client";

import { useCallback, useEffect, useRef, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Save, Send, RefreshCw, Plus, Trash2, ArrowUp, ArrowDown,
  Bold, Code, List, Braces, History, X, CalendarClock, Ban,
} from 'lucide-react';
import { issueApi, seriesApi } from '@/lib/api';
import { Issue, IssueVersionSummary, ContentBlock, VisualSpec } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { EmailPreview } from '@/components/LessonPreview';

type BlockCitation = { source_id?: string; chunk_id?: string; text?: string };
type EditorBlock = { id: string; type: string; title?: string; text: string; citations?: BlockCitation[] };
type EditorVisual = { type?: string; content?: string; alt_text?: string };

function parseIssueContent(issue: Issue): {
  subject: string;
  preheader: string;
  blocks: EditorBlock[];
  visuals: EditorVisual[];
} {
  const raw = issue.content_json;
  let parsed: Record<string, any> | null = null;
  if (raw && typeof raw === 'object') {
    parsed = raw as Record<string, any>;
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
    ? parsed.visual_specs.map((spec: VisualSpec & { content?: string; alt_text?: string }) => ({
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

  const [content, setContent] = useState({
    subject: '',
    preheader: '',
    blocks: [] as EditorBlock[],
    visuals: [] as EditorVisual[],
  });

  const blockTextareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const contentRef = useRef(content);
  contentRef.current = content;

  useEffect(() => {
    if (id) {
      loadIssue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadIssue = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const response = await issueApi.get(id);
      const issueData = response.data;
      setIssue(issueData);
      setContent(parseIssueContent(issueData));
      setScheduledAt(toLocalInput(issueData.scheduled_at));
      setDirty(false);
    } catch (err: any) {
      setError(err.message || 'Failed to load issue');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadVersions = useCallback(async () => {
    if (!id) return;
    try {
      const response = await issueApi.versions(id);
      setVersions(response.data ?? []);
    } catch {
      setVersions([]);
    }
  }, [id]);

  useEffect(() => {
    if (id && issue) loadVersions();
  }, [id, issue?.updated_at, loadVersions, issue]);

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
    try {
      await issueApi.update(id, {
        subject: contentRef.current.subject,
        preheader: contentRef.current.preheader,
        content_blocks: contentRef.current.blocks,
        scheduled_at: scheduledAt || undefined,
        // Background saves are throttled by the version snapshotter;
        // explicit Save Draft captures history immediately.
        ...(silent ? { autosave: true } : {}),
      });
      setDirty(false);
      setLastSavedAt(new Date().toLocaleTimeString());
      return true;
    } catch (err: any) {
      if (!silent) setError(err.message || 'Failed to save issue');
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

  const generateIssue = async () => {
    if (!id) return;
    if (dirty) {
      const ok = window.confirm('Generating will replace your current draft. It will be saved as a version first. Continue?');
      if (!ok) return;
      await saveIssue(true);
    }
    setGenerating(true);
    setError(null);
    try {
      await issueApi.generate(id, user?.preferred_model ? { model: user.preferred_model } : {});
      setIssue((current) => (current ? { ...current, status: 'generating' } : current));
    } catch (err: any) {
      setError(err.message || 'Failed to generate issue');
      setGenerating(false);
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
    } catch (err: any) {
      setError(err.message || 'Failed to send test email');
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
    try {
      await issueApi.approve(id, { scheduled_at: new Date(scheduledAt).toISOString() });
      if (issue) {
        router.push(`/series/${issue.series_id}`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to approve issue');
    }
  };

  const rescheduleIssue = async () => {
    if (!id || !scheduledAt) return;
    setError(null);
    try {
      await issueApi.reschedule(id, new Date(scheduledAt).toISOString());
      setIssue((current) => (current ? { ...current, scheduled_at: new Date(scheduledAt).toISOString() } : current));
      setTestNotice('Send time updated.');
    } catch (err: any) {
      setError(err.message || 'Failed to reschedule issue');
    }
  };

  const cancelSend = async () => {
    if (!id) return;
    if (!window.confirm('Cancel this scheduled send? The issue stays ready; you can approve it again later.')) return;
    setError(null);
    try {
      await issueApi.cancelSend(id);
      await loadIssue();
    } catch (err: any) {
      setError(err.message || 'Failed to cancel the send');
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
    } catch (err: any) {
      setError(err.message || 'Failed to restore version');
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

  // --- markdown toolbar ---------------------------------------------------

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

  const canReschedule = issue?.status === 'approved' && scheduledAt && new Date(scheduledAt).getTime() > Date.now();

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4 min-w-0">
              <button
                type="button"
                aria-label="Back to series"
                onClick={() => issue && navigateAway(`/series/${issue.series_id}`)}
                className="text-gray-600 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800 rounded"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <h1 className="text-2xl font-bold text-gray-900 truncate">
                #{issue?.sequence_no} {content.subject || 'Untitled'}
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              {dirty && (
                <span className="text-xs text-amber-700" role="status">Unsaved changes…</span>
              )}
              {!dirty && lastSavedAt && (
                <span className="text-xs text-gray-500" tabular-nums>Saved {lastSavedAt}</span>
              )}
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  issue?.status === 'approved'
                    ? 'bg-green-100 text-green-800'
                    : issue?.status === 'sent'
                    ? 'bg-purple-100 text-purple-800'
                    : issue?.status === 'ready'
                    ? 'bg-green-100 text-green-800'
                    : issue?.status === 'failed'
                    ? 'bg-red-100 text-red-800'
                    : issue?.status === 'generating' || issue?.status === 'pending'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
                aria-label={`Issue status: ${issue?.status}`}
              >
                {issue?.status === 'generating' ? 'Generating' : issue?.status}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {(issue?.status === 'generating' || generating) && (
          <div className="mb-6 rounded-lg bg-yellow-50 border border-yellow-200 p-4" role="status" aria-live="polite">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-yellow-700" aria-hidden="true"></div>
              <div>
                <p className="text-sm font-medium text-yellow-900">Generating issue content</p>
                <p className="text-sm text-yellow-800">The backend is working on this. You can leave this page and come back.</p>
              </div>
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
        <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Issue Editor</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-label="Save draft"
              onClick={() => saveIssue()}
              disabled={saving || !editable}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50 text-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800"
            >
              {saving ? 'Saving...' : 'Save Draft'}
              {!saving && <Save className="h-4 w-4" aria-hidden="true" />}
            </button>
            <button
              type="button"
              aria-label="Version history"
              onClick={() => {
                setShowVersions((v) => !v);
                if (!showVersions) loadVersions();
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-gray-700"
            >
              <History className="h-4 w-4" aria-hidden="true" />
              Versions{versions.length ? ` (${versions.length})` : ''}
            </button>
            <button
              type="button"
              aria-label="Generate with AI"
              onClick={generateIssue}
              disabled={generating || issue?.status === 'generating' || !editable}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-500"
            >
              {(generating || issue?.status === 'generating') ? 'Generating...' : (issue?.status === 'ready' || issue?.status === 'failed' ? 'Regenerate with AI' : 'Generate with AI')}
              {!(generating || issue?.status === 'generating') && <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            </button>
            <button
              type="button"
              onClick={sendTestEmail}
              disabled={sendingTest || generating || issue?.status === 'generating'}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50 text-gray-700"
            >
              {sendingTest ? 'Sending…' : 'Send test email'}
              {!sendingTest && <Send className="h-4 w-4" aria-hidden="true" />}
            </button>
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="test@you.com (optional)"
              aria-label="Custom test email address"
              className="w-44 rounded-lg border border-gray-300 px-3 py-2 text-sm text-stone-900 bg-white placeholder:text-stone-400"
            />
            {issue?.status !== 'approved' && issue?.status !== 'sent' && (
              <button
                type="button"
                aria-label="Approve and schedule"
                onClick={approveIssue}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-green-500"
              >
                Approve & Schedule
              </button>
            )}
            {canReschedule && (
              <>
                <button
                  type="button"
                  aria-label="Update send time"
                  onClick={rescheduleIssue}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-gray-700"
                >
                  <CalendarClock className="h-4 w-4" aria-hidden="true" />
                  Update send time
                </button>
                <button
                  type="button"
                  aria-label="Cancel scheduled send"
                  onClick={cancelSend}
                  className="px-4 py-2 border border-red-200 text-red-700 rounded-lg hover:bg-red-50 flex items-center gap-2"
                >
                  <Ban className="h-4 w-4" aria-hidden="true" />
                  Cancel send
                </button>
              </>
            )}
          </div>
        </div>

        {showVersions && (
          <div className="mb-6 rounded-lg border border-gray-200 bg-white shadow p-5" role="region" aria-label="Version history">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-medium text-gray-900">Version history</h3>
              <button
                type="button"
                onClick={() => setShowVersions(false)}
                aria-label="Close version history"
                className="rounded p-1 text-gray-400 hover:text-gray-700"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {versions.length === 0 ? (
              <p className="text-sm text-gray-500">
                No saved versions yet. Every manual save and AI regeneration snapshots the previous draft here.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {versions.map((version) => (
                  <li key={version.version} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        v{version.version} · {version.subject || 'Untitled'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(version.created_at).toLocaleString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => restoreVersion(version.version)}
                      disabled={restoringVersion !== null || !editable}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {restoringVersion === version.version ? 'Restoring…' : 'Restore'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="bg-white rounded-lg shadow p-6 space-y-6">
            <div>
              <label htmlFor="send-at" className="block text-sm font-medium text-gray-700 mb-2">
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus-visible:ring-2 focus-visible:ring-stone-800 text-gray-900 bg-white"
              />
              <p className="mt-1 text-xs text-gray-500">
                Approve schedules a real send at this time. Approved issues can be rescheduled or canceled until they go out.
              </p>
            </div>

            <div>
              <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-2">
                Subject{' '}
                <span className={`ml-1 font-normal text-xs ${subjectLength > 60 ? 'text-amber-700' : 'text-gray-400'}`}>
                  {subjectLength}/60 {subjectLength > 60 ? '(long subjects get cut off in inboxes)' : ''}
                </span>
              </label>
              <input
                id="subject"
                type="text"
                value={content.subject}
                onChange={(e) => updateContent((c) => ({ ...c, subject: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus-visible:ring-2 focus-visible:ring-stone-800 text-gray-900 bg-white"
                placeholder="Enter issue subject"
                aria-label="Subject"
              />
            </div>

            <div>
              <label htmlFor="preheader" className="block text-sm font-medium text-gray-700 mb-2">
                Preheader
              </label>
              <textarea
                id="preheader"
                value={content.preheader}
                onChange={(e) => updateContent((c) => ({ ...c, preheader: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus-visible:ring-2 focus-visible:ring-stone-800 text-gray-900 bg-white"
                placeholder="Brief summary shown in email previews"
                aria-label="Preheader text"
              />
            </div>

            <div>
              <div className="mb-4 flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">
                  Content Blocks
                </label>
                <span className="text-xs text-gray-500 tabular-nums">
                  {totalWords} words · ~{readMinutes} min read
                </span>
              </div>
              <div className="space-y-4">
                {content.blocks.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                    <p className="text-gray-500 mb-3">No content blocks yet.</p>
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
                    <div key={block.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Block {idx + 1}</span>
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
            </div>
          </div>
          <div className="lg:sticky lg:top-6 lg:self-start">
            <EmailPreview
              subject={content.subject}
              preheader={content.preheader}
              blocks={content.blocks}
              visuals={content.visuals}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
