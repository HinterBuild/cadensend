'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { assistantApi } from '@/lib/api';
import type {
  AssistantAgentId,
  AssistantEffort,
  AssistantMessage,
  AssistantPermission,
  AssistantSeriesSetupForm,
  AssistantStreamEvent,
  AssistantToolCall,
  AssistantToolResult,
} from '@/types/assistant';

const THREAD_KEY = 'cadensend.assistant.activeThread';
const LOCAL_MESSAGES_KEY = 'cadensend.assistant.localMessages';
const LOCAL_THREAD_PREFIX = 'local-';

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function localThreadId() {
  return `${LOCAL_THREAD_PREFIX}${uid()}`;
}

function isLocalThread(id: string | null) {
  return Boolean(id?.startsWith(LOCAL_THREAD_PREFIX));
}

function parseStoredMessage(raw: Record<string, unknown>): AssistantMessage {
  return {
    id: String(raw.id || uid()),
    role: (raw.role as AssistantMessage['role']) || 'user',
    content: String(raw.content || ''),
    toolCalls: raw.toolCalls as AssistantToolCall[] | undefined,
    toolResults: raw.toolResults as AssistantToolResult[] | undefined,
    permission: raw.permission as AssistantPermission | undefined,
    form: raw.form as AssistantSeriesSetupForm | undefined,
  };
}

function loadLocalMessages(): AssistantMessage[] {
  try {
    const raw = sessionStorage.getItem(LOCAL_MESSAGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AssistantMessage[];
    return Array.isArray(parsed) ? parsed.slice(-40) : [];
  } catch {
    return [];
  }
}

function saveLocalMessages(messages: AssistantMessage[]) {
  try {
    sessionStorage.setItem(LOCAL_MESSAGES_KEY, JSON.stringify(messages.slice(-40)));
  } catch {
    // ignore
  }
}

function toLangChainToolCalls(toolCalls?: AssistantToolCall[]) {
  if (!toolCalls?.length) return undefined;
  return toolCalls.map((tc) => ({
    id: tc.id,
    name: tc.name,
    type: 'tool_call',
    args: tc.input,
  }));
}

function toApiMessages(messages: AssistantMessage[]) {
  const out: Array<Record<string, unknown>> = [];
  for (const msg of messages) {
    if (msg.role === 'user') {
      out.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      const toolCalls = toLangChainToolCalls(msg.toolCalls);
      if (toolCalls?.length) {
        out.push({ role: 'assistant', content: msg.content || '', tool_calls: toolCalls });
      } else if (msg.content) {
        out.push({ role: 'assistant', content: msg.content });
      }
    } else if (msg.role === 'tool' && msg.toolResults?.[0]) {
      const tr = msg.toolResults[0];
      out.push({
        role: 'tool',
        content: tr.output,
        tool_call_id: tr.id,
        name: tr.name,
      });
    }
  }
  return out;
}

function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    if (err.message === 'Not Found') {
      return 'Assistant is unavailable. Restart backend-api and ai-engine-api, then refresh.';
    }
    return err.message;
  }
  return fallback;
}

function apiStatus(err: unknown): number | undefined {
  return (err as Error & { status?: number })?.status;
}

async function* parseSSE(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<AssistantStreamEvent> {
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data:')) continue;
      const json = line.slice(5).trim();
      if (!json) continue;
      try {
        yield JSON.parse(json) as AssistantStreamEvent;
      } catch {
        // skip malformed
      }
    }
  }
}

