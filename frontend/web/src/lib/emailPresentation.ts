import type {
  DiagramStyle,
  DiagramTheme,
  EmailStylePreset,
  FontPair,
  IssuePresentation,
} from '@/types';

const CLASSIC: IssuePresentation = {
  style_preset: 'classic',
  font_pair: 'classic',
  diagram_theme: 'neutral',
  diagram_style: 'card',
  accent_color: '#1c1917',
  background_color: '#f5f0e8',
  surface_color: '#fffaf3',
  text_color: '#1c1917',
  muted_color: '#78716c',
  border_color: '#e7e0d6',
};

const PRESETS: Record<EmailStylePreset, IssuePresentation> = {
  classic: CLASSIC,
  editorial: {
    style_preset: 'editorial',
    font_pair: 'newsroom',
    diagram_theme: 'neutral',
    diagram_style: 'outline',
    accent_color: '#7c2d12',
    background_color: '#f7f1eb',
    surface_color: '#fffdfa',
    text_color: '#1f2937',
    muted_color: '#6b7280',
    border_color: '#eaded3',
  },
  digest: {
    style_preset: 'digest',
    font_pair: 'modern',
    diagram_theme: 'forest',
    diagram_style: 'shadow',
    accent_color: '#0f4c81',
    background_color: '#eef6ff',
    surface_color: '#ffffff',
    text_color: '#102a43',
    muted_color: '#486581',
    border_color: '#cbddee',
  },
  minimal: {
    style_preset: 'minimal',
    font_pair: 'technical',
    diagram_theme: 'dark',
    diagram_style: 'outline',
    accent_color: '#111827',
    background_color: '#f4f4f5',
    surface_color: '#ffffff',
    text_color: '#111827',
    muted_color: '#6b7280',
    border_color: '#e5e7eb',
  },
};

const FONT_STACKS: Record<FontPair, { heading: string; body: string }> = {
  classic: {
    heading: 'Georgia, "Times New Roman", serif',
    body: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  modern: {
    heading: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
    body: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  newsroom: {
    heading: 'Georgia, Cambria, "Times New Roman", serif',
    body: '"Trebuchet MS", "Segoe UI", sans-serif',
  },
  technical: {
    heading: '"Avenir Next", "Segoe UI", sans-serif',
    body: '"IBM Plex Sans", "Segoe UI", sans-serif',
  },
};

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function expandHexColor(value: string): string {
  if (value.length !== 4) {
    return value.toLowerCase();
  }
  return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toLowerCase();
}

function normalizeColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  if (!HEX_COLOR.test(trimmed)) {
    return fallback;
  }
  return expandHexColor(trimmed);
}

function pickPreset(value: unknown): EmailStylePreset {
  return value === 'editorial' || value === 'digest' || value === 'minimal' ? value : 'classic';
}

function pickFontPair(value: unknown): FontPair {
  return value === 'modern' || value === 'newsroom' || value === 'technical' ? value : 'classic';
}

function pickDiagramTheme(value: unknown): DiagramTheme {
  return value === 'forest' || value === 'dark' ? value : 'neutral';
}

function pickDiagramStyle(value: unknown): DiagramStyle {
  return value === 'outline' || value === 'shadow' ? value : 'card';
}

export function presentationPreset(preset: EmailStylePreset): IssuePresentation {
  return { ...PRESETS[preset] };
}

export function defaultIssuePresentation(): IssuePresentation {
  return presentationPreset('classic');
}

export function normalizeIssuePresentation(raw?: Partial<IssuePresentation> | null): IssuePresentation {
  const preset = pickPreset(raw?.style_preset);
  const base = presentationPreset(preset);
  return {
    style_preset: preset,
    font_pair: pickFontPair(raw?.font_pair ?? base.font_pair),
    diagram_theme: pickDiagramTheme(raw?.diagram_theme ?? base.diagram_theme),
    diagram_style: pickDiagramStyle(raw?.diagram_style ?? base.diagram_style),
    accent_color: normalizeColor(raw?.accent_color, base.accent_color),
    background_color: normalizeColor(raw?.background_color, base.background_color),
    surface_color: normalizeColor(raw?.surface_color, base.surface_color),
    text_color: normalizeColor(raw?.text_color, base.text_color),
    muted_color: normalizeColor(raw?.muted_color, base.muted_color),
    border_color: normalizeColor(raw?.border_color, base.border_color),
  };
}

export function issuePresentationFonts(presentation: IssuePresentation) {
  return FONT_STACKS[presentation.font_pair] ?? FONT_STACKS.classic;
}

export function mermaidThemeForPresentation(presentation: IssuePresentation): DiagramTheme {
  return presentation.diagram_theme;
}
