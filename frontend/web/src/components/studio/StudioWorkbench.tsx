"use client";

import { ArrowUp, ArrowDown, Wand2 } from 'lucide-react';
import { markdownToHtml, replaceSection } from '@/lib/studioContent';
import { PageHeader, PageSkeleton, ErrorNotice } from '@/components/WorkspaceUI';

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
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState('');
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
    let cancelled = false;
    platformApi.skills().then((response) => {
      if (cancelled) return;
      const items = response.data ?? [];
      setSkills(items);
      const skill = items.find(item => item.id === searchParams.get('skill')) ?? items[0];
      if (skill) { setSkillId(skill.id); initOutlineFromSkill(skill); }
    }).catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load Studio.');
    }).finally(() => { if (!cancelled) setInitializing(false); });
    platformApi.studioMeta().then(response => { if (!cancelled) setMeta(response.data); }).catch(() => null);
    return () => { cancelled = true; };
  }, [authLoading, searchParams, initOutlineFromSkill]);

  const runCompose = async () => {
    if (!topic.trim() || !goal.trim() || wordTarget < 40 || wordTarget > 400) {
      setError('Enter a topic and goal, and choose between 40 and 400 words per section.');
      return;
    }
    setLoading(true);
    setError('');
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
      setError(e instanceof Error ? e.message : 'Could not compose this issue. Your draft has been kept.');
    } finally {
      setLoading(false);
    }
  };

  const regenerateSection = async (section: OutlineSection) => {
    setRegeneratingSection(section.id);
    setError('');
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
      setEditorMarkdown(prev => replaceSection(prev, section.title, text));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not regenerate this section. Your draft has been kept.');
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

  const moveOutline = (from: number, to: number) => {
    if (busy || from === to || to < 0 || to >= outline.length) return;
    setOutline((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next.map((s, i) => ({ ...s, order: i }));
    });
  };

  const previewHtml = useMemo(() => {
    const body = markdownToHtml(editorMarkdown);
    const subject = selectedSubject || compose?.issue.subject || topic;
    const preheader = compose?.preheader.text ?? '';
    return { body, subject, preheader };
  }, [compose, editorMarkdown, selectedSubject, topic]);

  if (authLoading || initializing) return <PageSkeleton label="Loading studio" />;
  const busy = loading || regeneratingSection !== null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader eyebrow="Create" title="Studio" description="Give your ideas structure, find the right voice, and preview every edit."
        actions={<button type="button" onClick={runCompose} disabled={busy || !skills.length} className="button-primary"><Wand2 className="h-4 w-4" aria-hidden="true" />{loading ? 'Composing…' : 'Generate full issue'}</button>} />

      {error && <ErrorNotice>{error}</ErrorNotice>}
      {busy && <p role="status" className="mb-5 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-900">{loading ? 'Composing your issue…' : 'Refining this section…'} Your current draft stays available if the request fails.</p>}

      <div className="grid gap-6 xl:grid-cols-12">
        {/* Controls */}
        <aside className="min-w-0 space-y-4 xl:col-span-3"><fieldset disabled={busy} className="space-y-4">
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
        </fieldset></aside>

        {/* Outline + editor */}
        <section className="space-y-4 min-w-0 xl:col-span-5">
          <Panel title="Outline">
            <p className="mb-3 text-xs leading-5 text-stone-500">Drag sections, use the arrows, or press Shift+↑/↓ while a row is focused.</p>
            <ul className="space-y-2">
              {outline.map((section, index) => (
                <li key={section.id} tabIndex={busy ? -1 : 0} draggable={!busy} onDragStart={() => onDragStart(index)}
                  onDragOver={(e) => e.preventDefault()} onDrop={() => { if (!busy) onDrop(index); }} onDragEnd={() => setDragIndex(null)}
                  onKeyDown={(e) => {
                    if (busy) return;
                    if (e.key === 'ArrowUp' && e.shiftKey) {
                      e.preventDefault();
                      moveOutline(index, index - 1);
                    }
                    if (e.key === 'ArrowDown' && e.shiftKey) {
                      e.preventDefault();
                      moveOutline(index, index + 1);
                    }
                  }}
                  className="flex cursor-grab flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e7e0d6] bg-[#faf8f5] px-3 py-2 text-sm active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
                  <span className="min-w-0 flex-1 break-words capitalize">{section.title}</span>
                  <div className="flex shrink-0 items-center">
                    {[-1, 1].map(direction => <button key={direction} type="button" className="icon-button !min-w-8" disabled={busy || index + direction < 0 || index + direction >= outline.length} aria-label={`Move ${section.title} ${direction < 0 ? 'up' : 'down'}`} onClick={() => moveOutline(index, index + direction)}>{direction < 0 ? <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />}</button>)}
                  </div>
                  <button type="button" disabled={busy}
                    onClick={() => regenerateSection(section)}
                    className="text-xs text-stone-600 underline disabled:opacity-50">
                    {regeneratingSection === section.id ? '…' : 'Regenerate'}
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Live markdown editor">
            <textarea aria-label="Issue Markdown" readOnly={busy} placeholder="Write your draft here, or generate an issue from your brief." spellCheck value={editorMarkdown} onChange={(e) => setEditorMarkdown(e.target.value)}
              rows={16} className={`${inputCls} font-mono text-xs leading-relaxed`} />
            <p className="mt-2 text-xs text-stone-500">{liveAnalysis.reading.words} words · Edits appear in the preview as you type.</p>
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
        <section className="space-y-4 min-w-0 xl:col-span-4">
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
                <button key={mode} type="button" aria-pressed={previewMode === mode} onClick={() => setPreviewMode(mode)}
                  className={`rounded-lg px-2 py-1 text-xs capitalize ${previewMode === mode ? 'bg-stone-900 text-white' : 'border border-[#e7e0d6]'}`}>
                  {mode}
                </button>
              ))}
            </div>
            <EmailPreview mode={previewMode} subject={previewHtml.subject} preheader={previewHtml.preheader} body={previewHtml.body} plainText={editorMarkdown} />
          </Panel>
        </section>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="surface p-5">
      <h2 className="mb-4 text-sm font-semibold tracking-tight text-stone-900">{title}</h2>
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

const inputCls = 'field-input';

function EmailPreview({ mode, subject, preheader, body, plainText }: { mode: PreviewMode; subject: string; preheader: string; body: string; plainText: string }) {
  const inner = mode === 'plain' ? (
    <pre className="whitespace-pre-wrap p-4 text-xs text-stone-700">{plainText}</pre>
  ) : (
    <div className="email-content p-5" dangerouslySetInnerHTML={{ __html: body }} />
  );

  const frameCls =
    mode === 'gmail' ? 'border-t-4 border-red-500' :
    mode === 'apple' ? 'border-t-4 border-blue-500 rounded-2xl' :
    mode === 'outlook' ? 'border-t-4 border-sky-600' : 'border border-[#e7e0d6]';

  const clientLabel = mode === 'html' || mode === 'plain' ? 'Preview' : `${mode} style preview`;

  return (
    <div className={`overflow-hidden rounded-xl bg-white shadow-sm ${frameCls}`}>
      <div className="border-b border-[#e7e0d6] bg-[#faf8f5] px-3 py-2 text-xs text-stone-500">{clientLabel}</div>
      <div className="border-b border-[#e7e0d6] px-4 py-3">
        <p className="font-medium text-stone-900">{subject}</p>
        <p className="text-xs text-stone-500">{preheader}</p>
      </div>
      {plainText.trim() ? inner : <p className="px-5 py-12 text-center text-sm leading-6 text-stone-500">Your issue preview will appear here as you write.</p>}
    </div>
  );
}
