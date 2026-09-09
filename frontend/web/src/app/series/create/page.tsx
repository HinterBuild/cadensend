'use client';

import { PageHeader } from '@/components/WorkspaceUI';

import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Save, Calendar, Clock, CheckCircle, Plus, X, Link2, Rss, FileUp, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { seriesApi, modelsApi, sourceApi, OpenRouterModel } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { ModelSelect } from '@/components/ModelSelect';
import { RadioGroup } from '@/components/RadioGroup';
import type { ExtractedBrief } from '@/types';
import { useContentPreferences } from '@/hooks/useContentPreferences';
import { DEFAULT_GOAL_STARTERS, DEFAULT_TONE_OPTIONS } from '@/lib/seriesFormOptions';

type FormValues = {
  topic: string;
  goal: string;
  level: string;
  tone: string;
  length: string;
  timezone: string;
  startDate: string;
  duration: string;
  cadence: string;
  sendDays: string[];
  sendTime: string;
  verifyRecipient: boolean;
  manualApproval: boolean;
  model: string;
  skillId: string;
  workflowMode: string;
};

type PendingSource =
  | { kind: 'url'; value: string }
  | { kind: 'rss'; value: string }
  | { kind: 'file'; value: string; file: File };

const steps = [
  { id: 1, title: 'Topic', desc: 'What are you teaching?' },
  { id: 2, title: 'Sources', desc: 'What should we learn from?' },
  { id: 3, title: 'Schedule', desc: 'When should emails go out?' },
  { id: 4, title: 'Review', desc: 'Confirm and create' },
];

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const levelOptions = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

const lengthOptions = [
  { value: '5 min', label: '5 min' },
  { value: '10 min', label: '10 min' },
  { value: '15 min', label: 'Deep dive' },
];

const durationOptions = [
  { value: '1 week', label: '1 Week', weeks: 1 },
  { value: '1 month', label: '1 Month', weeks: 4 },
  { value: '3 months', label: '3 Months', weeks: 12 },
  { value: '6 months', label: '6 Months', weeks: 24 },
];

const cadenceOptions = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Karachi',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

const inputClass =
  'w-full px-3 py-2.5 rounded-lg border border-stone-300 bg-white text-stone-900 placeholder:text-stone-400 focus-visible:ring-2 focus-visible:ring-stone-800 focus-visible:border-transparent';

function tomorrowISODate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function emailsPerWeek(cadence: string, sendDays: string[]) {
  switch (cadence) {
    case 'daily':
      return 7;
    case 'weekly':
      return Math.max(sendDays.length, 1);
    case 'biweekly':
      return 0.5;
    case 'monthly':
      return 0.25;
    default:
      return 1;
  }
}

function estimateIssueCount(duration: string, cadence: string, sendDays: string[]) {
  const weeks = durationOptions.find((item) => item.value === duration)?.weeks ?? 4;
  return Math.max(1, Math.round(weeks * emailsPerWeek(cadence, sendDays)));
}

