import { issueApi, platformApi, seriesApi, sourceApi } from '@/lib/api';
import type { AssistantPermission } from '@/types/assistant';

function parseIssueContent(issue: { content_json?: string | Record<string, unknown> | null }) {
  if (issue.content_json && typeof issue.content_json === 'object') return issue.content_json;
  if (issue.content_json) {
    try {
      return JSON.parse(String(issue.content_json)) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

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
      case 'resume_series': {
        const res = await seriesApi.resume(String(payload.series_id || ''));
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
      case 'update_issue': {
        const issueId = String(payload.issue_id || '');
        const updates: Record<string, unknown> = {};
        if (payload.subject) updates.subject = String(payload.subject);
        if (payload.preheader) updates.preheader = String(payload.preheader);
        if (payload.content_blocks) {
          try {
            updates.content_blocks = JSON.parse(String(payload.content_blocks));
          } catch {
            return { ok: false, result: JSON.stringify({ error: 'content_blocks must be valid JSON' }) };
          }
        }
        const res = await issueApi.update(issueId, updates);
        return { ok: true, result: JSON.stringify({ data: res.data, message: 'Issue updated' }) };
      }
      case 'reschedule_issue': {
        const res = await issueApi.reschedule(
          String(payload.issue_id || ''),
          String(payload.scheduled_at || ''),
        );
        return { ok: true, result: JSON.stringify(res) };
      }
      case 'cancel_send': {
        const res = await issueApi.cancelSend(String(payload.issue_id || ''));
        return { ok: true, result: JSON.stringify(res) };
      }
      case 'test_send_issue': {
        const email = payload.email ? String(payload.email) : undefined;
        const res = await issueApi.testSend(String(payload.issue_id || ''), email);
        return { ok: true, result: JSON.stringify(res) };
      }
      case 'cancel_generation': {
        const res = await issueApi.cancelGeneration(String(payload.issue_id || ''));
        return { ok: true, result: JSON.stringify(res) };
      }
      case 'restore_issue_version': {
        const res = await issueApi.restoreVersion(
          String(payload.issue_id || ''),
          Number(payload.version),
        );
        return { ok: true, result: JSON.stringify({ data: res.data, message: 'Version restored' }) };
      }
      case 'set_series_skill': {
        const res = await platformApi.updateSeriesPlatform(
          String(payload.series_id || ''),
          '',
          String(payload.skill_id || ''),
        );
        return { ok: true, result: JSON.stringify(res) };
      }
      case 'set_series_workflow': {
        const res = await platformApi.updateSeriesPlatform(
          String(payload.series_id || ''),
          String(payload.workflow_mode || ''),
        );
        return { ok: true, result: JSON.stringify(res) };
      }
      case 'sync_connector': {
        const res = await platformApi.syncConnector(String(payload.connector_id || ''), {
          ...(payload.since ? { since: String(payload.since) } : {}),
        });
        return { ok: true, result: JSON.stringify(res) };
      }
      case 'run_workflow': {
        const brief: Record<string, unknown> = {
          topic: String(payload.topic || ''),
          goal: String(payload.goal || ''),
        };
        if (payload.series_id) brief.series_id = String(payload.series_id);
        const res = await platformApi.runWorkflow(String(payload.mode_id || ''), brief);
        return { ok: true, result: JSON.stringify(res) };
      }
      case 'studio_section': {
        const issueId = String(payload.issue_id || '');
        const sectionId = String(payload.section_id || '');
        const issueRes = await issueApi.get(issueId);
        const issue = issueRes.data;
        const content = parseIssueContent(issue);
        const blocks = (content.content_blocks as Array<Record<string, unknown>>) || [];
        const target = blocks.find((b) => String(b.id) === sectionId);
        const sectionRes = await platformApi.studioSection({
          section_id: sectionId,
          title: String(target?.title || target?.heading || sectionId),
          topic: String(payload.topic || ''),
          goal: [String(payload.goal || ''), String(payload.instruction || '')].filter(Boolean).join('. '),
          persona: String(payload.persona || 'practitioner'),
          brand_voice: String(payload.brand_voice || 'default'),
          use_llm: true,
        });
        const nextBlocks = blocks.map((block) =>
          String(block.id) === sectionId
            ? { ...block, text: sectionRes.data.text, content: sectionRes.data.text }
            : block,
        );
        const updated = await issueApi.update(issueId, {
          subject: String(content.subject || issue.objective || ''),
          preheader: String(content.preheader || ''),
          content_blocks: nextBlocks,
        });
        return {
          ok: true,
          result: JSON.stringify({
            data: updated.data,
            section: sectionRes.data,
            message: 'Section rewritten',
          }),
        };
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
