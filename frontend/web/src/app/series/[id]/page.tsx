"use client";

import { useEffect, useState, useRef, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Send, RefreshCw, Trash2, Pause, Play, Settings2, X } from 'lucide-react';
import { seriesApi, sourceApi, issueApi, modelsApi, OpenRouterModel } from '@/lib/api';
import { contentStructureFromIssue } from '@/lib/contentStructure';
import { ContentStructurePanel } from '@/components/issues/ContentStructurePanel';
import { Series, Issue, Source, RetrievedChunk } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { ModelSelect } from '@/components/ModelSelect';

type SeriesDetail = Series & {
  issues?: Issue[];
};

const SOURCE_BUSY = new Set([
  'pending',
  'ingesting',
  'fetching',
  'parsing',
  'chunking',
  'embedding',
  'indexing',
]);

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function isIssueBusy(status?: string) {
  return status === 'generating';
}

function isSourceBusy(status?: string) {
  return !!status && SOURCE_BUSY.has(status);
}

function progressLabel(status: string) {
  switch (status) {
    case 'generating':
      return 'Generating';
    case 'ingesting':
    case 'pending':
      return 'In progress';
    case 'fetching':
      return 'Fetching';
    case 'parsing':
      return 'Parsing';
    case 'chunking':
      return 'Chunking';
    case 'embedding':
      return 'Embedding';
    case 'indexing':
      return 'Indexing';
    case 'ready':
      return 'Ready';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

// Render a scheduled time in the series' own timezone so "09:00" means
// what the author intended regardless of where they travel.
function formatInZone(value?: string | null, timezone?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone || undefined,
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export default function SeriesViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const [series, setSeries] = useState<SeriesDetail | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'issues' | 'sources' | 'plan' | 'context'>('issues');
  const [showIssueDialog, setShowIssueDialog] = useState(false);
  const [showSourceDialog, setShowSourceDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [issueObjective, setIssueObjective] = useState('');
  const [issueScheduledAt, setIssueScheduledAt] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [savingIssue, setSavingIssue] = useState(false);
  const [savingSource, setSavingSource] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [formError, setFormError] = useState('');
  const [planStatus, setPlanStatus] = useState<string>('');
  const [plan, setPlan] = useState<Record<string, any> | null>(null);
  const [planError, setPlanError] = useState<string>('');
  const [startingPlan, setStartingPlan] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testNotice, setTestNotice] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [generationModel, setGenerationModel] = useState('');
  const [availableModels, setAvailableModels] = useState<OpenRouterModel[]>([]);
  const [defaultModel, setDefaultModel] = useState('poolside/laguna-s-2.1:free');
  const [retryingIssueId, setRetryingIssueId] = useState<string | null>(null);

  // Edit-settings dialog state
  const [editTopic, setEditTopic] = useState('');
  const [editGoal, setEditGoal] = useState('');
  const [editLevel, setEditLevel] = useState('');
  const [editTimezone, setTimezoneEdit] = useState('');
  const [editCadence, setEditCadence] = useState('weekly');
  const [editStartDate, setEditStartDate] = useState('');
  const [editSendTime, setEditSendTime] = useState('09:00');
  const [editSendDays, setEditSendDays] = useState<string[]>([]);

  // Retrieval context preview state
  const [contextQuery, setContextQuery] = useState('');
  const [contextChunks, setContextChunks] = useState<RetrievedChunk[]>([]);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState('');

  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (!showEditDialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowEditDialog(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showEditDialog]);

  useEffect(() => {
    if (id) {
      loadSeriesData();
    }
  }, [id]);

  useEffect(() => {
    if (series) {
      setEditTopic(series.topic || '');
      setEditGoal(series.goal || '');
      setEditLevel(series.level || '');
      setTimezoneEdit(series.timezone || 'UTC');
      setEditCadence(series.cadence || 'weekly');
      setEditStartDate(series.start_date || '');
      setEditSendTime(series.send_time || '09:00');
      setEditSendDays((series.send_days || '').split(',').map((d) => d.trim()).filter(Boolean));
    }
  }, [series]);

  useEffect(() => {
    if (user?.preferred_model) {
      setGenerationModel(user.preferred_model);
    }
  }, [user?.preferred_model]);

  useEffect(() => {
    modelsApi.list().then((res) => {
      setAvailableModels(res.models || []);
      if (res.default_model) {
        setDefaultModel(res.default_model);
      }
    }).catch(() => {
      setAvailableModels([]);
    });
  }, []);

  const loadSeriesData = async () => {
    setLoading(true);
    setError(null);
    try {
      const seriesRes = await seriesApi.get(id);
      setSeries(seriesRes.data);

      try {
        const issuesRes = await seriesApi.getIssues(id);
        setIssues(issuesRes.data ?? []);
      } catch (err) {
        console.error('Failed to load issues:', err);
        setIssues([]);
      }

      try {
        const sourcesRes = await seriesApi.getSources(id);
        setSources(sourcesRes.data ?? []);
      } catch (err) {
        console.error('Failed to load sources:', err);
        setSources([]);
      }

      try {
        await refreshPlan();
      } catch (err) {
        console.error('Failed to load plan:', err);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load series data');
    } finally {
      setLoading(false);
    }
  };

  const refreshPlan = async () => {
    const planRes = await seriesApi.getPlan(id);
    setPlanStatus(planRes.status || '');
    setPlan(planRes.plan || null);
    setPlanError(planRes.error || '');
    return planRes.status;
  };

  useEffect(() => {
    const moduleCount = Array.isArray((plan as { modules?: unknown[] } | null)?.modules)
      ? ((plan as { modules: unknown[] }).modules.length)
      : 0;
    const waitingForIssues = planStatus === 'ready' && issues.length === 0 && moduleCount > 0;
    if (!id || (planStatus !== 'generating' && !waitingForIssues)) {
      return;
    }
    const timer = setInterval(async () => {
      try {
        await refreshPlan();
        const issuesRes = await seriesApi.getIssues(id);
        setIssues(issuesRes.data ?? []);
      } catch (err) {
        console.error('Failed to refresh plan status:', err);
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [id, planStatus, issues.length, plan]);

  const issuesBusy = issues.some((issue) => isIssueBusy(issue.status));
  const sourcesBusy = sources.some((source) => isSourceBusy(source.status));

  useEffect(() => {
    if (!id || (!issuesBusy && !sourcesBusy)) {
      return;
    }
    const timer = setInterval(async () => {
      try {
        if (issuesBusy) {
          const issuesRes = await seriesApi.getIssues(id);
          setIssues(issuesRes.data ?? []);
        }
        if (sourcesBusy) {
          const sourcesRes = await seriesApi.getSources(id);
          setSources(sourcesRes.data ?? []);
        }
      } catch (err) {
        console.error('Failed to refresh progress:', err);
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [id, issuesBusy, sourcesBusy]);

  const handleGeneratePlan = async () => {
    setStartingPlan(true);
    setPlanError('');
    try {
      await seriesApi.generatePlan(id, generationModel || user?.preferred_model);
      setPlanStatus('generating');
      setActiveTab('plan');
    } catch (err: any) {
      setPlanError(err.message || 'Failed to start plan generation');
    } finally {
      setStartingPlan(false);
    }
  };

  const handleDeleteSeries = async () => {
    if (!window.confirm(`Delete “${series?.topic}”? This cannot be undone.`)) {
      return;
    }
    setDeleting(true);
    try {
      await seriesApi.delete(id);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to delete series');
      setDeleting(false);
    }
  };

  const handleSendTest = async (moduleIndex?: number) => {
    setSendingTest(true);
    setTestNotice('');
    setError(null);
    try {
      const result = await seriesApi.testSend(
        id,
        moduleIndex === undefined
          ? testEmail.trim() ? { email: testEmail.trim() } : {}
          : { module_index: moduleIndex },
      );
      const email = (result as { email?: string }).email || user?.email || 'your inbox';
      setTestNotice(`Test email sent to ${email}.`);
    } catch (err: any) {
      setError(err.message || 'Failed to send test email');
    } finally {
      setSendingTest(false);
    }
  };

  const handlePauseResume = async () => {
    if (!series) return;
    setError(null);
    try {
      if (series.status === 'active') {
        await seriesApi.pause(id);
        setSeries({ ...series, status: 'paused' });
      } else {
        await seriesApi.resume(id);
        setSeries({ ...series, status: 'active' });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to change series status');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setFormError('');
    try {
      const response = await seriesApi.update(id, {
        topic: editTopic.trim(),
        goal: editGoal.trim(),
        level: editLevel,
        timezone: editTimezone,
        cadence: editCadence,
        start_date: editStartDate,
        send_time: editSendTime,
        send_days: editSendDays,
      });
      if (response.data) {
        setSeries(response.data);
      }
      setShowEditDialog(false);
    } catch (err: any) {
      setFormError(err.message || 'Failed to update series');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleContextPreview = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const query = contextQuery.trim();
    if (!query) {
      setContextError('Type a question or objective to preview retrieval.');
      return;
    }
    setContextLoading(true);
    setContextError('');
    try {
      const response = await seriesApi.retrievalPreview(id, query, 8);
      setContextChunks(response.results ?? []);
      if ((response.results ?? []).length === 0) {
        setContextError('No indexed content matched this query. Add or reindex sources.');
      }
    } catch (err: any) {
      setContextError(err.message || 'Retrieval preview failed');
      setContextChunks([]);
    } finally {
      setContextLoading(false);
    }
  };

  // The next scheduled send across all issues of this series.
  const nextIssue = issues
    .filter((issue) => issue.scheduled_at && !['sent', 'failed'].includes(issue.status))
    .sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime())[0];

  const nextSendLabel = nextIssue
    ? formatInZone(nextIssue.scheduled_at, series?.timezone)
    : '';

  const handleTabChange = (tab: 'issues' | 'sources' | 'plan' | 'context') => {
    setActiveTab(tab);
    tabRefs.current[tab]?.focus();
  };

  const handleCreateIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    const objective = issueObjective.trim();
    if (!objective) {
      setFormError('Objective is required');
      return;
    }
    setSavingIssue(true);
    setFormError('');
    try {
      await seriesApi.createIssue(id, {
        objective,
        scheduled_at: issueScheduledAt || undefined,
        model: generationModel || user?.preferred_model,
      });
      setShowIssueDialog(false);
      setIssueObjective('');
      setIssueScheduledAt('');
      setActiveTab('issues');
      const issuesRes = await seriesApi.getIssues(id);
      setIssues(issuesRes.data ?? []);
    } catch (err: any) {
      setFormError(err.message || 'Failed to add issue');
    } finally {
      setSavingIssue(false);
    }
  };

  const chosenIssueModel = generationModel || user?.preferred_model || '';
  const usingFreeModel = (chosenIssueModel || defaultModel).toLowerCase().includes(':free');

  const handleRetryIssue = async (issueId: string) => {
    setRetryingIssueId(issueId);
    setError(null);
    try {
      await issueApi.generate(issueId, chosenIssueModel ? { model: chosenIssueModel } : {});
      const issuesRes = await seriesApi.getIssues(id);
      setIssues(issuesRes.data ?? []);
    } catch (err: any) {
      setError(err.message || 'Failed to generate issue');
    } finally {
      setRetryingIssueId(null);
    }
  };

  const handleRetryFailedIssues = async () => {
    const failed = issues.filter((issue) => issue.status === 'failed');
    for (const issue of failed) {
      await handleRetryIssue(issue.id);
    }
  };

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceUrl.trim() && !sourceFile) {
      setFormError('Enter a URL or choose a file');
      return;
    }
    setSavingSource(true);
    setFormError('');
    try {
      if (sourceFile) {
        await sourceApi.upload(sourceFile, 'series', id);
      } else {
        await sourceApi.submitUrl(sourceUrl.trim(), 'url', 'series', id);
      }
      setShowSourceDialog(false);
      setSourceUrl('');
      setSourceFile(null);
      setActiveTab('sources');
      const sourcesRes = await seriesApi.getSources(id);
      setSources(sourcesRes.data ?? []);
    } catch (err: any) {
      setFormError(err.message || 'Failed to add source');
    } finally {
      setSavingSource(false);
    }
  };

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

  if (error) {
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

  const tabs = [
    { id: 'issues', label: 'Issues', busy: issuesBusy },
    { id: 'sources', label: 'Sources', busy: sourcesBusy },
    { id: 'plan', label: 'Curriculum Plan', busy: planStatus === 'generating' },
    { id: 'context', label: 'Context Preview', busy: false },
  ] as const;

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <Link
                href="/dashboard"
                aria-label="Back to Dashboard"
                className="relative z-10 shrink-0 rounded p-1 text-gray-600 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </Link>
              <h1 className="min-w-0 flex-1 truncate text-2xl font-bold text-gray-900">{series?.topic}</h1>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {nextIssue && (
                <span
                  className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800"
                  title={`Next issue #${nextIssue.sequence_no} sends ${formatInZone(nextIssue.scheduled_at, series?.timezone)} (${series?.timezone})`}
                >
                  Next send: {nextSendLabel}
                </span>
              )}
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  series?.status === 'active'
                    ? 'bg-green-100 text-green-800'
                    : series?.status === 'paused'
                    ? 'bg-yellow-100 text-yellow-800'
                    : series?.status === 'planned'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
                aria-label={`Status: ${series?.status}`}
              >
                {series?.status}
              </span>
              {(series?.status === 'active' || series?.status === 'paused') && (
                <button
                  type="button"
                  onClick={handlePauseResume}
                  aria-label={series?.status === 'active' ? 'Pause series' : 'Resume series'}
                  title={series?.status === 'active' ? 'Pause scheduled sends' : 'Resume scheduled sends'}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-stone-900"
                >
                  {series?.status === 'active'
                    ? <Pause className="h-4 w-4" aria-hidden="true" />
                    : <Play className="h-4 w-4" aria-hidden="true" />}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setFormError('');
                  setShowEditDialog(true);
                }}
                aria-label="Edit series settings"
                title="Edit topic, cadence, and schedule"
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-stone-900"
              >
                <Settings2 className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => handleSendTest()}
                disabled={sendingTest}
                className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {sendingTest ? 'Sending…' : 'Send test email'}
              </button>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="test@you.com (optional)"
                aria-label="Custom test email address"
                className="hidden lg:block w-44 rounded-lg border border-gray-300 px-3 py-2 text-sm text-stone-900 bg-white placeholder:text-stone-400"
              />
              <button
                type="button"
                aria-label="Delete series"
                onClick={handleDeleteSeries}
                disabled={deleting}
                className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {testNotice && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800" role="status">
            {testNotice}
          </div>
        )}
        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav aria-label="Series sections">
            <div
              role="tablist"
              aria-label="Series sections"
              className="-mb-px flex space-x-8"
            >
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                   ref={(el) => { tabRefs.current[tab.id] = el; }}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`${tab.id}-panel`}
                  id={`tab-${tab.id}`}
                  tabIndex={activeTab === tab.id ? 0 : -1}
                  onClick={() => handleTabChange(tab.id)}
                  className={`py-2 px-1 border-b-2 font-medium text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800 ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-stone-800'
                      : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                  {tab.busy && (
                    <span className="ml-2 text-xs font-medium text-yellow-700">In progress</span>
                  )}
                </button>
              ))}
            </div>
          </nav>
        </div>

        {activeTab === 'issues' && (
          <div
            id="issues-panel"
            role="tabpanel"
            aria-labelledby="tab-issues"
            tabIndex={0}
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Issues</h2>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="issue-generation-model" className="text-sm text-gray-600">
                  Model
                </label>
                <ModelSelect
                  id="issue-generation-model"
                  value={generationModel === defaultModel ? '' : generationModel}
                  onChange={setGenerationModel}
                  models={availableModels}
                  defaultModel={defaultModel}
                  className="w-64 max-w-full"
                />
                {issues.some((issue) => issue.status === 'failed') && (
                  <button
                    type="button"
                    onClick={handleRetryFailedIssues}
                    disabled={retryingIssueId !== null}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Retry failed
                  </button>
                )}
                <button
                type="button"
                aria-label="Add Issue"
                onClick={() => {
                  setFormError('');
                  setShowIssueDialog(true);
                }}
                className="bg-stone-900 text-white px-4 py-2 rounded-lg hover:bg-stone-800 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-stone-800"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add Issue
              </button>
              </div>
            </div>
            <p className="mb-4 text-xs text-gray-500">
              {usingFreeModel
                ? 'Free/default models are limited to 20 OpenRouter requests per minute, so emails generate one at a time with a short wait.'
                : 'This model is not on the free tier, so emails generate as quickly as possible.'}
            </p>

            {issuesBusy && (
              <div className="mb-4 rounded-lg bg-yellow-50 border border-yellow-200 p-4" role="status" aria-live="polite">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-yellow-700" aria-hidden="true"></div>
                  <div>
                    <p className="text-sm font-medium text-yellow-900">Generating issue content</p>
                    <p className="text-sm text-yellow-800">The backend is working on this. You can leave this page and come back.</p>
                  </div>
                </div>
              </div>
            )}

            {issues.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-600">No issues yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {issues.map((issue) => (
                  <div key={issue.id} className="bg-white rounded-lg shadow p-4">
                    <div className="flex items-center justify-between gap-4">
                      <button
                        type="button"
                        onClick={() => router.push(`/issues/${issue.id}`)}
                        className="min-w-0 flex-1 text-left hover:opacity-80"
                      >
                        <h3 className="font-medium text-gray-900">#{issue.sequence_no} {issue.objective || ''}</h3>
                        <p className="text-sm text-gray-600">
                          Scheduled: {issue.scheduled_at
                            ? `${formatInZone(issue.scheduled_at, series?.timezone)} (${series?.timezone || 'UTC'})`
                            : 'Not scheduled'}
                        </p>
                        {issue.content_json ? (
                          <div className="mt-2">
                            <ContentStructurePanel
                              compact
                              content={contentStructureFromIssue(issue.content_json)}
                            />
                          </div>
                        ) : null}
                        {issue.status === 'failed' && issue.generate_error && (
                          <p className="mt-1 text-sm text-red-600">{issue.generate_error}</p>
                        )}
                      </button>
                      <div className="flex items-center gap-2">
                        {issue.status === 'failed' && (
                          <button
                            type="button"
                            disabled={retryingIssueId !== null}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleRetryIssue(issue.id);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            <RefreshCw className="h-3 w-3" />
                            {retryingIssueId === issue.id ? 'Starting...' : 'Generate'}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={sendingTest || issue.status === 'generating' || issue.status === 'failed'}
                          onClick={async (event) => {
                            event.stopPropagation();
                            setSendingTest(true);
                            setTestNotice('');
                            try {
                              const result = await issueApi.testSend(issue.id);
                              const email = (result as { email?: string }).email || user?.email || 'your inbox';
                              setTestNotice(`Test email sent to ${email}.`);
                            } catch (err: any) {
                              setError(err.message || 'Failed to send test email');
                            } finally {
                              setSendingTest(false);
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          <Send className="h-3 w-3" />
                          Test
                        </button>
                        <span
                        className={`inline-flex items-center gap-2 px-2 py-1 text-xs rounded-full ${
                          issue.status === 'approved'
                            ? 'bg-green-100 text-green-800'
                            : issue.status === 'sent'
                            ? 'bg-purple-100 text-purple-800'
                            : issue.status === 'ready'
                            ? 'bg-green-100 text-green-800'
                            : issue.status === 'failed'
                            ? 'bg-red-100 text-red-800'
                            : isIssueBusy(issue.status)
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                        aria-label={`Issue status: ${issue.status}`}
                      >
                        {isIssueBusy(issue.status) && (
                          <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-yellow-800" aria-hidden="true"></span>
                        )}
                        {progressLabel(issue.status)}
                      </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'sources' && (
          <div
            id="sources-panel"
            role="tabpanel"
            aria-labelledby="tab-sources"
            tabIndex={0}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Sources</h2>
              <button
                type="button"
                aria-label="Add Source"
                onClick={() => {
                  setFormError('');
                  setShowSourceDialog(true);
                }}
                className="bg-stone-900 text-white px-4 py-2 rounded-lg hover:bg-stone-800 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-stone-800"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add Source
              </button>
            </div>

            {sourcesBusy && (
              <div className="mb-4 rounded-lg bg-yellow-50 border border-yellow-200 p-4" role="status" aria-live="polite">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-yellow-700" aria-hidden="true"></div>
                  <div>
                    <p className="text-sm font-medium text-yellow-900">Ingesting sources</p>
                    <p className="text-sm text-yellow-800">The backend is working on this. You can leave this page and come back.</p>
                  </div>
                </div>
              </div>
            )}

            {sources.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-600">No sources added yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {sources.map((source) => (
                  <div key={source.id} className="bg-white rounded-lg shadow p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="truncate font-medium text-gray-900">{source.url || 'File source'}</h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 capitalize">{source.type}</span>
                          {source.scope === 'series' ? (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">This series only</span>
                          ) : (
                            <span className="rounded-full bg-purple-50 px-2 py-0.5 text-purple-700">Whole workspace</span>
                          )}
                          {!isSourceBusy(source.status) && source.status !== 'failed' && (
                            <span>
                              {(source.chunk_count ?? 0) > 0
                                ? `${source.chunk_count} indexed chunks`
                                : source.duplicate_of
                                ? 'Duplicate content'
                                : ''}
                            </span>
                          )}
                        </div>
                        {source.status === 'failed' && source.ingest_error && (
                          <p className="mt-1 text-sm text-red-600">{source.ingest_error}</p>
                        )}
                        {source.duplicate_of && (
                          <p className="mt-1 text-xs text-amber-700">
                            Identical content was already ingested — this entry shares the same index and costs nothing extra.
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm(
                              `Remove “${source.url || 'this file'}”? Future issue generation will no longer use it as context (already generated issues keep their citations).`,
                            )) return;
                            try {
                              await sourceApi.delete(source.id);
                              const sourcesRes = await seriesApi.getSources(id);
                              setSources(sourcesRes.data ?? []);
                            } catch (err: any) {
                              setError(err.message || 'Failed to delete source');
                            }
                          }}
                          aria-label={`Delete source ${source.url || ''}`}
                          className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <span
                          className={`inline-flex items-center gap-2 px-2 py-1 text-xs rounded-full ${
                            source.status === 'ready'
                              ? 'bg-green-100 text-green-800'
                              : source.status === 'failed'
                              ? 'bg-red-100 text-red-800'
                              : isSourceBusy(source.status)
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                          aria-label={`Source status: ${source.status}`}
                        >
                          {isSourceBusy(source.status) && (
                            <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-yellow-800" aria-hidden="true"></span>
                          )}
                          {progressLabel(source.status)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'plan' && (
          <div
            id="plan-panel"
            role="tabpanel"
            aria-labelledby="tab-plan"
            tabIndex={0}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Curriculum Plan</h2>
              {planStatus === 'generating' && (
                <span className="px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                  In progress
                </span>
              )}
              {planStatus === 'ready' && (
                <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                  Ready
                </span>
              )}
              {planStatus === 'failed' && (
                <span className="px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
                  Failed
                </span>
              )}
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              {(planStatus === 'generating' || startingPlan) && (
                <div className="text-center py-8" role="status" aria-live="polite">
                  <div
                    className="animate-spin rounded-full h-8 w-8 border-b-2 border-stone-900 mx-auto"
                    aria-label="Generating plan"
                  ></div>
                  <p className="mt-4 text-gray-900 font-medium">Generating curriculum plan</p>
                  <p className="mt-1 text-sm text-gray-600">
                    The backend is working on this. You can leave this page and come back.
                  </p>
                  <button
                    type="button"
                    onClick={handleGeneratePlan}
                    disabled={startingPlan}
                    className="mt-6 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Retry generation
                  </button>
                </div>
              )}

              {planStatus === 'failed' && (
                <div className="mb-4" role="alert">
                  <p className="text-red-600">{planError || 'Plan generation failed.'}</p>
                </div>
              )}

              {planStatus === 'ready' && plan && (
                <div className="space-y-4 mb-6">
                  {Array.isArray(plan.modules) && plan.modules.length > 0 ? (
                    plan.modules.map((module: any, index: number) => (
                      <div key={index} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-medium text-gray-900">
                              {module.title || `Module ${index + 1}`}
                            </h3>
                            {module.summary && (
                              <p className="mt-1 text-sm text-gray-700">{module.summary}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            disabled={sendingTest}
                            onClick={() => handleSendTest(index)}
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            <Send className="h-3 w-3" />
                            Test email
                          </button>
                        </div>
                        {Array.isArray(module.learning_objectives) && (
                          <ul className="mt-2 list-disc list-inside text-sm text-gray-600">
                            {module.learning_objectives.map((objective: string, i: number) => (
                              <li key={i}>{objective}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))
                  ) : (
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap">
                      {JSON.stringify(plan, null, 2)}
                    </pre>
                  )}
                </div>
              )}

              {planStatus !== 'generating' && !startingPlan && (
                <>
                  {!plan && planStatus !== 'failed' && (
                    <p className="text-gray-600 mb-4">
                      The plan is created automatically when you start a series. Use regenerate if you want a new syllabus.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleGeneratePlan}
                    disabled={startingPlan}
                    className="bg-stone-900 text-white px-4 py-2 rounded-lg hover:bg-stone-800 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-stone-800"
                  >
                    {planStatus === 'ready' || planStatus === 'failed' ? 'Regenerate Plan' : 'Generate Plan'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'context' && (
          <div
            id="context-panel"
            role="tabpanel"
            aria-labelledby="tab-context"
            tabIndex={0}
          >
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="font-display text-xl text-stone-900">Preview source context</h2>
              <p className="mt-1 mb-5 text-sm text-gray-600">
                Ask a question like the objective of your next issue. You'll see exactly which source
                chunks generation would retrieve as context.
              </p>
              <form onSubmit={handleContextPreview} className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={contextQuery}
                  onChange={(e) => setContextQuery(e.target.value)}
                  placeholder="e.g. How does continuous batching work?"
                  aria-label="Retrieval test query"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-stone-900 bg-white focus-visible:ring-2 focus-visible:ring-stone-800 focus-visible:border-transparent"
                />
                <button
                  type="submit"
                  disabled={contextLoading}
                  className="inline-flex items-center justify-center rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
                >
                  {contextLoading ? 'Searching…' : 'Preview retrieval'}
                </button>
              </form>

              {contextError && (
                <p role="alert" className="mt-4 text-sm text-red-600">{contextError}</p>
              )}

              {contextChunks.length > 0 && (
                <ul className="mt-6 space-y-3">
                  {contextChunks.map((chunk, index) => (
                    <li key={`${chunk.source_id}-${index}`} className="rounded-xl border border-[#e7e0d6] bg-[#faf8f5] p-4">
                      <div className="mb-1 flex items-center justify-between gap-3 text-xs text-stone-500">
                        <span className="truncate">{(chunk.heading_path || []).join(' › ') || 'Chunk'}</span>
                        <span className="shrink-0 tabular-nums">score {Number(chunk.score).toFixed(3)}</span>
                      </div>
                      <p className="text-sm leading-relaxed text-stone-800">{chunk.preview}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {showEditDialog && (
        <div
          className="fixed inset-y-0 right-0 left-0 top-[52px] z-50 flex sm:top-0 sm:left-[var(--sidebar-width,16rem)]"
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close series settings"
            onClick={() => setShowEditDialog(false)}
          />
          <form
            onSubmit={handleSaveSettings}
            className="relative ml-auto flex h-full w-full max-w-lg flex-col border-l border-stone-200 bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-series-title"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-stone-200 px-5 py-4">
              <h3 id="edit-series-title" className="text-lg font-semibold text-stone-900">
                Series settings
              </h3>
              <button
                type="button"
                onClick={() => setShowEditDialog(false)}
                aria-label="Close"
                className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {formError && <p className="mb-3 text-sm text-red-600">{formError}</p>}

              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="edit-topic">Topic</label>
              <input
                id="edit-topic" type="text" value={editTopic}
                onChange={(e) => setEditTopic(e.target.value)} required
                className="w-full mb-4 px-3 py-2 border border-gray-300 rounded-lg text-stone-900 bg-white"
              />

              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="edit-goal">Goal</label>
              <textarea
                id="edit-goal" value={editGoal} rows={3}
                onChange={(e) => setEditGoal(e.target.value)} required
                className="w-full mb-4 px-3 py-2 border border-gray-300 rounded-lg text-stone-900 bg-white"
              />

              <div className="grid grid-cols-1 gap-3 mb-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="edit-level">Level</label>
                  <select
                    id="edit-level" value={editLevel}
                    onChange={(e) => setEditLevel(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-stone-900 bg-white"
                  >
                    <option value="">Unspecified</option>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="edit-cadence">Cadence</label>
                  <select
                    id="edit-cadence" value={editCadence}
                    onChange={(e) => setEditCadence(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-stone-900 bg-white"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 mb-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="edit-start-date">Start date</label>
                  <input
                    id="edit-start-date" type="date" value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-stone-900 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="edit-send-time">Send time</label>
                  <input
                    id="edit-send-time" type="time" value={editSendTime}
                    onChange={(e) => setEditSendTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-stone-900 bg-white"
                  />
                </div>
              </div>

              <fieldset className="mb-4">
                <legend className="block text-sm font-medium text-gray-700 mb-2">Send days (weekly cadence)</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {WEEKDAYS.map((day) => (
                    <label key={day} className="flex items-center gap-1.5 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={editSendDays.includes(day)}
                        onChange={(e) =>
                          setEditSendDays((current) =>
                            e.target.checked ? [...current, day] : current.filter((d) => d !== day),
                          )
                        }
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      {day.slice(0, 3)}
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="edit-timezone">Timezone</label>
              <select
                id="edit-timezone" value={editTimezone}
                onChange={(e) => setTimezoneEdit(e.target.value)}
                className="w-full mb-4 px-3 py-2 border border-gray-300 rounded-lg text-stone-900 bg-white"
              >
                {['UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Karachi', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney'].map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>

              <p className="text-xs text-gray-500">
                Changes apply to future scheduling; already-scheduled sends keep their times unless you reschedule them.
              </p>
            </div>

            <div className="flex shrink-0 justify-end gap-3 border-t border-stone-200 px-5 py-4">
              <button
                type="button"
                onClick={() => setShowEditDialog(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingSettings}
                className="px-4 py-2 bg-stone-900 text-white rounded-lg disabled:opacity-50"
              >
                {savingSettings ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showIssueDialog && (
        <div className="fixed inset-y-0 right-0 left-0 top-[52px] z-50 flex items-center justify-center p-4 sm:top-0 sm:left-[var(--sidebar-width,16rem)]">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close add issue dialog"
            onClick={() => setShowIssueDialog(false)}
          />
          <form
            onSubmit={handleCreateIssue}
            className="relative w-full max-w-md rounded-lg bg-white p-8 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-issue-title"
          >
            <h3 id="add-issue-title" className="text-lg font-semibold mb-4">Add Issue</h3>
            {formError && <p className="mb-3 text-sm text-red-600">{formError}</p>}
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="issue-objective">
              Objective
            </label>
            <input
              id="issue-objective"
              type="text"
              value={issueObjective}
              onChange={(e) => setIssueObjective(e.target.value)}
              className="w-full mb-4 px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="What should this issue cover?"
              required
            />
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="issue-date">
              Send at
            </label>
            <input
              id="issue-date"
              type="datetime-local"
              value={issueScheduledAt}
              onChange={(e) => setIssueScheduledAt(e.target.value)}
              className="w-full mb-6 px-3 py-2 border border-gray-300 rounded-lg"
            />
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowIssueDialog(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingIssue}
                className="px-4 py-2 bg-stone-900 text-white rounded-lg disabled:opacity-50"
              >
                {savingIssue ? 'Adding...' : 'Add Issue'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showSourceDialog && (
        <div className="fixed inset-y-0 right-0 left-0 top-[52px] z-50 flex items-center justify-center p-4 sm:top-0 sm:left-[var(--sidebar-width,16rem)]">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close add source dialog"
            onClick={() => setShowSourceDialog(false)}
          />
          <form
            onSubmit={handleAddSource}
            className="relative w-full max-w-md rounded-lg bg-white p-8 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-source-title"
          >
            <h3 id="add-source-title" className="text-lg font-semibold mb-4">Add Source</h3>
            {formError && <p className="mb-3 text-sm text-red-600">{formError}</p>}
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="source-url">
              URL
            </label>
            <input
              id="source-url"
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              className="w-full mb-4 px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="https://example.com/article"
              disabled={!!sourceFile}
            />
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="source-file">
              Or upload a file
            </label>
            <input
              id="source-file"
              type="file"
              onChange={(e) => setSourceFile(e.target.files?.[0] ?? null)}
              className="w-full mb-6 text-sm"
            />
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowSourceDialog(false);
                  setSourceFile(null);
                  setSourceUrl('');
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingSource}
                className="px-4 py-2 bg-stone-900 text-white rounded-lg disabled:opacity-50"
              >
                {savingSource ? 'Adding...' : 'Add Source'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
