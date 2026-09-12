/** Small, escaped Markdown renderer for the Studio's text-only preview. */
export function markdownToHtml(markdown: string): string {
  const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const inline = (text: string) => escape(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
  return markdown.split(/\n\s*\n/).filter(block => block.trim()).map(block => {
    const lines = block.split('\n');
    if (lines.every(line => /^[-*] /.test(line))) return `<ul>${lines.map(line => `<li>${inline(line.slice(2))}</li>`).join('')}</ul>`;
    if (lines.every(line => /^\d+\. /.test(line))) return `<ol>${lines.map(line => `<li>${inline(line.replace(/^\d+\. /, ''))}</li>`).join('')}</ol>`;
    return lines.map(line => {
      const heading = /^(#{1,3}) (.+)$/.exec(line);
      return heading ? `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>` : `<p>${inline(line)}</p>`;
    }).join('\n');
  }).join('\n');
}

/** Match complete heading lines, not a title interpreted as a regular expression. */
export function replaceSection(markdown: string, title: string, text: string): string {
  const lines = markdown.split('\n');
  const start = lines.findIndex(line => line.trim() === `## ${title}`);
  const replacement = [`## ${title}`, '', text, ''];
  if (start < 0) return [markdown.trimEnd(), '', ...replacement].join('\n').trim();
  let end = start + 1;
  while (end < lines.length && !/^#{1,2} /.test(lines[end])) end++;
  return [...lines.slice(0, start), ...replacement, ...lines.slice(end)].join('\n').trim();
}
