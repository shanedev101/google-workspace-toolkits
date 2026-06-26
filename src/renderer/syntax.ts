/**
 * Syntax highlighting adapter for markdown-it. Uses highlight.js to produce
 * HTML for fenced code blocks, with Mermaid blocks kept as raw escaped text
 * for later async processing by `diagram.ts`.
 */
import hljs from 'highlight.js';

/**
 * Escapes special HTML characters in `unsafe` so the string is safe to embed
 * inside an HTML attribute or element without XSS risk.
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Returns a syntax-highlighted HTML string for `code` in language `lang`.
 *
 * - If `lang` is `"mermaid"`, the code is escaped and tagged for later
 *   async rendering by `renderDiagrams`.
 * - If highlight.js knows `lang`, the code is highlighted.
 * - Otherwise the code is HTML-escaped and returned uncoloured.
 *
 * @param code - Raw source code to highlight.
 * @param lang - Fenced code block language identifier.
 * @returns A `<pre><code>` HTML string.
 */
export function highlight(code: string, lang: string): string {
  if (lang === 'mermaid') {
    return `<pre class="hljs"><code class="language-mermaid">${escapeHtml(code)}</code></pre>`;
  }

  if (lang && hljs.getLanguage(lang)) {
    try {
      const highlighted = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      return `<pre class="hljs"><code class="language-${lang}">${highlighted}</code></pre>`;
    } catch (err) {
      console.warn('Highlight.js failed to highlight code block', err);
    }
  }
  // Fallback: Safe html escape
  return `<pre class="hljs"><code>${escapeHtml(code)}</code></pre>`;
}
