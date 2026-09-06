export type AssistantAgentId = 'operator' | 'series' | 'issues';

export type AssistantRole = 'user' | 'assistant' | 'tool';

export type AssistantToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type AssistantToolResult = {
  id: string;
  name: string;
  output: string;
  entityType?: string;
  status: 'running' | 'done' | 'error';
};

export type AssistantPermission = {
  id: string;
  action: string;
  label: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'approved' | 'denied' | 'executing' | 'done' | 'error';
  result?: string;
  error?: string;
};

export type AssistantSeriesSetupValues = {
  topic: string;
  goal: string;
  level: string;
  duration: string;
  cadence: string;
  send_time: string;
  send_days: string[];
  timezone: string;
};

export type AssistantSeriesSetupForm = {
  id: string;
  formType: 'series_setup';
  defaults: Partial<AssistantSeriesSetupValues> & { send_days?: string[] | string };
  status: 'pending' | 'submitted';
};

export type AssistantMessage = {
  id: string;
  role: AssistantRole;
  content: string;
  streaming?: boolean;
  toolCalls?: AssistantToolCall[];
  toolResults?: AssistantToolResult[];
  permission?: AssistantPermission;
  form?: AssistantSeriesSetupForm;
};

export type AssistantStreamEvent =
  | { type: 'run_start'; run_id: string; agent: string }
  | { type: 'token'; content: string }
  | { type: 'tool_start'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; id: string; name: string; output: string; entity_type?: string }
  | { type: 'permission'; id: string; action: string; label: string; payload: Record<string, unknown> }
  | { type: 'form'; id: string; form_type: string; defaults: Record<string, unknown> }
  | { type: 'error'; message: string }
  | { type: 'done'; run_id?: string; awaiting_permission?: boolean; awaiting_form?: boolean };

export type AssistantAgent = {
  id: AssistantAgentId;
  label: string;
  description: string;
};
