import { markdownToHtml, replaceSection } from '../studioContent';

describe('Studio content', () => {
  it('renders headings and lists without wrapping block elements in paragraphs', () => {
    expect(markdownToHtml('# Topic\n\n- First\n- Second')).toBe('<h1>Topic</h1>\n<ul><li>First</li><li>Second</li></ul>');
  });
  it('escapes active content and preserves literal ampersands', () => {
    const result = markdownToHtml('<img src=x onerror=alert(1)>\n\nA & B');
    expect(result).not.toContain('<img');
    expect(result).toContain('&lt;img');
    expect(result).toContain('A &amp; B');
  });
  it('replaces a complete section with punctuation in its title without consuming the next one', () => {
    const original = '## Why (now)?\n\nOld text\n\n## Next\n\nKeep this';
    const result = replaceSection(original, 'Why (now)?', 'New text');
    expect(result).toContain('## Why (now)?\n\nNew text');
    expect(result).toContain('## Next\n\nKeep this');
    expect(result).not.toContain('Old text');
  });
  it('does not replace a section with a similar prefix', () => {
    const result = replaceSection('## Intro details\n\nKeep', 'Intro', 'Added');
    expect(result).toContain('## Intro details\n\nKeep');
    expect(result).toContain('## Intro\n\nAdded');
  });
});
