"use client";

import { useEffect, useState, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Send, RefreshCw, Trash2 } from 'lucide-react';
import { seriesApi, sourceApi, issueApi } from '@/lib/api';
import { Series, Issue, Source } from '@/types';
import { useAuth } from '@/contexts/AuthContext';

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

export default function SeriesViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const [series, setSeries] = useState<SeriesDetail | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'issues' | 'sources' | 'plan'>('issues');
  const [showIssueDialog, setShowIssueDialog] = useState(false);
  const [showSourceDialog, setShowSourceDialog] = useState(false);
  const [issueObjective, setIssueObjective] = useState('');
  const [issueScheduledAt, setIssueScheduledAt] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [savingIssue, setSavingIssue] = useState(false);
  const [savingSource, setSavingSource] = useState(false);
  const [formError, setFormError] = useState('');
  const [planStatus, setPlanStatus] = useState<string>('');
  const [plan, setPlan] = useState<Record<string, any> | null>(null);
  const [planError, setPlanError] = useState<string>('');
  const [startingPlan, setStartingPlan] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testNotice, setTestNotice] = useState('');

  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (id) {
      loadSeriesData();
    }
  }, [id]);

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
      await seriesApi.generatePlan(id, user?.preferred_model);
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
        moduleIndex === undefined ? {} : { module_index: moduleIndex },
      );
      const email = (result as { email?: string }).email || user?.email || 'your inbox';
      setTestNotice(`Test email sent to ${email}.`);
    } catch (err: any) {
      setError(err.message || 'Failed to send test email');
    } finally {
      setSendingTest(false);
    }
  };

  const handleTabChange = (tab: 'issues' | 'sources' | 'plan') => {
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
        model: user?.preferred_model,
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
  ] as const;

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                type="button"
                aria-label="Back to Dashboard"
                onClick={() => router.push('/dashboard')}
                className="text-gray-600 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800 rounded"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <h1 className="text-2xl font-bold text-gray-900">{series?.topic}</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  series?.status === 'active'
                    ? 'bg-green-100 text-green-800'
                    : series?.status === 'planned'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
                aria-label={`Status: ${series?.status}`}
              >
                {series?.status}
              </span>
              <button
                type="button"
                onClick={() => handleSendTest()}
                disabled={sendingTest}
                className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {sendingTest ? 'Sending…' : 'Send test email'}
              </button>
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
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Issues</h2>
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
                          Scheduled: {issue.scheduled_at ? new Date(issue.scheduled_at).toLocaleString() : 'Not scheduled'}
                        </p>
                        {issue.status === 'failed' && issue.generate_error && (
                          <p className="mt-1 text-sm text-red-600">{issue.generate_error}</p>
                        )}
                      </button>
                      <div className="flex items-center gap-2">
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
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-gray-900">{source.url || 'File source'}</h3>
                        <p className="text-sm text-gray-600">{source.type}</p>
                        {source.status === 'failed' && source.ingest_error && (
                          <p className="mt-1 text-sm text-red-600">{source.ingest_error}</p>
                        )}
                      </div>
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
      </div>

      {showIssueDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <form
            onSubmit={handleCreateIssue}
            className="bg-white rounded-lg p-8 w-full max-w-md"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <form
            onSubmit={handleAddSource}
            className="bg-white rounded-lg p-8 w-full max-w-md"
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
