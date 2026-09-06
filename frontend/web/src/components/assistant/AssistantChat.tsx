'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  ChevronDown,
  History,
  Loader2,
  MessageSquarePlus,
  Minimize2,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { modelsApi, type OpenRouterModel } from '@/lib/api';
import { ModelSelect } from '@/components/ModelSelect';
import { useAssistantChat } from '@/hooks/useAssistantChat';
import { executeAssistantAction } from '@/lib/assistantActions';
import type { AssistantAgentId, AssistantMessage, AssistantSeriesSetupValues } from '@/types/assistant';
import { PermissionCard } from './PermissionCard';
import { SeriesSetupFormCard } from './SeriesSetupFormCard';
import { ToolExecutionCard } from './ToolExecutionCard';
import { AssistantMessageContent } from './AssistantMessageContent';
import { AnalyticsPreview } from './AnalyticsPreview';
import { SeriesCreatedCard } from './SeriesCreatedCard';

const AGENTS: Array<{ id: AssistantAgentId; label: string; hint: string; icon: typeof Zap }> = [
  { id: 'operator', label: 'Operator', hint: 'Full workspace control', icon: Sparkles },
  { id: 'series', label: 'Series', hint: 'Create & manage courses', icon: MessageSquarePlus },
  { id: 'issues', label: 'Issues', hint: 'Draft & approve issues', icon: Zap },
];

const SUGGESTIONS = [
  {
    title: 'New series',
    text: 'Create a 7-day series on LLM ops for beginners',
  },
  {
    title: 'Status check',
    text: 'Show my active series and their plan status',
  },
  {
    title: 'Add issue',
    text: 'Add a new issue about RAG evaluation to my latest series',
  },
  {
    title: 'Analytics',
    text: 'What analytics do I have this week?',
  },
];

type AssistantChatProps = {
  onSeriesChange?: () => void;
  layout?: 'full' | 'dock';
};

