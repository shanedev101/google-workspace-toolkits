/**
 * Core Markdown rendering pipeline. Combines markdown-it for parsing,
 * highlight.js for syntax highlighting, KaTeX for math, and emoji support.
 * All rendering happens synchronously; Mermaid diagrams are rendered
 * asynchronously by `diagram.ts` after this function returns.
 */
import MarkdownIt from 'markdown-it';
// @ts-expect-error — markdown-it-emoji has no TypeScript declarations.
import { full as emoji } from 'markdown-it-emoji';
// @ts-expect-error — markdown-it-task-lists has no TypeScript declarations.
import taskLists from 'markdown-it-task-lists';

import { highlight } from './syntax';
import { preprocessMath, restoreMath } from './math';

const md = new MarkdownIt({
  html: false, // Security Best Practice: Disable raw HTML parsing in user content to prevent XSS.
  linkify: true,
  typographer: true,
  highlight: (str, lang) => {
    return highlight(str, lang);
  },
})
  .use(emoji)
  .use(taskLists, { label: true });

/**
 * Renders a Markdown string to an HTML string.
 *
 * Math expressions (`$…$` and `$$…$$`) are pre-processed and restored after
 * markdown-it parsing to avoid them being mangled by Markdown rules.
 *
 * @param content - Raw Markdown text.
 * @returns Sanitised HTML string ready for `innerHTML` assignment.
 */
export function renderMarkdown(content: string): string {
  // 1. Process math blocks before markdown parsing to protect formulas from markdown rules
  const { text: preparedMarkdown, placeholders } = preprocessMath(content);

  // 2. Parse markdown via markdown-it
  let html = md.render(preparedMarkdown);

  // 3. Restore the rendered math blocks
  html = restoreMath(html, placeholders);

  return html;
}
