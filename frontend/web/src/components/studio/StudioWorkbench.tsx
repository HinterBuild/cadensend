"use client";

import { PageHeader } from '@/components/WorkspaceUI';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { platformApi } from '@/lib/api';
import { useRequireAuth } from '@/contexts/AuthContext';
import type { PlatformSkill, StudioComposeResult, StudioMeta } from '@/types';

type PreviewMode = 'html' | 'plain' | 'gmail' | 'apple' | 'outlook';

type OutlineSection = {
  id: string;
  title: string;
  order: number;
  text?: string;
};

const WORD_RE = /\b[\w']+\b/g;
const SENTENCE_RE = /[.!?]+/g;

function countSyllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  w = w.replace(/e$/, '');
  const groups = w.match(/[aeiouy]+/g);
  return Math.max(1, groups?.length ?? 1);
}

function fleschKincaidGrade(text: string) {
  const words = text.match(WORD_RE) ?? [];
  if (!words.length) return { grade: 0, label: 'N/A', words: 0, sentences: 0 };
  const sentences = Math.max(1, (text.match(SENTENCE_RE) ?? []).length);
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const grade = Math.max(0, 0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59);
  const rounded = Math.round(grade * 10) / 10;
  let label = 'Professional';
  if (rounded <= 8) label = 'General audience';
  else if (rounded > 12) label = 'Advanced / academic';
  return { grade: rounded, label, words: words.length, sentences };
}

function findBannedPhrases(text: string, banned: string[]) {
  const lower = text.toLowerCase();
  return banned.filter((p) => lower.includes(p.toLowerCase()));
}

function terminologySuggestions(text: string, preferred: Record<string, string>) {
  const lower = text.toLowerCase();
  return Object.entries(preferred)
    .filter(([from, to]) => lower.includes(from.toLowerCase()) && from.toLowerCase() !== to.toLowerCase())
    .map(([from, to]) => ({ from, to }));
}

function markdownToHtml(md: string) {
  let out = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*(.+?)\*/g, '<em>$1</em>');
  out = out.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  out = out.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  out = out.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  return out
    .split(/\n\n+/)
    .filter((p) => p.trim())
    .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
    .join('\n');
}

const DEFAULT_BANNED = ['synergy', 'leverage', 'disrupt', 'game-changer'];
const DEFAULT_PREFERRED: Record<string, string> = {
  newsletter: 'briefing',
  users: 'readers',
  leverage: 'use',
};