function previewSendDates(startDate: string, cadence: string, sendDays: string[], count: number) {
  if (!startDate) return [];
  const start = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return [];
  const wanted = new Set(sendDays.map((day) => day.slice(0, 3).toLowerCase()));
  const names = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const out: Date[] = [];
  const cursor = new Date(start);
  let guard = 0;
  while (out.length < count && guard < 400) {
    guard += 1;
    const matchDay = cadence === 'daily' || wanted.has(names[cursor.getDay()]);
    if (matchDay) {
      if (cadence === 'biweekly' && out.length > 0) {
        const last = out[out.length - 1];
        const diff = (cursor.getTime() - last.getTime()) / 86400000;
        if (diff < 13) {
          cursor.setDate(cursor.getDate() + 1);
          continue;
        }
      }
      if (cadence === 'monthly' && out.length > 0) {
        const last = out[out.length - 1];
        if (cursor.getMonth() === last.getMonth() && cursor.getFullYear() === last.getFullYear()) {
          cursor.setDate(cursor.getDate() + 1);
          continue;
        }
      }
      out.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export default function CreateSeriesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { prefs: contentPrefs } = useContentPreferences();

  const toneOptions = useMemo(
    () => [
      ...DEFAULT_TONE_OPTIONS,
      ...contentPrefs.custom_voices.map((v) => ({
        value: v.value || v.label,
        label: v.label,
      })),
    ],
    [contentPrefs.custom_voices],
  );

  const goalStarters = useMemo(
    () => [
      ...DEFAULT_GOAL_STARTERS,
      ...contentPrefs.custom_goals.map((g) => ({ label: g.label, text: g.text })),
    ],
    [contentPrefs.custom_goals],
  );

  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<OpenRouterModel[]>([]);
  const [defaultModel, setDefaultModel] = useState('poolside/laguna-s-2.1:free');
  const [urlDraft, setUrlDraft] = useState('');
  const [rssDraft, setRssDraft] = useState('');
  const [sources, setSources] = useState<PendingSource[]>([]);
  const [rawBriefText, setRawBriefText] = useState('');
  const [extractingBrief, setExtractingBrief] = useState(false);
  const [extractedBrief, setExtractedBrief] = useState<ExtractedBrief | null>(null);

  const [formData, setFormData] = useState<FormValues>({
    topic: '',
    goal: '',
    level: 'beginner',
    tone: 'instructor',
    length: '10 min',
    timezone: 'UTC',
    startDate: tomorrowISODate(),
    duration: '1 month',
    cadence: 'weekly',
    sendDays: ['Monday', 'Wednesday', 'Friday'],
    sendTime: '14:00',
    verifyRecipient: true,
    manualApproval: false,
    model: '',
    skillId: '',
    workflowMode: '',
  });

  const updateField = <K extends keyof FormValues>(field: K, value: FormValues[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
    setFieldError(null);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const topic = params.get('topic');
    const goal = params.get('goal');
    const level = params.get('level');
    const skill = params.get('skill');
    const workflow = params.get('workflow');
    if (!topic && !goal && !level && !skill && !workflow) {
      return;
    }
    setFormData((prev) => ({
      ...prev,
      topic: topic || prev.topic,
      goal: goal || prev.goal,
      level: level || prev.level,
      skillId: skill || prev.skillId,
      workflowMode: workflow || prev.workflowMode,
    }));
  }, []);

  useEffect(() => {
    if (user?.preferred_model) {
      setFormData((prev) => ({ ...prev, model: user.preferred_model || '' }));
    }
    if (user?.timezone) {
      setFormData((prev) => ({ ...prev, timezone: user.timezone }));
    }
  }, [user?.preferred_model, user?.timezone]);

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

  const issueCount = estimateIssueCount(formData.duration, formData.cadence, formData.sendDays);
  const previewDates = useMemo(
    () => previewSendDates(formData.startDate, formData.cadence, formData.sendDays, Math.min(6, issueCount)),
    [formData.startDate, formData.cadence, formData.sendDays, issueCount]
  );

  const summaryLine = formData.topic.trim()
    ? `A ${formData.level} ${formData.tone} series on “${formData.topic}”, about ${issueCount} emails over ${formData.duration}, ${formData.length} each.`
    : 'Fill in a topic to see a short summary of this series.';

  const addUrlSource = (kind: 'url' | 'rss', draft: string, clear: (value: string) => void) => {
    const value = draft.trim();
    if (!value) {
      setFieldError(`Enter a ${kind === 'rss' ? 'feed' : 'page'} URL`);
      return;
    }
    try {
      const parsed = new URL(value);
      if (!parsed.protocol.startsWith('http')) {
        throw new Error('http');
      }
    } catch {
      setFieldError('Enter a valid http(s) URL');
      return;
    }
    setSources((prev) => [...prev, { kind, value }]);
    clear('');
    setFieldError(null);
  };

  const applyExtractedBrief = (brief: ExtractedBrief) => {
    setFormData((prev) => ({
      ...prev,
      topic: brief.topic || prev.topic,
      goal: brief.goal || prev.goal,
      level: brief.level || prev.level,
      tone: brief.tone || prev.tone,
      length: brief.length || prev.length,
      cadence: brief.cadence || prev.cadence,
    }));
  };

  const handleExtractBrief = async () => {
    const input = rawBriefText.trim();
    if (input.length < 20) {
      setFieldError('Paste at least a few lines of notes or transcript before extracting.');
      return;
    }
    setExtractingBrief(true);
    setError(null);
    setFieldError(null);
    try {
      const response = await seriesApi.extractBrief({
        raw_text: input,
        source_type: 'notes',
        preferred_level: formData.level,
        preferred_tone: formData.tone,
        preferred_length: formData.length,
        preferred_cadence: formData.cadence,
        model: formData.model || undefined,
      });
      setExtractedBrief(response.brief);
      applyExtractedBrief(response.brief);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to extract a brief.');
    } finally {
      setExtractingBrief(false);
    }
  };

  const validateStep = (step: number): boolean => {
    if (step === 1) {
      if (!formData.topic.trim() || formData.topic.length < 3) {
        setFieldError('Enter a topic (at least 3 characters)');
        return false;
      }
      if (!formData.goal.trim() || formData.goal.length < 10) {
        setFieldError('Enter a goal (at least 10 characters), or pick a starter below');
        return false;
      }
    }
    if (step === 3) {
      if (!formData.startDate) {
        setFieldError('Select a start date');
        return false;
      }
      if (formData.cadence !== 'daily' && formData.sendDays.length === 0) {
        setFieldError('Pick at least one send day');
        return false;
      }
      if (!formData.sendTime) {
        setFieldError('Pick a send time');
        return false;
      }
    }
    return true;
  };

  const goToStep = (step: number) => {
    if (step < currentStep) {
      setCurrentStep(step);
      setFieldError(null);
      return;
    }
    for (let i = currentStep; i < step; i += 1) {
      if (!validateStep(i)) return;
    }
    setCurrentStep(step);
  };

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await seriesApi.create({
        topic: formData.topic,
        goal: formData.goal,
        level: formData.level,
        tone: formData.tone,
        length: formData.length,
        timezone: formData.timezone,
        start_date: formData.startDate,
        duration: formData.duration,
        cadence: formData.cadence,
        send_days: formData.cadence === 'daily' ? WEEKDAYS.join(', ') : formData.sendDays.join(', '),
        send_time: formData.sendTime,
        verify_recipient: formData.verifyRecipient,
        manual_approval: formData.manualApproval,
        model: formData.model || undefined,
        skill_id: formData.skillId || undefined,
        workflow_mode: formData.workflowMode || undefined,
      });
      const seriesId = created.data?.id;
      if (seriesId) {
        const attachErrors: string[] = [];
        for (const source of sources) {
          try {
            if (source.kind === 'file') {
              await sourceApi.upload(source.file, 'series', seriesId);
            } else {
              await sourceApi.submitUrl(source.value, source.kind, 'series', seriesId);
            }
          } catch (err: unknown) {
            attachErrors.push(err instanceof Error ? err.message : 'source failed');
          }
        }
        if (attachErrors.length) {
          setError(`Series created, but some sources failed: ${attachErrors[0]}`);
        }
        router.push(`/series/${seriesId}`);
        return;
      }
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create series. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const timezones = user?.timezone && !TIMEZONES.includes(user.timezone)
    ? [user.timezone, ...TIMEZONES]
    : TIMEZONES;

  return (
    <div className="min-h-full py-6 sm:py-8">
      <div className="max-w-2xl mx-auto px-4">
        <div className="mb-6">
          <Link
            href="/dashboard"
            aria-label="Back to Dashboard"
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800"
          >
            <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
            Back to Dashboard
          </Link>
        </div>

        <PageHeader eyebrow="Create" title="New series" description="Choose a topic, shape your content, and set your publishing schedule." />

        <nav aria-label="Progress" className="mb-8">
          <ol className="flex items-start justify-between gap-2">
            {steps.map((step) => {
              const active = currentStep === step.id;
              const done = currentStep > step.id;
              return (
                <li key={step.id} className="flex-1">
                  <button
                    type="button"
                    aria-current={active ? 'step' : undefined}
                    onClick={() => goToStep(step.id)}
                    className="w-full text-left"
                  >
                    <div className={`mb-2 h-1 rounded-full ${done || active ? 'bg-stone-900' : 'bg-stone-200'}`} />
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                      done ? 'bg-stone-900 text-white' : active ? 'bg-stone-900 text-white' : 'bg-stone-200 text-stone-600'
                    }`}>
                      {done ? <CheckCircle className="h-4 w-4" aria-hidden="true" /> : step.id}
                    </span>
                    <span className={`mt-2 block text-sm font-medium ${active || done ? 'text-stone-900' : 'text-stone-500'}`}>
                      {step.title}
                    </span>
                    <span className="block text-xs text-stone-500">{step.desc}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {(error || fieldError) && (
          <div role="alert" className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {fieldError || error}
          </div>
        )}

        <div className="bg-white rounded-lg border border-[#e7e0d6] p-5 sm:p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {steps[currentStep - 1].title}
          </h2>
          <p className="mb-6 text-sm text-stone-500">{steps[currentStep - 1].desc}</p>

          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-stone-900">Extract From Raw Notes</h3>
                    <p className="mt-1 text-sm text-stone-600">
                      Paste notes, a transcript, or a rough outline. Cadensend will turn it into a structured series brief.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExtractBrief}
                    disabled={extractingBrief}
                    className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
                  >
                    <Wand2 className="h-4 w-4" />
                    {extractingBrief ? 'Extracting...' : 'Extract brief'}
                  </button>
                </div>
                <textarea
                  value={rawBriefText}
                  onChange={(e) => setRawBriefText(e.target.value)}
                  rows={7}
                  className={`${inputClass} mt-4 resize-y bg-white`}
                  placeholder="Paste raw notes, planning bullets, transcript snippets, or a voice-note transcript here..."
                  maxLength={6000}
                />
                <p className="mt-1 text-xs text-stone-500">{rawBriefText.length}/6000</p>
                {extractedBrief && (
                  <div className="mt-4 rounded-lg border border-stone-200 bg-white p-4 text-sm text-stone-700">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-stone-900">Extraction ready</span>
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">
                        Confidence {Math.round((extractedBrief.confidence || 0) * 100)}%
                      </span>
                    </div>
                    {extractedBrief.key_points.length > 0 && (
                      <div className="mt-3">
                        <p className="font-medium text-stone-900">Key points</p>
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-stone-600">
                          {extractedBrief.key_points.slice(0, 4).map((point) => (
                            <li key={point}>{point}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {extractedBrief.ambiguities.length > 0 && (
                      <div className="mt-3">
                        <p className="font-medium text-amber-900">Please confirm</p>
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-amber-700">
                          {extractedBrief.ambiguities.slice(0, 4).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <p className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-600">{summaryLine}</p>
              <div>
                <label htmlFor="topic" className="block text-sm font-medium text-gray-700 mb-2">
                  Topic <span className="text-red-500">*</span>
                </label>
                <input
                  id="topic"
                  type="text"
                  value={formData.topic}
                  onChange={(e) => updateField('topic', e.target.value)}
                  className={inputClass}
                  placeholder="e.g. Introduction to Kubernetes"
                  maxLength={100}
                />
                <p className="mt-1 text-xs text-gray-500">{formData.topic.length}/100</p>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label htmlFor="goal" className="block text-sm font-medium text-gray-700">
                    Goal <span className="text-red-500">*</span>
                  </label>
                  <Link href="/settings" className="text-xs font-medium text-stone-600 hover:text-stone-900">
                    Manage custom goals
                  </Link>
                </div>
                <div className="mb-2 flex flex-wrap gap-2">
                  {goalStarters.map((starter) => (
                    <button
                      key={starter.label}
                      type="button"
                      onClick={() => updateField('goal', starter.text)}
                      className="rounded-full border border-stone-300 px-3 py-1 text-xs text-stone-700 hover:bg-stone-50"
                    >
                      {starter.label}
                    </button>
                  ))}
                </div>
                <textarea
                  id="goal"
                  value={formData.goal}
                  onChange={(e) => updateField('goal', e.target.value)}
                  rows={4}
                  className={`${inputClass} resize-none`}
                  placeholder="By the end of this series, you should be able to..."
                  maxLength={500}
                />
                <p className="mt-1 text-xs text-gray-500">{formData.goal.length}/500</p>
              </div>
              <RadioGroup
                legend="Audience"
                value={formData.level}
                options={levelOptions}
                onChange={(value) => updateField('level', value)}
                containerClassName="grid grid-cols-3 gap-3"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="mb-2 flex items-center justify-end">
                    <Link href="/settings" className="text-xs font-medium text-stone-600 hover:text-stone-900">
                      Manage custom voices
                    </Link>
                  </div>
                  <RadioGroup
                    legend="Voice"
                    value={formData.tone}
                    options={toneOptions}
                    onChange={(value) => updateField('tone', value)}
                    containerClassName="grid grid-cols-1 gap-2"
                    itemClassName={(checked) =>
                      `p-2 border rounded-lg text-sm ${
                        checked
                          ? 'border-stone-900 bg-stone-100 font-medium'
                          : 'border-gray-300 hover:border-gray-400'
                      }`
                    }
                  />
                </div>
                <RadioGroup
                  legend="Lesson length"
                  value={formData.length}
                  options={lengthOptions}
                  onChange={(value) => updateField('length', value)}
                  containerClassName="grid grid-cols-1 gap-2"
                  itemClassName={(checked) =>
                    `p-2 border rounded-lg text-sm ${
                      checked
                        ? 'border-stone-900 bg-stone-100 font-medium'
                        : 'border-gray-300 hover:border-gray-400'
                    }`
                  }
                />
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <p className="text-sm text-stone-600">
                Add docs, RSS feeds, or files now so the first emails can cite real material. You can skip and add sources later, but lessons will be thinner.
              </p>
              <div>
                <label htmlFor="source-url" className="block text-sm font-medium text-gray-700 mb-2">
                  Web page
                </label>
                <div className="flex gap-2">
                  <input
                    id="source-url"
                    type="url"
                    value={urlDraft}
                    onChange={(e) => setUrlDraft(e.target.value)}
                    className={inputClass}
                    placeholder="https://docs.example.com/..."
                  />
                  <button
                    type="button"
                    onClick={() => addUrlSource('url', urlDraft, setUrlDraft)}
                    className="shrink-0 rounded-lg bg-stone-900 px-3 text-white"
                    aria-label="Add URL"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="source-rss" className="block text-sm font-medium text-gray-700 mb-2">
                  RSS or Atom feed
                </label>
                <div className="flex gap-2">
                  <input
                    id="source-rss"
                    type="url"
                    value={rssDraft}
                    onChange={(e) => setRssDraft(e.target.value)}
                    className={inputClass}
                    placeholder="https://blog.example.com/feed.xml"
                  />
                  <button
                    type="button"
                    onClick={() => addUrlSource('rss', rssDraft, setRssDraft)}
                    className="shrink-0 rounded-lg bg-stone-900 px-3 text-white"
                    aria-label="Add RSS feed"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="source-file" className="block text-sm font-medium text-gray-700 mb-2">
                  Upload files
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-stone-300 px-4 py-3 text-sm text-stone-600 hover:bg-stone-50">
                  <FileUp className="h-4 w-4" />
                  PDF, Markdown, or text
                  <input
                    id="source-file"
                    type="file"
                    className="sr-only"
                    multiple
                    accept=".pdf,.md,.txt,.markdown,.html"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setSources((prev) => [
                        ...prev,
                        ...files.map((file) => ({ kind: 'file' as const, value: file.name, file })),
                      ]);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              {sources.length > 0 && (
                <ul className="space-y-2">
                  {sources.map((source, index) => (
                    <li key={`${source.kind}-${source.value}-${index}`} className="flex items-center justify-between rounded-lg border border-stone-200 px-3 py-2 text-sm">
                      <span className="flex items-center gap-2 truncate text-stone-800">
                        {source.kind === 'rss' ? <Rss className="h-4 w-4 shrink-0" /> : source.kind === 'file' ? <FileUp className="h-4 w-4 shrink-0" /> : <Link2 className="h-4 w-4 shrink-0" />}
                        <span className="truncate">{source.value}</span>
                        <span className="uppercase text-[10px] tracking-wide text-stone-500">{source.kind}</span>
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove source ${source.value}`}
                        onClick={() => setSources((prev) => prev.filter((_, i) => i !== index))}
                        className="text-stone-500 hover:text-stone-900"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              <p className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-600">
                About {issueCount} emails from {formData.startDate} at {formData.sendTime} ({formData.timezone}).
              </p>
              <div>
                <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-2">
                  Start date <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    id="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => updateField('startDate', e.target.value)}
                    className={`${inputClass} pl-10`}
                  />
                </div>
              </div>
              <RadioGroup
                legend="Duration"
                value={formData.duration}
                options={durationOptions}
                onChange={(value) => updateField('duration', value)}
                containerClassName="grid grid-cols-2 gap-3"
                itemClassName={(checked) =>
                  `p-3 border rounded-lg ${
                    checked
                      ? 'border-stone-900 bg-stone-100 font-medium'
                      : 'border-gray-300 hover:border-gray-400'
                  }`
                }
              />
              <RadioGroup
                legend="How often"
                value={formData.cadence}
                options={cadenceOptions}
                onChange={(value) => updateField('cadence', value)}
                containerClassName="grid grid-cols-2 gap-3"
                itemClassName={(checked) =>
                  `p-3 border rounded-lg ${
                    checked
                      ? 'border-stone-900 bg-stone-100 font-medium'
                      : 'border-gray-300 hover:border-gray-400'
                  }`
                }
              />
              {formData.cadence !== 'daily' && (
                <fieldset>
                  <legend className="block text-sm font-medium text-gray-700 mb-2">Send days</legend>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map((day) => {
                      const on = formData.sendDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            updateField(
                              'sendDays',
                              on ? formData.sendDays.filter((item) => item !== day) : [...formData.sendDays, day]
                            )
                          }
                          className={`rounded-full px-3 py-1 text-sm ${
                            on ? 'bg-stone-900 text-white' : 'border border-stone-300 text-stone-700'
                          }`}
                        >
                          {day.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="sendTime" className="block text-sm font-medium text-gray-700 mb-2">
                    Send time
                  </label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      id="sendTime"
                      type="time"
                      value={formData.sendTime}
                      onChange={(e) => updateField('sendTime', e.target.value)}
                      className={`${inputClass} pl-10`}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-2">
                    Timezone
                  </label>
                  <select
                    id="timezone"
                    value={formData.timezone}
                    onChange={(e) => updateField('timezone', e.target.value)}
                    className={inputClass}
                  >
                    {timezones.map((zone) => (
                      <option key={zone} value={zone}>{zone}</option>
                    ))}
                  </select>
                </div>
              </div>
              {previewDates.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium text-gray-700">Next sends</p>
                  <ul className="grid grid-cols-2 gap-2 text-sm text-stone-700">
                    {previewDates.map((date) => (
                      <li key={date.toISOString()} className="rounded-lg bg-stone-50 px-3 py-2">
                        {date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                        {' '}
                        {formData.sendTime}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="rounded-lg bg-stone-50 p-4 text-sm text-stone-800 space-y-2">
                <p className="font-medium">{formData.topic}</p>
                <p className="text-stone-600">{summaryLine}</p>
                <p>Sources: {sources.length === 0 ? 'None yet (you can add them after create)' : `${sources.length} attached`}</p>
                <p>Approval: {formData.manualApproval ? 'Review each email before send' : 'Send automatically at the scheduled time'}</p>
              </div>
              <div className="flex items-start p-4 border border-gray-200 rounded-lg">
                <input
                  id="verifyRecipient"
                  type="checkbox"
                  checked={formData.verifyRecipient}
                  onChange={(e) => updateField('verifyRecipient', e.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <label htmlFor="verifyRecipient" className="ml-3 text-sm">
                  <span className="font-medium text-gray-700">Require verified recipients</span>
                  <span className="mt-1 block text-gray-500">Only send to subscribers who confirmed their email.</span>
                </label>
              </div>
              <div className="flex items-start p-4 border border-gray-200 rounded-lg">
                <input
                  id="manualApproval"
                  type="checkbox"
                  checked={formData.manualApproval}
                  onChange={(e) => updateField('manualApproval', e.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <label htmlFor="manualApproval" className="ml-3 text-sm">
                  <span className="font-medium text-gray-700">Approve before sending</span>
                  <span className="mt-1 block text-gray-500">Leave off to send on the schedule automatically.</span>
                </label>
              </div>
              <div>
                <label htmlFor="model" className="block text-sm font-medium text-gray-700 mb-2">
                  Generation model
                </label>
                <ModelSelect
                  id="model"
                  value={formData.model === defaultModel ? '' : formData.model}
                  onChange={(modelId) => updateField('model', modelId)}
                  models={availableModels}
                  defaultModel={defaultModel}
                  className="w-full"
                />
              </div>
            </div>
          )}

          <div className="flex justify-between items-center mt-10 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={() => goToStep(Math.max(1, currentStep - 1))}
              disabled={currentStep === 1}
              className="text-gray-600 hover:text-gray-900 font-medium disabled:opacity-50"
            >
              Back
            </button>
            {currentStep === 4 ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="px-6 py-2.5 bg-stone-900 text-white rounded-lg hover:bg-stone-800 disabled:opacity-50 flex items-center gap-2 font-medium"
              >
                {submitting ? 'Creating...' : 'Create series'}
                {!submitting && <Save className="h-4 w-4" />}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => goToStep(currentStep + 1)}
                className="px-6 py-2.5 bg-stone-900 text-white rounded-lg hover:bg-stone-800 font-medium"
              >
                {currentStep === 2 && sources.length === 0 ? 'Skip sources' : 'Continue'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
