import { issueApi, seriesApi, sourceApi } from '@/lib/api';
import type { AssistantPermission } from '@/types/assistant';

export async function executeAssistantAction(
  permission: AssistantPermission,
  model?: string,
): Promise<{ ok: boolean; result: string }> {
  const { action, payload } = permission;
  try {
    switch (action) {
      case 'create_series': {
        const res = await seriesApi.create({
          topic: String(payload.topic || ''),
          goal: String(payload.goal || ''),
          level: String(payload.level || 'beginner'),
          timezone: String(payload.timezone || 'UTC'),
          duration: String(payload.duration || '1 month'),
          cadence: String(payload.cadence || 'weekly'),
          send_time: String(payload.send_time || '09:00'),
          send_days: String(payload.send_days || 'Monday'),
          model: String(payload.model || model || ''),
        });
        return { ok: true, result: JSON.stringify({ data: res.data, message: 'Series created' }) };
      }
      case 'update_series': {
        const seriesId = String(payload.series_id || '');
        const updates = { ...payload };
        delete updates.series_id;
        const res = await seriesApi.update(seriesId, updates);
        return { ok: true, result: JSON.stringify({ data: res.data }) };
      }
      case 'delete_series': {
        await seriesApi.delete(String(payload.series_id || ''));
        return { ok: true, result: JSON.stringify({ message: 'Series deleted' }) };
      }
      case 'create_issue': {
        const res = await seriesApi.createIssue(String(payload.series_id || ''), {
          objective: String(payload.objective || ''),
          scheduled_at: payload.scheduled_at ? String(payload.scheduled_at) : undefined,
          model: model || undefined,
        });
        return { ok: true, result: JSON.stringify({ data: res.data }) };
      }
      case 'generate_plan': {
        const res = await seriesApi.generatePlan(
          String(payload.series_id || ''),
          String(payload.model || model || '') || undefined,
        );
        return { ok: true, result: JSON.stringify(res) };
      }
      case 'generate_issue': {
        const res = await issueApi.generate(String(payload.issue_id || ''), {
          model: String(payload.model || model || '') || undefined,
        });
        return { ok: true, result: JSON.stringify(res) };
      }
      case 'approve_issue': {
        const res = await issueApi.approve(String(payload.issue_id || ''));
        return { ok: true, result: JSON.stringify(res) };
      }
      case 'activate_series': {
        const res = await seriesApi.activate(String(payload.series_id || ''));
        return { ok: true, result: JSON.stringify(res) };
      }
      case 'pause_series': {
        const res = await seriesApi.pause(String(payload.series_id || ''));
        return { ok: true, result: JSON.stringify(res) };
      }
      case 'add_source_url': {
        const res = await sourceApi.submitUrl(
          String(payload.url || ''),
          'url',
          'series',
          String(payload.series_id || ''),
        );
        return { ok: true, result: JSON.stringify(res) };
      }
      default:
        return { ok: false, result: JSON.stringify({ error: `Unknown action: ${action}` }) };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Action failed';
    return { ok: false, result: JSON.stringify({ error: message }) };
  }
}

export function humanizeToolName(name: string): string {
  return name
    .replace(/^propose_/, 'Prepare ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
