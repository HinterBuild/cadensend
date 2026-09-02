"use client";

import { RotateCcw } from "lucide-react";
import { presentationPreset } from "@/lib/emailPresentation";
import type {
  DiagramStyle,
  DiagramTheme,
  EmailStylePreset,
  FontPair,
  IssuePresentation,
} from "@/types";

const EMAIL_STYLE_OPTIONS: Array<{
  value: EmailStylePreset;
  label: string;
  description: string;
}> = [
  { value: "classic", label: "Classic", description: "Warm paper tones with serif headings" },
  { value: "editorial", label: "Editorial", description: "Magazine feel with rich accents" },
  { value: "digest", label: "Digest", description: "Clean blue digest layout" },
  { value: "minimal", label: "Minimal", description: "Neutral, technical readability" },
];

const FONT_PAIR_OPTIONS: Array<{ value: FontPair; label: string }> = [
  { value: "classic", label: "Classic serif" },
  { value: "modern", label: "Modern sans" },
  { value: "newsroom", label: "Newsroom" },
  { value: "technical", label: "Technical" },
];

const DIAGRAM_THEME_OPTIONS: Array<{ value: DiagramTheme; label: string }> = [
  { value: "neutral", label: "Neutral" },
  { value: "forest", label: "Forest" },
  { value: "dark", label: "Dark" },
];

const DIAGRAM_STYLE_OPTIONS: Array<{ value: DiagramStyle; label: string }> = [
  { value: "card", label: "Card" },
  { value: "outline", label: "Outline" },
  { value: "shadow", label: "Shadow" },
];

const COLOR_FIELDS: Array<{ key: keyof IssuePresentation; label: string }> = [
  { key: "accent_color", label: "Accent" },
  { key: "background_color", label: "Background" },
  { key: "surface_color", label: "Surface" },
  { key: "text_color", label: "Text" },
  { key: "muted_color", label: "Muted text" },
  { key: "border_color", label: "Borders" },
];

function PresetSwatch({ preset }: { preset: EmailStylePreset }) {
  const colors = presentationPreset(preset);
  return (
    <div className="flex gap-0.5">
      {[colors.accent_color, colors.background_color, colors.surface_color, colors.text_color].map((color) => (
        <span
          key={color}
          className="h-4 w-4 rounded-full border border-white/80 shadow-sm"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

export function IssueStylePanel({
  presentation,
  onApplyPreset,
  onUpdate,
}: {
  presentation: IssuePresentation;
  onApplyPreset: (preset: EmailStylePreset) => void;
  onUpdate: (patch: Partial<IssuePresentation>) => void;
}) {
  return (
    <section className="space-y-5 rounded-2xl border border-[#e7e0d6] bg-[#faf8f5] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold text-stone-900">Email design</h3>
          <p className="mt-0.5 text-sm text-stone-600">
            Choose a style preset, then fine-tune typography, diagrams, and colors.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onApplyPreset(presentation.style_preset)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#e7e0d6] bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
          title="Reset colors to preset defaults"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Reset preset
        </button>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Style preset</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {EMAIL_STYLE_OPTIONS.map((option) => {
            const active = presentation.style_preset === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onApplyPreset(option.value)}
                className={`rounded-xl border p-3 text-left transition ${
                  active
                    ? "border-stone-900 bg-stone-900 text-white shadow-md"
                    : "border-[#e7e0d6] bg-white text-stone-800 hover:border-stone-400"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{option.label}</span>
                  <PresetSwatch preset={option.value} />
                </div>
                <p className={`mt-1 text-xs ${active ? "text-stone-300" : "text-stone-500"}`}>
                  {option.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">Font pair</span>
          <select
            value={presentation.font_pair}
            onChange={(e) => onUpdate({ font_pair: e.target.value as FontPair })}
            className="w-full rounded-xl border border-[#e7e0d6] bg-white px-3 py-2 text-sm text-stone-900"
          >
            {FONT_PAIR_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">Diagram theme</span>
          <select
            value={presentation.diagram_theme}
            onChange={(e) => onUpdate({ diagram_theme: e.target.value as DiagramTheme })}
            className="w-full rounded-xl border border-[#e7e0d6] bg-white px-3 py-2 text-sm text-stone-900"
          >
            {DIAGRAM_THEME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">Diagram frame</span>
          <select
            value={presentation.diagram_style}
            onChange={(e) => onUpdate({ diagram_style: e.target.value as DiagramStyle })}
            className="w-full rounded-xl border border-[#e7e0d6] bg-white px-3 py-2 text-sm text-stone-900"
          >
            {DIAGRAM_STYLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Color palette</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {COLOR_FIELDS.map(({ key, label }) => (
            <label
              key={key}
              className="flex items-center gap-3 rounded-xl border border-[#e7e0d6] bg-white px-3 py-2.5"
            >
              <input
                type="color"
                value={presentation[key] as string}
                onChange={(e) => onUpdate({ [key]: e.target.value } as Partial<IssuePresentation>)}
                className="h-9 w-10 cursor-pointer rounded border border-stone-200 bg-transparent"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-stone-800">{label}</span>
                <span className="block font-mono text-xs text-stone-500">{presentation[key] as string}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