export function StudioWorkbench() {
  const { loading: authLoading } = useRequireAuth();
  const searchParams = useSearchParams();

  const [skills, setSkills] = useState<PlatformSkill[]>([]);
  const [meta, setMeta] = useState<StudioMeta | null>(null);
  const [skillId, setSkillId] = useState(searchParams.get('skill') || 'daily_brief');
  const [topic, setTopic] = useState('Product updates');
  const [goal, setGoal] = useState('Keep readers informed');
  const [tone, setTone] = useState(0.5);
  const [persona, setPersona] = useState('practitioner');
  const [brandVoice, setBrandVoice] = useState('default');
  const [emojiPreset, setEmojiPreset] = useState('minimal');
  const [wordTarget, setWordTarget] = useState(120);
  const [bannedPhrases, setBannedPhrases] = useState(DEFAULT_BANNED.join(', '));
  const [preferredTerms, setPreferredTerms] = useState('newsletter:briefing, users:readers');
  const [outline, setOutline] = useState<OutlineSection[]>([]);
  const [editorMarkdown, setEditorMarkdown] = useState('');
  const [compose, setCompose] = useState<StudioComposeResult | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('html');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [loading, setLoading] = useState(false);
  const [regeneratingSection, setRegeneratingSection] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const bannedList = useMemo(
    () => bannedPhrases.split(',').map((s) => s.trim()).filter(Boolean),
    [bannedPhrases],
  );
  const preferredMap = useMemo(() => {
    const map: Record<string, string> = { ...DEFAULT_PREFERRED };
    preferredTerms.split(',').forEach((pair) => {
      const [from, to] = pair.split(':').map((s) => s.trim());
      if (from && to) map[from] = to;
    });
    return map;
  }, [preferredTerms]);

  const liveAnalysis = useMemo(() => ({
    reading: fleschKincaidGrade(editorMarkdown),
    banned: findBannedPhrases(editorMarkdown, bannedList),
    terms: terminologySuggestions(editorMarkdown, preferredMap),
  }), [editorMarkdown, bannedList, preferredMap]);

  const initOutlineFromSkill = useCallback((skill: PlatformSkill | undefined) => {
    const sections = skill?.sections ?? ['intro', 'body', 'wrap'];
    setOutline(sections.map((s, i) => ({ id: s, title: s.replace(/_/g, ' '), order: i })));
  }, []);

  useEffect(() => {
    if (authLoading) return;
    platformApi.skills().then((r) => setSkills(r.data ?? []));
    platformApi.studioMeta().then((r) => setMeta(r.data)).catch(() => null);
  }, [authLoading]);

  useEffect(() => {
    const skill = skills.find((s) => s.id === skillId) ?? skills[0];
    if (skill) initOutlineFromSkill(skill);
  }, [skillId, skills, initOutlineFromSkill]);

  const runCompose = async () => {
    setLoading(true);
    try {
      const res = await platformApi.studioCompose({
        skill_id: skillId,
        topic,
        goal,
        tone,
        persona,
        brand_voice: brandVoice,
        emoji_preset: emojiPreset,
        word_target_per_section: wordTarget,
        outline,
        banned_phrases: bannedList,
        preferred_terms: preferredMap,
        use_llm: true,
      });
      const data = res.data;
      setCompose(data);
      setEditorMarkdown(data.issue.markdown);
      setSelectedSubject(data.issue.subject);
      setOutline(
        data.issue.content_blocks.map((b, i) => ({
          id: b.id,
          title: b.title,
          order: i,
          text: b.text,
        })),
      );
    } catch (e) {
      setCompose(null);
      setEditorMarkdown(e instanceof Error ? `Error: ${e.message}` : 'Compose failed');
    } finally {
      setLoading(false);
    }
  };

  const regenerateSection = async (section: OutlineSection) => {
    setRegeneratingSection(section.id);
    try {
      const res = await platformApi.studioSection({
        section_id: section.id,
        title: section.title,
        topic,
        goal,
        tone,
        persona,
        word_target: wordTarget,
        use_llm: true,
      });
      const text = res.data.text;
      setOutline((prev) => prev.map((s) => (s.id === section.id ? { ...s, text } : s)));
      setEditorMarkdown((prev) => {
        const header = `## ${section.title}`;
        if (prev.includes(header)) {
          return prev.replace(new RegExp(`## ${section.title}[\\s\\S]*?(?=\\n## |$)`), `## ${section.title}\n\n${text}\n\n`);
        }
        return `${prev}\n\n## ${section.title}\n\n${text}`;
      });
    } finally {
      setRegeneratingSection(null);
    }
  };

  const insertPromptBlock = (type: string, blockId: string) => {
    const block = meta?.prompt_blocks[type]?.find((b) => b.id === blockId);
    if (!block) return;
    const snippet = block.template.replace(/\{topic\}/g, topic);
    setEditorMarkdown((prev) => `${prev}\n\n${snippet}`);
  };

  const onDragStart = (index: number) => setDragIndex(index);
  const onDrop = (index: number) => {
    if (dragIndex === null || dragIndex === index) return;
    setOutline((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      return next.map((s, i) => ({ ...s, order: i }));
    });
    setDragIndex(null);
  };

  const previewHtml = useMemo(() => {
    const body = compose?.html ?? markdownToHtml(editorMarkdown);
    const subject = selectedSubject || compose?.issue.subject || topic;
    const preheader = compose?.preheader.text ?? '';
    return { body, subject, preheader };
  }, [compose, editorMarkdown, selectedSubject, topic]);

  if (authLoading) {
    return <div className="p-8 text-stone-500">Loading studio…</div>;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader eyebrow="Create" title="Studio" description="Compose, preview, and refine issues section by section before publishing." />

      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" onClick={runCompose} disabled={loading}
          className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {loading ? 'Composing…' : 'Generate full issue'}
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        {/* Controls */}
        <aside className="space-y-4 xl:col-span-3">
          <Panel title="Brief">
            <Field label="Skill">
              <select value={skillId} onChange={(e) => {
                const id = e.target.value;
                setSkillId(id);
                initOutlineFromSkill(skills.find((s) => s.id === id));
              }} className={inputCls}>
                {skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Topic"><input value={topic} onChange={(e) => setTopic(e.target.value)} className={inputCls} /></Field>
            <Field label="Goal"><input value={goal} onChange={(e) => setGoal(e.target.value)} className={inputCls} /></Field>
            <Field label={`Tone (${tone < 0.33 ? 'formal' : tone > 0.66 ? 'conversational' : 'balanced'})`}>
              <input type="range" min={0} max={1} step={0.05} value={tone} onChange={(e) => setTone(Number(e.target.value))} className="w-full" />
            </Field>
            <Field label="Words / section">
              <input type="number" min={40} max={400} value={wordTarget} onChange={(e) => setWordTarget(Number(e.target.value))} className={inputCls} />
            </Field>
            <Field label="Persona">
              <select value={persona} onChange={(e) => setPersona(e.target.value)} className={inputCls}>
                {(meta?.personas ?? [{ id: 'practitioner', label: 'Practitioner' }]).map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Brand voice">
              <select value={brandVoice} onChange={(e) => setBrandVoice(e.target.value)} className={inputCls}>
                {(meta?.brand_voices ?? [{ id: 'default', label: 'Balanced' }]).map((v) => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Emoji preset">
              <select value={emojiPreset} onChange={(e) => setEmojiPreset(e.target.value)} className={inputCls}>
                {(meta?.emoji_presets ?? ['none', 'minimal', 'friendly', 'expressive']).map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </Field>
          </Panel>

          <Panel title="Style guardrails">
            <Field label="Banned phrases (comma-separated)">
              <textarea value={bannedPhrases} onChange={(e) => setBannedPhrases(e.target.value)} rows={2} className={inputCls} />
            </Field>
            <Field label="Preferred terms (from:to)">
              <input value={preferredTerms} onChange={(e) => setPreferredTerms(e.target.value)} className={inputCls} />
            </Field>
            {liveAnalysis.banned.length > 0 && (
              <p className="text-xs text-red-600">Flagged: {liveAnalysis.banned.join(', ')}</p>
            )}
            {liveAnalysis.terms.length > 0 && (
              <ul className="text-xs text-amber-700">
                {liveAnalysis.terms.map((t) => <li key={t.from}>Prefer &quot;{t.to}&quot; over &quot;{t.from}&quot;</li>)}
              </ul>
            )}
            <p className="text-xs text-stone-500">
              Reading level: {liveAnalysis.reading.label} (grade {liveAnalysis.reading.grade})
            </p>
          </Panel>

          <Panel title="Prompt blocks">
            {(['intro', 'transition', 'cta'] as const).map((type) => (
              <div key={type} className="mb-2">
                <p className="text-xs font-medium uppercase text-stone-500">{type}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(meta?.prompt_blocks[type] ?? []).map((b) => (
                    <button key={b.id} type="button" onClick={() => insertPromptBlock(type, b.id)}
                      className="rounded-md border border-[#e7e0d6] px-2 py-0.5 text-xs hover:bg-[#faf8f5]">
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </Panel>
        </aside>

        {/* Outline + editor */}
        <section className="space-y-4 xl:col-span-5">
          <Panel title="Outline board (drag to reorder)">
            <ul className="space-y-2">
              {outline.map((section, index) => (
                <li key={section.id} draggable onDragStart={() => onDragStart(index)}
                  onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(index)}
                  className="flex cursor-grab items-center justify-between rounded-xl border border-[#e7e0d6] bg-[#faf8f5] px-3 py-2 text-sm active:cursor-grabbing">
                  <span>{section.title}</span>
                  <button type="button" disabled={regeneratingSection === section.id}
                    onClick={() => regenerateSection(section)}
                    className="text-xs text-stone-600 underline disabled:opacity-50">
                    {regeneratingSection === section.id ? '…' : 'Regenerate'}
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Live markdown editor">
            <textarea value={editorMarkdown} onChange={(e) => setEditorMarkdown(e.target.value)}
              rows={16} className={`${inputCls} font-mono text-xs leading-relaxed`} />
            <p className="mt-2 text-xs text-stone-500">Use Generate full issue or per-section Regenerate.</p>
          </Panel>

          {compose?.model_comparisons && compose.model_comparisons.length > 0 && (
            <Panel title="Multi-model comparison">
              <div className="space-y-3">
                {compose.model_comparisons.map((m) => (
                  <div key={m.model} className="rounded-lg bg-[#faf8f5] p-3 text-xs">
                    <p className="font-medium text-stone-700">{m.model}</p>
                    <p className="mt-1 text-stone-600">{m.draft}</p>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </section>

        {/* Preview column */}
        <section className="space-y-4 xl:col-span-4">
          {compose?.subject_variants && (
            <Panel title="Subject lines (A/B/C)">
              <div className="space-y-2">
                {compose.subject_variants.map((v) => (
                  <label key={v.id} className="flex cursor-pointer items-start gap-2 text-sm">
                    <input type="radio" name="subject" checked={selectedSubject === v.text}
                      onChange={() => setSelectedSubject(v.text)} />
                    <span><span className="font-medium">{v.label}:</span> {v.text}</span>
                  </label>
                ))}
              </div>
            </Panel>
          )}

          {compose?.preheader && (
            <Panel title="Preheader">
              <p className="text-sm text-stone-600">{compose.preheader.text}</p>
              <p className="text-xs text-stone-400">{compose.preheader.length} chars</p>
            </Panel>
          )}

          {compose?.hook && (
            <Panel title="Hook specialist">
              <p className="whitespace-pre-wrap text-sm text-stone-700">{compose.hook.text}</p>
            </Panel>
          )}

          {compose?.closer && (
            <Panel title="Closer / CTA specialist">
              <p className="whitespace-pre-wrap text-sm text-stone-700">{compose.closer.text}</p>
            </Panel>
          )}

          <Panel title="Issue preview">
            <div className="mb-2 flex flex-wrap gap-1">
              {(['html', 'plain', 'gmail', 'apple', 'outlook'] as PreviewMode[]).map((mode) => (
                <button key={mode} type="button" onClick={() => setPreviewMode(mode)}
                  className={`rounded-lg px-2 py-1 text-xs capitalize ${previewMode === mode ? 'bg-stone-900 text-white' : 'border border-[#e7e0d6]'}`}>
                  {mode}
                </button>
              ))}
            </div>
            <EmailPreview mode={previewMode} subject={previewHtml.subject} preheader={previewHtml.preheader} body={previewHtml.body} />
          </Panel>
        </section>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#e7e0d6] bg-white p-4">
      <h2 className="font-display mb-3 text-sm text-stone-900">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block text-xs font-medium text-stone-700">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls = 'w-full rounded-xl border border-[#e7e0d6] px-3 py-2 text-sm';

function EmailPreview({ mode, subject, preheader, body }: { mode: PreviewMode; subject: string; preheader: string; body: string }) {
  const inner = mode === 'plain' ? (
    <pre className="whitespace-pre-wrap p-4 text-xs text-stone-700">{body.replace(/<[^>]+>/g, '')}</pre>
  ) : (
    <div className="prose prose-sm max-w-none p-4" dangerouslySetInnerHTML={{ __html: body }} />
  );

  const frameCls =
    mode === 'gmail' ? 'border-t-4 border-red-500' :
    mode === 'apple' ? 'border-t-4 border-blue-500 rounded-2xl' :
    mode === 'outlook' ? 'border-t-4 border-sky-600' : 'border border-[#e7e0d6]';

  const clientLabel = mode === 'html' || mode === 'plain' ? 'Preview' : `${mode} client`;

  return (
    <div className={`overflow-hidden rounded-xl bg-white shadow-sm ${frameCls}`}>
      <div className="border-b border-[#e7e0d6] bg-[#faf8f5] px-3 py-2 text-xs text-stone-500">{clientLabel}</div>
      <div className="border-b border-[#e7e0d6] px-4 py-3">
        <p className="font-medium text-stone-900">{subject}</p>
        <p className="text-xs text-stone-500">{preheader}</p>
      </div>
      {inner}
    </div>
  );
}
