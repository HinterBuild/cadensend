"use client";

const FENCE = /```([a-zA-Z0-9_-]*)\s*\n([\s\S]*?)```/g;

function mermaidInkUrl(source: string) {
  const encoded = btoa(unescape(encodeURIComponent(source.trim())))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `https://mermaid.ink/svg/${encoded}`;
}

function inlineFormat(text: string) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/`([^`]+)`/g, '<code class="rounded bg-stone-100 px-1 py-0.5 font-mono text-[13px] text-stone-900">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
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
          const src = mermaidInkUrl(part.body);
          return (
            <figure key={i} className="rounded-xl border border-stone-200 bg-white p-3">
              <figcaption className="mb-2 text-[11px] uppercase tracking-wider text-stone-500">Diagram</figcaption>
              <img src={src} alt={`${part.lang} diagram`} className="h-auto w-full max-w-full" />
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
