/**
 * KaTeX math pre/post-processor. Extracts `$…$` (inline) and `$$…$$` (block)
 * math expressions from Markdown before markdown-it parses it, renders them
 * with KaTeX, and substitutes placeholders back into the HTML output.
 * This prevents markdown-it rules from corrupting LaTeX syntax.
 */
import katex from 'katex';

export interface MathPlaceholders {
  block: string[];
  inline: string[];
}

/**
 * Extracts math expressions from `markdown`, renders them with KaTeX, and
 * replaces them with opaque placeholder tokens. The returned `text` is safe
 * to pass to markdown-it; call `restoreMath` on the resulting HTML to put
 * the rendered math back in place.
 *
 * Code spans and fenced code blocks are protected so math inside them is
 * never touched.
 *
 * @param markdown - Raw Markdown source that may contain math expressions.
 * @returns `{ text, placeholders }` where `text` has math replaced by tokens.
 */
export function preprocessMath(markdown: string): {
  text: string;
  placeholders: MathPlaceholders;
} {
  const blockPlaceholders: string[] = [];
  const inlinePlaceholders: string[] = [];

  // First, mask code blocks and inline code to prevent rendering math inside them
  const codePlaceholders: string[] = [];
  let masked = markdown.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (match) => {
    const placeholder = `%%CODE_PLACEHOLDER_${codePlaceholders.length}%%`;
    codePlaceholders.push(match);
    return placeholder;
  });

  // Process block math: $$ formula $$
  masked = masked.replace(/\$\$([\s\S]+?)\$\$/g, (_, formula) => {
    try {
      const rendered = katex.renderToString(formula.trim(), {
        displayMode: true,
        throwOnError: false,
      });
      const placeholder = `%%BLOCK_MATH_PLACEHOLDER_${blockPlaceholders.length}%%`;
      blockPlaceholders.push(rendered);
      return placeholder;
    } catch (err) {
      console.warn('KaTeX block rendering failed', err);
      return _;
    }
  });

  // Process inline math: $ formula $ (restricted to single line to avoid matching across table rows/cells)
  masked = masked.replace(/\$([^\s$\n][^$\n]*?[^\s$\n])\$/g, (_, formula) => {
    try {
      const rendered = katex.renderToString(formula.trim(), {
        displayMode: false,
        throwOnError: false,
      });
      const placeholder = `%%INLINE_MATH_PLACEHOLDER_${inlinePlaceholders.length}%%`;
      inlinePlaceholders.push(rendered);
      return placeholder;
    } catch (err) {
      console.warn('KaTeX inline rendering failed', err);
      return _;
    }
  });

  // Restore code blocks
  for (let i = 0; i < codePlaceholders.length; i++) {
    masked = masked.replace(`%%CODE_PLACEHOLDER_${i}%%`, codePlaceholders[i]);
  }

  return {
    text: masked,
    placeholders: {
      block: blockPlaceholders,
      inline: inlinePlaceholders,
    },
  };
}

/**
 * Replaces placeholder tokens in `html` (produced by `preprocessMath`) with
 * the pre-rendered KaTeX HTML stored in `placeholders`.
 *
 * @param html - HTML string from markdown-it that still contains placeholders.
 * @param placeholders - The placeholder map returned by `preprocessMath`.
 * @returns The final HTML with all math expressions restored.
 */
export function restoreMath(html: string, placeholders: MathPlaceholders): string {
  let result = html;

  // Restore block math (replacing the enclosing <p> wrapper if it exists to keep DOM clean)
  for (let i = 0; i < placeholders.block.length; i++) {
    const placeholder = `%%BLOCK_MATH_PLACEHOLDER_${i}%%`;
    const wrappedPlaceholder = `<p>${placeholder}</p>`;
    if (result.includes(wrappedPlaceholder)) {
      result = result.replace(wrappedPlaceholder, placeholders.block[i]);
    } else {
      result = result.replace(placeholder, placeholders.block[i]);
    }
  }

  // Restore inline math
  for (let i = 0; i < placeholders.inline.length; i++) {
    const placeholder = `%%INLINE_MATH_PLACEHOLDER_${i}%%`;
    result = result.replace(placeholder, placeholders.inline[i]);
  }

  return result;
}