export function AssistantChat({ onSeriesChange, layout = 'full' }: AssistantChatProps) {
  const isDock = layout === 'dock';
  const [expanded, setExpanded] = useState(!isDock);
  const [userMinimized, setUserMinimized] = useState(false);
  const { user } = useAuth();
  const [input, setInput] = useState('');
  const [model, setModel] = useState('');
  const [agent, setAgent] = useState<AssistantAgentId>('operator');
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [defaultModel, setDefaultModel] = useState('poolside/laguna-s-2.1:free');
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    threads,
    threadId,
    activeThreadTitle,
    loadingThread,
    streaming,
    error,
    persistenceEnabled,
    sendMessage,
    continueWithToolResult,
    newThread,
    switchThread,
    retryInit,
    clearError,
    updatePermission,
    updateForm,
    stop,
  } = useAssistantChat();

  const timezone = user?.timezone || 'UTC';
  const greeting = user?.name?.split(' ')[0] || 'there';

  useEffect(() => {
    modelsApi.list().then((res) => {
      setModels(res.models || []);
      if (res.default_model) setDefaultModel(res.default_model);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming]);

  useEffect(() => {
    if (!isDock || userMinimized) return;
    const needsAttention = messages.some(
      (m) => m.permission?.status === 'pending' || m.form?.status === 'pending',
    );
    if (needsAttention || error) {
      setUserMinimized(false);
      setExpanded(true);
    }
  }, [isDock, userMinimized, messages, error]);

  useEffect(() => {
    if (isDock && expanded) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isDock, expanded]);

  const openDock = useCallback(() => {
    if (isDock) {
      setUserMinimized(false);
      setExpanded(true);
    }
  }, [isDock]);

  const closeDock = useCallback(() => {
    if (!isDock) return;
    setUserMinimized(true);
    setExpanded(false);
    setHistoryOpen(false);
  }, [isDock]);

  useEffect(() => {
    if (!isDock || !expanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDock();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isDock, expanded, closeDock]);

  useEffect(() => {
    if (!historyOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (!historyRef.current?.contains(e.target as Node)) setHistoryOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [historyOpen]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || streaming) return;
    openDock();
    const text = input;
    setInput('');
    await sendMessage(text, model, agent, timezone);
    inputRef.current?.focus();
  }, [input, streaming, sendMessage, model, agent, timezone, openDock]);

  const handleSuggestion = useCallback((text: string) => {
    openDock();
    setInput(text);
    inputRef.current?.focus();
  }, [openDock]);

  const handleApprove = useCallback(
    async (message: AssistantMessage) => {
      if (!message.permission || message.permission.status !== 'pending') return;
      setPermissionBusy(true);
      updatePermission(message.id, { status: 'executing' });
      const { ok, result } = await executeAssistantAction(message.permission, model || undefined);
      updatePermission(message.id, {
        status: ok ? 'done' : 'error',
        result,
        error: ok ? undefined : result,
      });
      onSeriesChange?.();
      const toolCall = message.toolCalls?.find((tc) => tc.id === message.permission?.id);
      if (toolCall) {
        await continueWithToolResult(
          message,
          toolCall.id,
          toolCall.name,
          result,
          model,
          agent,
          timezone,
        );
      }
      setPermissionBusy(false);
    },
    [agent, continueWithToolResult, model, onSeriesChange, timezone, updatePermission],
  );

  const handleDeny = useCallback(
    (message: AssistantMessage) => {
      if (!message.permission) return;
      updatePermission(message.id, { status: 'denied' });
    },
    [updatePermission],
  );

  const handleFormSubmit = useCallback(
    async (message: AssistantMessage, values: AssistantSeriesSetupValues) => {
      if (!message.form || message.form.status !== 'pending') return;
      setFormBusy(true);
      updateForm(message.id, { status: 'submitted', defaults: values });
      const toolCall = message.toolCalls?.find((tc) => tc.id === message.form?.id);
      const result = JSON.stringify({
        ...values,
        send_days: values.send_days.join(', '),
      });
      if (toolCall) {
        await continueWithToolResult(
          message,
          toolCall.id,
          toolCall.name,
          result,
          model,
          agent,
          timezone,
        );
      }
      setFormBusy(false);
    },
    [agent, continueWithToolResult, model, timezone, updateForm],
  );

  const activeAgent = AGENTS.find((a) => a.id === agent) || AGENTS[0];
  const modelLabel = model || defaultModel;
  const lastUserMessage = messages.filter((m) => m.role === 'user').at(-1)?.content;
  const hasPendingAction = messages.some(
    (m) => m.permission?.status === 'pending' || m.form?.status === 'pending',
  );

  if (isDock && !expanded) {
    return (
      <section
        className="overflow-hidden rounded-2xl border border-[#e0d8cc] bg-white shadow-[0_8px_30px_rgba(28,25,23,0.08)] transition-all duration-300"
        aria-label="Cadensend AI command bar"
      >
        <div className="flex flex-col gap-2 p-2.5 sm:p-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openDock}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-900 text-amber-200 hover:bg-stone-800"
              aria-label="Open Cadensend AI"
            >
              <Sparkles className="h-4 w-4" />
            </button>

            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#e7e0d6] bg-[#faf8f5] px-3 py-2 focus-within:border-stone-400 focus-within:ring-2 focus-within:ring-stone-200">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={openDock}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                rows={1}
                placeholder="Ask Cadensend AI…"
                disabled={streaming || loadingThread || !threadId}
                className="max-h-20 min-h-[24px] flex-1 resize-none bg-transparent text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none disabled:opacity-60"
              />
            </div>

            <div className="hidden w-40 shrink-0 sm:block [&_button]:h-9 [&_button]:rounded-xl [&_button]:text-xs">
              <ModelSelect
                value={model}
                onChange={setModel}
                models={models}
                defaultModel={defaultModel}
              />
            </div>

            {streaming ? (
              <button
                type="button"
                onClick={stop}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-stone-300 bg-white text-stone-700"
                aria-label="Stop"
              >
                <Square className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!input.trim() || loadingThread || !threadId}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm hover:bg-blue-700 disabled:opacity-40"
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 px-0.5">
            {AGENTS.map((a) => {
              const Icon = a.icon;
              const active = agent === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setAgent(a.id);
                    openDock();
                  }}
                  title={a.hint}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? 'bg-stone-900 text-white'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {a.label}
                </button>
              );
            })}
            <span className="ml-auto hidden items-center gap-2 text-[11px] text-stone-400 sm:inline-flex">
              {streaming && (
                <span className="inline-flex items-center gap-1 text-blue-600">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Thinking…
                </span>
              )}
              {hasPendingAction && !streaming && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Action needed</span>
              )}
              <span>{activeAgent.label} · {modelLabel.split('/').pop()}</span>
            </span>
          </div>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={openDock}
              className="flex w-full items-center gap-2 rounded-xl border border-[#e7e0d6] bg-[#faf8f5] px-3 py-2 text-left transition-colors hover:border-stone-300 hover:bg-white"
            >
              <MessageSquarePlus className="h-4 w-4 shrink-0 text-stone-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-stone-800">{activeThreadTitle}</p>
                {lastUserMessage && (
                  <p className="truncate text-[11px] text-stone-500">{lastUserMessage}</p>
                )}
              </div>
              <span className="shrink-0 text-[11px] font-medium text-blue-600">Expand</span>
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      className={`overflow-hidden rounded-3xl border border-[#e0d8cc] bg-white shadow-[0_12px_40px_rgba(28,25,23,0.08)] transition-all duration-300 ${
        isDock ? 'scale-100 opacity-100' : ''
      }`}
    >
      {/* Header */}
      <div className="relative border-b border-[#e7e0d6] bg-[#1c1917] px-5 py-5 sm:px-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.08),transparent_55%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
              <Sparkles className="h-5 w-5 text-amber-200" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-xl tracking-tight text-white">Cadensend AI</h2>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-200 ring-1 ring-emerald-400/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {streaming ? 'Working' : 'Ready'}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-stone-400">
                {activeThreadTitle}
                {!persistenceEnabled && ' · local mode'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isDock && (
              <button
                type="button"
                onClick={closeDock}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-stone-200 hover:bg-white/10"
                title="Minimize chat (Esc)"
              >
                <Minimize2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Minimize</span>
              </button>
            )}
            <div className="relative" ref={historyRef}>
              <button
                type="button"
                onClick={() => setHistoryOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-stone-200 hover:bg-white/10"
              >
                <History className="h-3.5 w-3.5" />
                History
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </button>
              {historyOpen && (
                <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-[#e7e0d6] bg-white shadow-xl">
                  <div className="border-b border-stone-100 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                    Conversations
                  </div>
                  <div className="max-h-60 overflow-y-auto py-1">
                    {threads.length === 0 && (
                      <p className="px-3 py-4 text-sm text-stone-500">No saved conversations yet.</p>
                    )}
                    {threads.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          void switchThread(t.id);
                          setHistoryOpen(false);
                        }}
                        className={`block w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-stone-50 ${
                          t.id === threadId ? 'bg-stone-50 font-medium text-stone-900' : 'text-stone-700'
                        }`}
                      >
                        <span className="line-clamp-1">{t.title || 'Conversation'}</span>
                        <span className="mt-0.5 block text-[11px] text-stone-400">
                          {new Date(t.updated_at).toLocaleString()}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => void newThread(agent, model)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-stone-200 hover:bg-white/10"
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </button>
            <div className="w-48 [&_button]:border-white/15 [&_button]:bg-white/10 [&_button]:text-stone-100">
              <ModelSelect
                value={model}
                onChange={setModel}
                models={models}
                defaultModel={defaultModel}
              />
            </div>
          </div>
        </div>

        <div className="relative mt-4 flex flex-wrap gap-2">
          {AGENTS.map((a) => {
            const Icon = a.icon;
            const active = agent === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setAgent(a.id)}
                title={a.hint}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                  active
                    ? 'bg-white text-stone-900 shadow-sm'
                    : 'bg-white/5 text-stone-300 ring-1 ring-white/10 hover:bg-white/10'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {a.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className={`overflow-y-auto bg-[linear-gradient(180deg,#faf8f5_0%,#f6f3ee_100%)] px-4 py-5 sm:px-6 ${
          isDock ? 'max-h-[min(62vh,620px)] min-h-[320px]' : 'max-h-[min(56vh,560px)] min-h-[280px]'
        }`}
      >
        {loadingThread ? (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-sm text-stone-500">
            <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
            Loading conversation…
          </div>
        ) : messages.length === 0 ? (
          <div className="mx-auto max-w-2xl py-4 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-900 text-white shadow-lg">
              <Bot className="h-7 w-7" />
            </div>
            <h3 className="font-display text-2xl text-stone-900">What should we work on, {greeting}?</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-stone-500">
              Describe a series, ask about your workspace, or let me run tools on your behalf — I&apos;ll ask before any write action.
            </p>
            <div className={`mt-8 grid gap-3 ${isDock ? 'sm:grid-cols-2' : 'sm:grid-cols-2'}`}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.title}
                  type="button"
                  onClick={() => handleSuggestion(s.text)}
                  className="group rounded-2xl border border-[#e7e0d6] bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">{s.title}</p>
                  <p className="mt-1.5 text-sm leading-snug text-stone-800 group-hover:text-stone-900">{s.text}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-5">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                userName={user?.name || user?.email || 'You'}
                onApprove={() => handleApprove(msg)}
                onDeny={() => handleDeny(msg)}
                onFormSubmit={(values) => handleFormSubmit(msg, values)}
                permissionBusy={permissionBusy}
                formBusy={formBusy}
              />
            ))}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mx-auto mt-4 flex max-w-3xl items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Something went wrong</p>
              <p className="mt-0.5 text-red-700">{error}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={retryInit}
                className="rounded-lg p-1.5 text-red-700 hover:bg-red-100"
                aria-label="Retry"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={clearError}
                className="rounded-lg p-1.5 text-red-700 hover:bg-red-100"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-[#e7e0d6] bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-[#e7e0d6] bg-[#faf8f5] p-2 shadow-inner focus-within:border-stone-400 focus-within:ring-2 focus-within:ring-stone-200">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={1}
            placeholder="Ask me to create a series, check status, or manage issues…"
            disabled={streaming || loadingThread || !threadId}
            className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none disabled:opacity-60"
          />
          {streaming ? (
            <button
              type="button"
              onClick={stop}
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
              aria-label="Stop"
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!input.trim() || loadingThread || !threadId}
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-900 text-white shadow-sm hover:bg-stone-800 disabled:opacity-40"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-stone-400">
          Enter to send · Shift+Enter for new line · Write actions require your approval
          {isDock && ' · Esc to minimize'}
        </p>
      </div>
    </section>
  );
}

function MessageBubble({
  message,
  userName,
  onApprove,
  onDeny,
  onFormSubmit,
  permissionBusy,
  formBusy,
}: {
  message: AssistantMessage;
  userName: string;
  onApprove: () => void;
  onDeny: () => void;
  onFormSubmit: (values: AssistantSeriesSetupValues) => void;
  permissionBusy: boolean;
  formBusy: boolean;
}) {
  const isUser = message.role === 'user';
  const initial = userName.charAt(0).toUpperCase();

  if (message.role === 'tool') return null;

  const analyticsResult = message.toolResults?.find(
    (t) => t.entityType === 'analytics' && t.status === 'done' && t.output,
  );
  const seriesResult = message.toolResults?.find(
    (t) => t.entityType === 'series' && t.status === 'done' && t.output,
  );
  const seriesFromPermission =
    message.permission?.action === 'create_series' &&
    message.permission.result &&
    (message.permission.status === 'done' || message.permission.status === 'executing');
  const showAnalyticsCard = Boolean(analyticsResult);
  const showSeriesCard = Boolean(seriesResult || seriesFromPermission);
  const seriesCardOutput = seriesResult?.output || message.permission?.result || '';
  const proseContent =
    message.content &&
    !(showAnalyticsCard && /workspace insights|series overview|delivery pipeline/i.test(message.content))
      ? message.content
      : showAnalyticsCard && message.content
        ? message.content.split('\n').filter((line) => {
            const t = line.trim();
            return t && !/^(📊|workspace insights|\*\*series|\*\*delivery|\*\*content|\*\*suggestions)/i.test(t);
          }).join('\n').trim()
        : message.content;

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-semibold ${
          isUser ? 'bg-stone-800 text-white' : 'bg-gradient-to-br from-stone-800 to-stone-600 text-white shadow-sm'
        }`}
      >
        {isUser ? initial : <Bot className="h-4 w-4" />}
      </div>

      <div className={`min-w-0 flex-1 ${isUser ? 'max-w-[78%] ml-auto' : 'max-w-full'}`}>
        {!isUser && (
          <p className="mb-1.5 text-[11px] font-medium text-stone-400">Cadensend AI</p>
        )}

        <div className="space-y-3">
          {showSeriesCard && seriesCardOutput && (
            <SeriesCreatedCard output={seriesCardOutput} />
          )}

          {showAnalyticsCard && analyticsResult && (
            <AnalyticsPreview output={analyticsResult.output} />
          )}

          {(proseContent || message.streaming) && (
            <div
              className={`rounded-2xl px-4 py-3 shadow-sm ${
                isUser
                  ? 'bg-stone-900 text-white'
                  : 'border border-[#e7e0d6] bg-white'
              }`}
            >
              {proseContent ? (
                isUser ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{proseContent}</p>
                ) : (
                  <AssistantMessageContent content={proseContent} />
                )
              ) : message.streaming ? (
                <span className="inline-flex items-center gap-2 text-sm text-stone-500">
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400 [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400 [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400 [animation-delay:300ms]" />
                  </span>
                  Thinking
                </span>
              ) : null}
              {message.streaming && proseContent && (
                <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-stone-400 align-middle" />
              )}
            </div>
          )}

          {message.toolResults && message.toolResults.length > 0 && (
            <div className="space-y-2">
              {message.toolResults
                .filter((tool) => {
                  if (tool.status !== 'done') return true;
                  if (tool.entityType === 'analytics' && showAnalyticsCard) return false;
                  if (tool.entityType === 'series' && showSeriesCard) return false;
                  return true;
                })
                .map((tool) => (
                  <ToolExecutionCard key={tool.id} tool={tool} />
                ))}
            </div>
          )}

          {message.permission && (
            <PermissionCard
              message={message}
              onApprove={onApprove}
              onDeny={onDeny}
              busy={permissionBusy}
            />
          )}

          {message.form && message.form.formType === 'series_setup' && (
            <SeriesSetupFormCard
              form={message.form}
              onSubmit={onFormSubmit}
              busy={formBusy}
            />
          )}
        </div>
      </div>
    </div>
  );
}
