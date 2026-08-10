"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Send, RefreshCw } from 'lucide-react';

type IssueRecord = {
  id: string;
  series_id: string;
  sequence_no: number;
  subject: string;
  status: string;
  scheduled_at: string;
};

type ContentCitation = {
  source_id: string;
  chunk_id: string;
  locator: string;
};

type ContentBlock = {
  id: string;
  type: string;
  title?: string;
  text: string;
  citations: ContentCitation[];
};

type IssueContentState = {
  subject: string;
  preheader: string;
  blocks: ContentBlock[];
};

export default function IssueEditorPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [issue, setIssue] = useState<IssueRecord | null>(null);
  const [content, setContent] = useState<IssueContentState>({
    subject: '',
    preheader: '',
    blocks: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadIssue();
  }, [id]);

  const loadIssue = async () => {
    setLoading(true);
    try {
      // Mock data
      setIssue({
        id,
        series_id: 'series-1',
        sequence_no: 1,
        subject: 'Welcome to Kubernetes Fundamentals',
        status: 'draft',
        scheduled_at: '2024-01-22T09:00:00Z',
      });
      setContent({
        subject: 'Welcome to Kubernetes Fundamentals',
        preheader: 'Your first lesson in Kubernetes fundamentals',
        blocks: [
          {
            id: '1',
            type: 'hero',
            title: 'Welcome to Kubernetes',
            text: 'Kubernetes is an open-source container orchestration system...',
            citations: [
              { source_id: 'src-1', chunk_id: 'chunk-1', locator: 'Line 1-10' }
            ],
          },
        ],
      });
    } finally {
      setLoading(false);
    }
  };

  const generateIssue = async () => {
    setGenerating(true);
    try {
      // Call the AI engine API to generate the issue
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/issues/${id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      
      if (!response.ok) throw new Error('Failed to generate issue');
      
      const data = await response.json();
      // Update content with generated issue
      setContent(prev => ({
        ...prev,
        subject: data.issue?.subject || prev.subject,
        preheader: data.issue?.preheader || prev.preheader,
        blocks: data.issue?.content_blocks || prev.blocks,
      }));
    } catch (err) {
      console.error('Failed to generate issue:', err);
    } finally {
      setGenerating(false);
    }
  };

  const saveIssue = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/issues/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          content: content,
        }),
      });
      
      if (!response.ok) throw new Error('Failed to save issue');
    } catch (err) {
      console.error('Failed to save issue:', err);
    } finally {
      setSaving(false);
    }
  };

  const approveIssue = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/issues/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      
      if (!response.ok) throw new Error('Failed to approve issue');
      
      if (issue) {
        router.push(`/series/${issue.series_id}`);
      }
    } catch (err) {
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push(`/series/${issue?.series_id}`)}
                className="text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <h1 className="text-2xl font-bold text-gray-900">
                #{issue?.sequence_no} {issue?.subject}
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

        {/* Content editor */}
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
              {content.blocks.map((block) => (
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
                        newBlocks.forEach((b) => {
                          if (b.id === block.id) b.title = e.target.value;
                        });
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
                      newBlocks.forEach((b) => {
                        if (b.id === block.id) b.text = e.target.value;
                      });
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