export function useAssistantChat() {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Array<{ id: string; title: string; updated_at: string }>>([]);
  const [loadingThread, setLoadingThread] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [persistenceEnabled, setPersistenceEnabled] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<AssistantMessage[]>([]);
  const syncChainRef = useRef<Promise<void>>(Promise.resolve());

  messagesRef.current = messages;

  const enableLocalMode = useCallback((id?: string) => {
    const nextId = id || localThreadId();
    const localMessages = loadLocalMessages();
    setPersistenceEnabled(false);
    setThreadId(nextId);
    setMessages(localMessages);
    setThreads([{ id: nextId, title: 'Local conversation', updated_at: new Date().toISOString() }]);
    try {
      localStorage.setItem(THREAD_KEY, nextId);
    } catch {
      // ignore
    }
    setError(null);
  }, []);

  const syncToServer = useCallback(
    async (next: AssistantMessage[], opts?: { agent?: string; model?: string; thread?: string }) => {
      const id = opts?.thread || threadId;
      if (!id || isLocalThread(id) || !persistenceEnabled) {
        saveLocalMessages(next);
        return;
      }

      const run = async () => {
        try {
          await assistantApi.syncMessages(id, {
            messages: next,
            agent: opts?.agent,
            model: opts?.model,
          });
          const listed = await assistantApi.listThreads();
          setThreads(
            (listed.threads || []).map((t) => ({
              id: t.id,
              title: t.title,
              updated_at: t.updated_at,
            })),
          );
        } catch {
          saveLocalMessages(next);
        }
      };

      syncChainRef.current = syncChainRef.current.then(run).catch(() => {});
      await syncChainRef.current;
    },
    [persistenceEnabled, threadId],
  );

  const initThreads = useCallback(async () => {
    setLoadingThread(true);
    setError(null);
    try {
      const listed = await assistantApi.listThreads();
      setPersistenceEnabled(true);
      const items = (listed.threads || []).map((t) => ({
        id: t.id,
        title: t.title,
        updated_at: t.updated_at,
      }));
      setThreads(items);

      let activeId: string | null = null;
      try {
        activeId = localStorage.getItem(THREAD_KEY);
      } catch {
        activeId = null;
      }

      if (activeId?.startsWith(LOCAL_THREAD_PREFIX)) {
        enableLocalMode(activeId);
        return;
      }

      if (activeId && items.some((t) => t.id === activeId)) {
        const res = await assistantApi.getThread(activeId);
        const parsed = (res.messages || []).map(parseStoredMessage);
        setThreadId(activeId);
        setMessages(parsed);
        saveLocalMessages(parsed);
        return;
      }

      if (items.length > 0) {
        const res = await assistantApi.getThread(items[0].id);
        const parsed = (res.messages || []).map(parseStoredMessage);
        setThreadId(items[0].id);
        setMessages(parsed);
        saveLocalMessages(parsed);
        try {
          localStorage.setItem(THREAD_KEY, items[0].id);
        } catch {
          // ignore
        }
        return;
      }

      const created = await assistantApi.createThread();
      setThreadId(created.thread.id);
      setMessages([]);
      setThreads([{ id: created.thread.id, title: created.thread.title, updated_at: created.thread.updated_at }]);
      try {
        localStorage.setItem(THREAD_KEY, created.thread.id);
      } catch {
        // ignore
      }
    } catch (err) {
      const status = apiStatus(err);
      if (status === 404 || status === 502) {
        enableLocalMode();
      } else {
        setError(apiErrorMessage(err, 'Failed to load assistant'));
        enableLocalMode();
      }
    } finally {
      setLoadingThread(false);
    }
  }, [enableLocalMode]);

  const loadThread = useCallback(
    async (id: string) => {
      if (isLocalThread(id)) {
        enableLocalMode(id);
        setLoadingThread(false);
        return;
      }

      setLoadingThread(true);
      setError(null);
      try {
        const res = await assistantApi.getThread(id);
        const parsed = (res.messages || []).map(parseStoredMessage);
        setThreadId(id);
        setMessages(parsed);
        setPersistenceEnabled(true);
        saveLocalMessages(parsed);
        try {
          localStorage.setItem(THREAD_KEY, id);
        } catch {
          // ignore
        }
      } catch (err) {
        const status = apiStatus(err);
        if (status === 404) {
          try {
            localStorage.removeItem(THREAD_KEY);
          } catch {
            // ignore
          }
          await initThreads();
          return;
        }
        if (status === 502) {
          enableLocalMode();
        } else {
          setError(apiErrorMessage(err, 'Failed to load conversation'));
        }
      } finally {
        setLoadingThread(false);
      }
    },
    [enableLocalMode, initThreads],
  );

  useEffect(() => {
    void initThreads();
  }, [initThreads]);

  const streamChat = useCallback(
    async (
      apiMessages: Array<Record<string, unknown>>,
      model: string,
      agent: AssistantAgentId,
      timezone: string,
      activeThreadId: string,
      taggedIssueIds: string[] = [],
      effort: AssistantEffort = 'high',
    ) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);
      setError(null);

      const assistantId = uid();
      let assistant: AssistantMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        streaming: true,
        toolCalls: [],
        toolResults: [],
      };

      setMessages((prev) => [...prev, assistant]);

      try {
        const response = await fetch('/api/v1/assistant/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: apiMessages,
            model: model || undefined,
            agent,
            user_timezone: timezone,
            thread_id: isLocalThread(activeThreadId) ? undefined : activeThreadId,
            tagged_issue_ids: taggedIssueIds,
            effort,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          const msg = err.error || response.statusText;
          if (response.status === 404) {
            throw new Error('Assistant chat endpoint not found. Rebuild backend-api and ai-engine-api.');
          }
          throw new Error(msg);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response stream');

        for await (const event of parseSSE(reader)) {
          if (event.type === 'token') {
            assistant = { ...assistant, content: assistant.content + event.content };
          } else if (event.type === 'tool_start') {
            assistant = {
              ...assistant,
              toolCalls: [...(assistant.toolCalls || []), { id: event.id, name: event.name, input: event.input }],
              toolResults: [
                ...(assistant.toolResults || []),
                { id: event.id, name: event.name, output: '', status: 'running' },
              ],
            };
          } else if (event.type === 'tool_result') {
            assistant = {
              ...assistant,
              toolResults: (assistant.toolResults || []).map((tr) =>
                tr.id === event.id
                  ? { ...tr, output: event.output, status: 'done', entityType: event.entity_type }
                  : tr,
              ),
            };
          } else if (event.type === 'permission') {
            assistant = {
              ...assistant,
              permission: {
                id: event.id,
                action: event.action,
                label: event.label,
                payload: event.payload,
                status: 'pending',
              },
            };
          } else if (event.type === 'form') {
            assistant = {
              ...assistant,
              content: assistant.content || 'Configure your series using the form below.',
              form: {
                id: event.id,
                formType: 'series_setup',
                defaults: event.defaults as AssistantSeriesSetupForm['defaults'],
                status: 'pending',
              },
            };
          } else if (event.type === 'error') {
            setError(event.message);
          }

          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...assistant, streaming: true } : m)));
        }

        assistant = { ...assistant, streaming: false };
        const finalMessages = messagesRef.current.map((m) => (m.id === assistantId ? assistant : m));
        setMessages(finalMessages);
        await syncToServer(finalMessages, { agent, model, thread: activeThreadId });
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError(apiErrorMessage(err, 'Chat failed'));
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [syncToServer],
  );

  const sendMessage = useCallback(
    async (
      text: string,
      model: string,
      agent: AssistantAgentId,
      timezone: string,
      taggedIssueIds: string[] = [],
      effort: AssistantEffort = 'high',
    ) => {
      const trimmed = text.trim();
      if (!trimmed || streaming || !threadId) return;

      const userMsg: AssistantMessage = { id: uid(), role: 'user', content: trimmed };
      const next = [...messages, userMsg];
      setMessages(next);
      saveLocalMessages(next);
      await streamChat(toApiMessages(next), model, agent, timezone, threadId, taggedIssueIds, effort);
    },
    [messages, streamChat, streaming, threadId],
  );

  const continueWithToolResult = useCallback(
    async (
      assistantMsg: AssistantMessage,
      toolCallId: string,
      toolName: string,
      result: string,
      model: string,
      agent: AssistantAgentId,
      timezone: string,
      taggedIssueIds: string[] = [],
      effort: AssistantEffort = 'high',
    ) => {
      if (!threadId) return;
      const toolMsg: AssistantMessage = {
        id: uid(),
        role: 'tool',
        content: result,
        toolResults: [{ id: toolCallId, name: toolName, output: result, status: 'done' }],
      };
      const apiMessages = [
        ...toApiMessages(messages),
        { role: 'tool', content: result, tool_call_id: toolCallId, name: toolName },
      ];
      const next = [...messages, toolMsg];
      setMessages(next);
      await syncToServer(next, { agent, model, thread: threadId });
      await streamChat(apiMessages, model, agent, timezone, threadId, taggedIssueIds, effort);
    },
    [messages, streamChat, syncToServer, threadId],
  );

  const newThread = useCallback(
    async (agent: AssistantAgentId = 'operator', model = '') => {
      abortRef.current?.abort();
      setError(null);
      if (!persistenceEnabled) {
        const id = localThreadId();
        setThreadId(id);
        setMessages([]);
        saveLocalMessages([]);
        setThreads([{ id, title: 'New conversation', updated_at: new Date().toISOString() }]);
        try {
          localStorage.setItem(THREAD_KEY, id);
        } catch {
          // ignore
        }
        return;
      }
      try {
        const created = await assistantApi.createThread({ agent, model });
        setThreadId(created.thread.id);
        setMessages([]);
        try {
          localStorage.setItem(THREAD_KEY, created.thread.id);
        } catch {
          // ignore
        }
        const listed = await assistantApi.listThreads();
        setThreads(
          (listed.threads || []).map((t) => ({ id: t.id, title: t.title, updated_at: t.updated_at })),
        );
      } catch (err) {
        enableLocalMode();
        setError(apiErrorMessage(err, 'Could not create thread'));
      }
    },
    [enableLocalMode, persistenceEnabled],
  );

  const switchThread = useCallback(
    async (id: string) => {
      if (id === threadId || streaming) return;
      abortRef.current?.abort();
      await loadThread(id);
    },
    [loadThread, streaming, threadId],
  );

  const retryInit = useCallback(() => {
    void initThreads();
  }, [initThreads]);

  const clearError = useCallback(() => setError(null), []);

  const updatePermission = useCallback(
    (messageId: string, patch: Partial<AssistantPermission>) => {
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.id === messageId && m.permission ? { ...m, permission: { ...m.permission, ...patch } } : m,
        );
        void syncToServer(next);
        return next;
      });
    },
    [syncToServer],
  );

  const updateForm = useCallback(
    (messageId: string, patch: Partial<AssistantSeriesSetupForm>) => {
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.id === messageId && m.form ? { ...m, form: { ...m.form, ...patch } } : m,
        );
        void syncToServer(next);
        return next;
      });
    },
    [syncToServer],
  );

  const activeThreadTitle = threads.find((t) => t.id === threadId)?.title || 'New conversation';

  return {
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
    stop: () => abortRef.current?.abort(),
  };
}
