"use client";

import { useEffect, useId, useState, type CSSProperties } from "react";

import { defaultIssuePresentation, issuePresentationFonts, mermaidThemeForPresentation } from "@/lib/emailPresentation";
import type { IssuePresentation } from "@/types";

const FENCE = /```([a-zA-Z0-9_-]*)\s*\n([\s\S]*?)```/g;

const CHIP = "rounded px-1.5 py-0.5 font-mono text-[13px] bg-stone-900 text-stone-50";

function wrapPlain(text: string, re: RegExp) {
  return text.replace(re, (match, offset: number, full: string) => {
    const before = full.slice(0, offset);
    if (before.lastIndexOf("<code") > before.lastIndexOf("</code>")) {
      return match;
    }
    return `<code class="${CHIP}">${match}</code>`;
  });
}

function inlineFormat(text: string) {
  const withTicks = text.replace(/`([^`]+)`/g, "\u0000$1\u0000");
  const escaped = withTicks
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\u0000/g, "`");
  let html = escaped.replace(/`([^`]+)`/g, `<code class="${CHIP}">$1</code>`);
  html = wrapPlain(html, /\b[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*\([^)]{0,120}\)/g);
  html = wrapPlain(html, /\b[A-Z][A-Za-z0-9]+(?:\.[A-Za-z_][\w]+)+/g);
  html = wrapPlain(html, /\b[A-Za-z_][\w]*\s*(?:==|!=|>=|<=)\s*[A-Za-z0-9_().*+\-/ ]{1,40}/g);
  html = wrapPlain(html, /\b[a-z]+[A-Z][A-Za-z0-9]*\b/g);
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return html;
}

function codeBlockLabel(lang: string | undefined, body: string): string | null {
  const l = (lang || "").toLowerCase();
  if (["shell", "sh", "zsh", "console"].includes(l)) return "bash";
  if (l && !["code", "text", "plaintext", ""].includes(l)) return l;
  if (/^subject:/im.test(body) || /^hi[\s,]/im.test(body)) return "template";
  return null;
}

function isTableRow(line: string) {
  const t = line.trim();
  return t.startsWith("|") && t.includes("|", 1);
}

function isTableSeparator(line: string) {
  const t = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  if (!t.includes("|")) return false;
  return t.split("|").every((cell) => /^[\s:-]+$/.test(cell.trim()) || cell.trim() === "");
}

function parseTableCells(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function looksLikeDiagramSource(kind: string | undefined, source: string) {
  const text = source.trim();
  if (!text) return false;
  if (kind === "d2") return text.includes("->") || text.includes(":");
  return /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap|timeline|gitGraph)/i.test(text)
    || /-->|---/.test(text);
}

function MarkdownBlock({
  text,
  presentation,
}: {
  text: string;
  presentation: IssuePresentation;
}) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    if (!lines[i].trim()) {
      i++;
      continue;
    }
    if (isTableRow(lines[i])) {
      const chunk: string[] = [];
      while (i < lines.length && (isTableRow(lines[i]) || isTableSeparator(lines[i]))) {
        chunk.push(lines[i]);
        i++;
      }
      const rows = chunk.filter((line) => !isTableSeparator(line)).map(parseTableCells).filter((r) => r.length);
      if (rows.length) {
        const [header, ...body] = rows;
        nodes.push(
          <div key={key++} className="overflow-x-auto rounded-lg border" style={{ borderColor: presentation.border_color }}>
            <table className="min-w-full border-collapse text-sm">
              <thead style={{ backgroundColor: presentation.surface_color }}>
                <tr>
                  {header.map((cell, idx) => (
                    <th key={idx} className="border px-3 py-2 text-left font-semibold" style={{ borderColor: presentation.border_color, color: presentation.text_color }}>
                      <span dangerouslySetInnerHTML={{ __html: inlineFormat(cell) }} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, ridx) => (
                  <tr key={ridx}>
                    {header.map((_, cidx) => (
                      <td key={cidx} className="border px-3 py-2 align-top" style={{ borderColor: presentation.border_color, color: presentation.text_color }}>
                        <span dangerouslySetInnerHTML={{ __html: inlineFormat(row[cidx] || "") }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
      }
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !isTableRow(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    const block = para.join("\n").trim();
    if (!block) continue;
    const listLines = block.split("\n");
    const listed = listLines.every((line) => /^[-*] |\d+\. /.test(line.trim()));
    if (listed) {
      nodes.push(
        <ul key={key++} className="list-disc space-y-1 pl-5">
          {listLines.map((line, k) => (
            <li key={k} dangerouslySetInnerHTML={{ __html: inlineFormat(line.replace(/^[-*] |\d+\. /, "")) }} />
          ))}
        </ul>,
      );
      continue;
    }
    block.split("\n\n").forEach((segment) => {
      const trimmed = segment.trim();
      if (!trimmed) return;
      nodes.push(
        <p key={key++} dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.replace(/\n/g, " ")) }} />,
      );
    });
  }

  return <div className="space-y-3">{nodes}</div>;
}

function diagramFrameStyle(presentation: IssuePresentation): CSSProperties {
  const base: CSSProperties = {
    borderRadius: presentation.diagram_style === "shadow" ? "16px" : "12px",
    borderColor: presentation.border_color,
    backgroundColor: presentation.surface_color,
  };
  if (presentation.diagram_style === "outline") {
    return {
      ...base,
      borderWidth: "2px",
      borderStyle: "solid",
      boxShadow: "none",
    };
  }
  if (presentation.diagram_style === "shadow") {
    return {
      ...base,
      borderWidth: "1px",
      borderStyle: "solid",
      boxShadow: "0 16px 40px rgba(15, 23, 42, 0.10)",
    };
  }
  return {
    ...base,
    borderWidth: "1px",
    borderStyle: "solid",
  };
}

function MermaidBlock({ source, presentation }: { source: string; presentation: IssuePresentation }) {
  const reactId = useId().replace(/:/g, "");
  const [svg, setSvg] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: mermaidThemeForPresentation(presentation),
        });
        const { svg: rendered } = await mermaid.render(`diagram-${reactId}`, source.trim());
        if (!cancelled) {
          setSvg(rendered);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [presentation, reactId, source]);

  if (failed) {
    return (
      <pre className="overflow-x-auto rounded-lg bg-stone-900 px-3 py-3 font-mono text-[13px] text-stone-100 whitespace-pre-wrap">
        {source}
      </pre>
    );
  }
  if (!svg) {
    return <p className="text-sm" style={{ color: presentation.muted_color }}>Rendering diagram…</p>;
  }
  return <div className="overflow-x-auto [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function DiagramPreview({
  kind,
  source,
  altText,
  presentation,
}: {
  kind?: string;
  source: string;
  altText?: string;
  presentation: IssuePresentation;
}) {
  const trimmed = source.trim();
  const caption = altText || (kind === "d2" ? "D2 diagram" : "Diagram");
  if (!looksLikeDiagramSource(kind, trimmed)) {
    const text = trimmed || altText || "Diagram description unavailable.";
    return (
      <figure className="p-3" style={diagramFrameStyle(presentation)}>
        <figcaption className="mb-2 text-[11px] uppercase tracking-wider" style={{ color: presentation.muted_color }}>
          Diagram
        </figcaption>
        <p className="text-sm leading-relaxed" style={{ color: presentation.text_color }}>{text}</p>
      </figure>
    );
  }
  return (
    <figure className="p-3" style={diagramFrameStyle(presentation)}>
      <figcaption
        className="mb-2 text-[11px] uppercase tracking-wider"
        style={{ color: presentation.muted_color }}
      >
        {caption}
      </figcaption>
      {kind === "d2" ? (
        <pre className="overflow-x-auto rounded-lg bg-stone-900 px-3 py-3 font-mono text-[13px] text-stone-100 whitespace-pre-wrap">
          {source}
        </pre>
      ) : (
        <MermaidBlock source={source} presentation={presentation} />
      )}
    </figure>
  );
}

export function LessonPreview({
  text,
  presentation = defaultIssuePresentation(),
}: {
  text: string;
  presentation?: IssuePresentation;
}) {
  const parts: Array<{ type: "md" | "code" | "diagram"; lang?: string; body: string }> = [];
  let last = 0;
  const source = text.replace(/\r\n/g, "\n");
  for (const match of source.matchAll(FENCE)) {
    const index = match.index ?? 0;
    if (index > last) {
      parts.push({ type: "md", body: source.slice(last, index) });
    }
    const lang = (match[1] || "code").toLowerCase();
    const body = match[2].replace(/\n$/, "");
    if (lang === "mermaid" || lang === "d2") {
      parts.push({ type: "diagram", lang, body });
    } else {
      parts.push({ type: "code", lang, body });
    }
    last = index + match[0].length;
  }
  if (last < source.length) {
    parts.push({ type: "md", body: source.slice(last) });
  }

  return (
    <div className="space-y-3 text-sm leading-relaxed" style={{ color: presentation.text_color }}>
      {parts.map((part, i) => {
        if (part.type === "code") {
          const label = codeBlockLabel(part.lang, part.body);
          return (
            <div key={i} className="overflow-hidden rounded-lg border border-stone-800">
              {label ? (
                <div className="bg-stone-800 px-3 py-1 text-[11px] uppercase tracking-wider text-stone-400">
                  {label}
                </div>
              ) : null}
              <pre className="overflow-x-auto bg-stone-900 px-3 py-3 font-mono text-[13px] leading-relaxed text-stone-100 whitespace-pre-wrap">
                {part.body}
              </pre>
            </div>
          );
        }
        if (part.type === "diagram") {
          return (
            <DiagramPreview
              key={i}
              kind={part.lang}
              source={part.body}
              presentation={presentation}
            />
          );
        }
        return <MarkdownBlock key={i} text={part.body} presentation={presentation} />;
      })}
    </div>
  );
}

export function EmailPreview({
  subject,
  preheader,
  blocks,
  visuals = [],
  presentation = defaultIssuePresentation(),
}: {
  subject: string;
  preheader: string;
  blocks: Array<{
    title?: string;
    text: string;
    citations?: Array<{ source_id?: string; text?: string }>;
  }>;
  visuals?: Array<{ type?: string; content?: string; alt_text?: string }>;
  presentation?: IssuePresentation;
}) {
  const fonts = issuePresentationFonts(presentation);
  const bodyHasDiagram = blocks.some((block) => /```(mermaid|d2)\b/i.test(block.text));
  return (
    <article
      className="rounded-xl border p-6"
      style={{
        backgroundColor: presentation.surface_color,
        borderColor: presentation.border_color,
        color: presentation.text_color,
        boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
      }}
    >
      <p className="text-[11px] uppercase tracking-wider" style={{ color: presentation.muted_color }}>
        Email preview
      </p>
      <h2 className="mt-1 text-2xl" style={{ color: presentation.text_color, fontFamily: fonts.heading }}>
        {subject || "Untitled"}
      </h2>
      {preheader ? <p className="mt-1 text-sm" style={{ color: presentation.muted_color, fontFamily: fonts.body }}>{preheader}</p> : null}
      <div className="mt-5 space-y-6" style={{ fontFamily: fonts.body }}>
        {blocks.map((block, idx) => (
          <section key={idx}>
            {block.title ? (
              <h3 className="mb-2 text-base font-semibold" style={{ color: presentation.text_color, fontFamily: fonts.heading }}>
                {block.title}
              </h3>
            ) : null}
            <LessonPreview text={block.text} presentation={presentation} />
            {block.citations && block.citations.length > 0 ? (
              <div className="mt-3 border-t border-dashed pt-2" style={{ borderColor: presentation.border_color }}>
                <p className="mb-1 text-[11px] uppercase tracking-wider" style={{ color: presentation.muted_color }}>
                  Sources
                </p>
                <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed" style={{ color: presentation.muted_color }}>
                  {block.citations.map((citation, citIdx) => (
                    <li key={citIdx}>
                      <span className="font-mono text-[11px]">{citation.source_id?.slice(0, 8)}</span>
                      {citation.text ? <> — “{citation.text.length > 160 ? `${citation.text.slice(0, 157)}...` : citation.text}”</> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ))}
        {!bodyHasDiagram &&
          visuals
            .filter((visual) => visual.content)
            .map((visual, idx) => (
              <DiagramPreview
                key={`visual-${idx}`}
                kind={visual.type}
                source={visual.content || ""}
                altText={visual.alt_text}
                presentation={presentation}
              />
            ))}
      </div>
    </article>
  );
}
