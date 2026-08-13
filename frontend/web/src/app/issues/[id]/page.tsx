"use client";

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Send, RefreshCw } from 'lucide-react';
import { issueApi, seriesApi } from '@/lib/api';
import { Issue, ContentBlock } from '@/types';
import { useAuth } from '@/contexts/AuthContext';

function parseIssueContent(issue: Issue): {
  subject: string;
  preheader: string;
  blocks: Array<{ id: string; type: string; title?: string; text: string }>;
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
      }))
    : [];

  return {
    subject: parsed?.subject || issue.objective || '',
    preheader: parsed?.preheader || '',
    blocks,
  };
}

export default function IssueEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [content, setContent] = useState({
    subject: '',
    preheader: '',
    blocks: [] as Array<{ id: string; type: string; title?: string; text: string }>
  });

  useEffect(() => {
    if (id) {
      loadIssue();
    }
  }, [id]);

  const loadIssue = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const response = await issueApi.get(id);
      const issueData = response.data;
      setIssue(issueData);
      setContent(parseIssueContent(issueData));
    } catch (err: any) {
      setError(err.message || 'Failed to load issue');
    } finally {
      setLoading(false);
    }
  };

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
        }
      } catch (err) {
        console.error('Failed to refresh issue status:', err);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [id, issue?.status]);

  const generateIssue = async () => {
    if (!id) return;
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

  const saveIssue = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await issueApi.update(id, {
        subject: content.subject,
        preheader: content.preheader,
        content_blocks: content.blocks,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to save issue');
    } finally {
      setSaving(false);
    }
  };

  const approveIssue = async () => {
    if (!id) return;
    try {
      await issueApi.approve(id);
      if (issue) {
        router.push(`/series/${issue.series_id}`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to approve issue');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p role="alert" aria-live="assertive" className="text-red-600">
            {error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                type="button"
                aria-label="Back to series"
                onClick={() => issue && router.push(`/series/${issue.series_id}`)}
                className="text-gray-600 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 rounded"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <h1 className="text-2xl font-bold text-gray-900">
                #{issue?.sequence_no} {content.subject || 'Untitled'}
              </h1>
            </div>
            <div className="flex items-center space-x-4">
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

      <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Issue Editor</h2>
          <div className="flex space-x-2">
            <button
              type="button"
              aria-label="Save draft"
              onClick={saveIssue}
              disabled={saving}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50 text-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              {saving ? 'Saving...' : 'Save Draft'}
              {!saving && <Save className="h-4 w-4" aria-hidden="true" />}
            </button>
            <button
              type="button"
              aria-label="Generate with AI"
              onClick={generateIssue}
              disabled={generating || issue?.status === 'generating'}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-500"
            >
              {(generating || issue?.status === 'generating') ? 'Generating...' : (issue?.status === 'ready' || issue?.status === 'failed' ? 'Regenerate with AI' : 'Generate with AI')}
              {!(generating || issue?.status === 'generating') && <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            </button>
            {issue?.status !== 'approved' && issue?.status !== 'sent' && (
              <button
                type="button"
                aria-label="Approve and schedule"
                onClick={approveIssue}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-green-500"
              >
                Approve & Schedule
                <Send className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <div>
            <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-2">
              Subject
            </label>
            <input
              id="subject"
              type="text"
              value={content.subject}
              onChange={(e) => setContent({ ...content, subject: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus-visible:ring-2 focus-visible:ring-blue-500 text-gray-900 bg-white"
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
              onChange={(e) => setContent({ ...content, preheader: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus-visible:ring-2 focus-visible:ring-blue-500 text-gray-900 bg-white"
              placeholder="Brief summary shown in email previews"
              aria-label="Preheader text"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-4">
              Content Blocks
            </label>
            <div className="space-y-4">
              {content.blocks.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                  <p className="text-gray-500">No content blocks yet. Generate content with AI.</p>
                </div>
              ) : (
                content.blocks.map((block, idx) => (
                  <div key={block.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">{block.type}</span>
                    </div>
                    {block.title && (
                      <input
                        type="text"
                        value={block.title}
                        onChange={(e) => {
                          const newBlocks = [...content.blocks];
                          newBlocks[idx].title = e.target.value;
                          setContent({ ...content, blocks: newBlocks });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2 text-gray-900 bg-white focus-visible:ring-2 focus-visible:ring-blue-500"
                        placeholder="Block title"
                        aria-label={`Block ${idx + 1} title`}
                      />
                    )}
                    <textarea
                      value={block.text}
                      onChange={(e) => {
                        const newBlocks = [...content.blocks];
                        newBlocks[idx].text = e.target.value;
                        setContent({ ...content, blocks: newBlocks });
                      }}
                      rows={5}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 bg-white focus-visible:ring-2 focus-visible:ring-blue-500"
                      placeholder="Block content..."
                      aria-label={`Block ${idx + 1} content`}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
