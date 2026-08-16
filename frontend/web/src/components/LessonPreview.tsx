"use client";

import { useEffect, useId, useState } from "react";

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

function MermaidBlock({ source }: { source: string }) {
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
          theme: "neutral",
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
  }, [reactId, source]);

  if (failed) {
    return (
      <pre className="overflow-x-auto bg-stone-900 px-3 py-3 font-mono text-[13px] text-stone-100 whitespace-pre-wrap">
        {source}
      </pre>
    );
  }
  if (!svg) {
    return <p className="text-sm text-stone-500">Rendering diagram…</p>;
  }
  return <div className="overflow-x-auto [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function LessonPreview({ text }: { text: string }) {
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
    <div className="space-y-3 text-sm leading-relaxed text-stone-700">
      {parts.map((part, i) => {
        if (part.type === "code") {
          const label = ["shell", "sh", "zsh", "console"].includes(part.lang || "") ? "bash" : part.lang;
          return (
            <div key={i} className="overflow-hidden rounded-lg border border-stone-800">
              <div className="bg-stone-800 px-3 py-1 text-[11px] uppercase tracking-wider text-stone-400">
                {label}
              </div>
              <pre className="overflow-x-auto bg-stone-900 px-3 py-3 font-mono text-[13px] leading-relaxed text-stone-100 whitespace-pre-wrap">
                {part.body}
              </pre>
            </div>
          );
        }
        if (part.type === "diagram") {
          return (
            <figure key={i} className="rounded-xl border border-stone-200 bg-white p-3">
              <figcaption className="mb-2 text-[11px] uppercase tracking-wider text-stone-500">Diagram</figcaption>
              <MermaidBlock source={part.body} />
            </figure>
          );
        }
        return part.body.trim().split("\n\n").map((para, j) => {
          const lines = para.trim().split("\n");
          const listed = lines.every((line) => /^[-*] |\d+\. /.test(line.trim()));
          if (listed) {
            return (
              <ul key={`${i}-${j}`} className="list-disc space-y-1 pl-5">
                {lines.map((line, k) => (
                  <li key={k} dangerouslySetInnerHTML={{ __html: inlineFormat(line.replace(/^[-*] |\d+\. /, "")) }} />
                ))}
              </ul>
            );
          }
          return (
            <p key={`${i}-${j}`} dangerouslySetInnerHTML={{ __html: inlineFormat(lines.join(" ")) }} />
          );
        });
      })}
    </div>
  );
}

export function EmailPreview({
  subject,
  preheader,
  blocks,
  visuals = [],
}: {
  subject: string;
  preheader: string;
  blocks: Array<{ title?: string; text: string }>;
  visuals?: Array<{ type?: string; content?: string; alt_text?: string }>;
}) {
  const bodyHasDiagram = blocks.some((block) => /```(mermaid|d2)\b/i.test(block.text));
  return (
    <article className="rounded-xl border border-stone-200 bg-[#fffaf3] p-6">
      <p className="text-[11px] uppercase tracking-wider text-stone-500">Email preview</p>
      <h2 className="mt-1 font-serif text-2xl text-stone-900">{subject || "Untitled"}</h2>
      {preheader ? <p className="mt-1 text-sm text-stone-500">{preheader}</p> : null}
      <div className="mt-5 space-y-6">
        {blocks.map((block, idx) => (
          <section key={idx}>
            {block.title ? <h3 className="mb-2 font-semibold text-stone-800">{block.title}</h3> : null}
            <LessonPreview text={block.text} />
          </section>
        ))}
        {!bodyHasDiagram &&
          visuals
            .filter((visual) => visual.content)
            .map((visual, idx) => (
              <figure key={`visual-${idx}`} className="rounded-xl border border-stone-200 bg-white p-3">
                <figcaption className="mb-2 text-[11px] uppercase tracking-wider text-stone-500">
                  {visual.alt_text || "Diagram"}
                </figcaption>
                <MermaidBlock source={visual.content || ""} />
              </figure>
            ))}
      </div>
    </article>
  );
}
