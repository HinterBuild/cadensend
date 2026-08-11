"use client";

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Save, Send, RefreshCw } from 'lucide-react';
import { issueApi, seriesApi } from '@/lib/api';
import { Issue, IssueContent } from '@/types';

export default function IssueEditorPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const [issue, setIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [content, setContent] = useState({
    subject: '',
    preheader: '',
    blocks: [] as Array<{ id: string; type: string; title?: string; text: string }>,
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
      setContent({
        subject: '',
        preheader: '',
        blocks: [],
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load issue');
    } finally {
      setLoading(false);
    }
  };

  const generateIssue = async () => {
    if (!id) return;
    setGenerating(true);
    try {
      const response = await issueApi.generate(id);
      setGenerating(false);
    } catch (err: any) {
      console.error('Failed to generate issue:', err);
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
      setSaving(false);
    } catch (err: any) {
      console.error('Failed to save issue:', err);
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
      console.error('Failed to approve issue:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">{error}</p>
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
                onClick={() => issue && router.push(`/series/${issue.series_id}`)}
                className="text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <h1 className="text-2xl font-bold text-gray-900">
                #{issue?.sequence_no} {content.subject || 'Untitled Issue'}
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                issue?.status === 'approved'
                  ? 'bg-green-100 text-green-800'
                  : issue?.status === 'draft'
                  ? 'bg-gray-100 text-gray-800'
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {issue?.status}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Issue Editor</h2>
          <div className="flex space-x-2">
            <button
              onClick={saveIssue}
              disabled={saving}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Draft'}
              <Save className="h-4 w-4" />
            </button>
            <button
              onClick={generateIssue}
              disabled={generating}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 disabled:opacity-50"
            >
              {generating ? 'Generating...' : 'Generate with AI'}
              <RefreshCw className="h-4 w-4" />
            </button>
            {issue?.status !== 'approved' && (
              <button
                onClick={approveIssue}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
              >
                Approve & Schedule
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Subject
            </label>
            <input
              type="text"
              value={content.subject}
              onChange={(e) => setContent({ ...content, subject: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Preheader
            </label>
            <textarea
              value={content.preheader}
              onChange={(e) => setContent({ ...content, preheader: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-4">
              Content Blocks
            </label>
            <div className="space-y-4">
              {content.blocks.map((block, idx) => (
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2"
                      placeholder="Block title"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Block content..."
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
