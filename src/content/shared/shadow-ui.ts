/**
 * Shared utility for creating isolated Shadow DOM containers used by all
 * content scripts to render extension UI without polluting host page styles.
 */

// @ts-expect-error — Vite's `?inline` CSS import is not typed in TypeScript.
import markdownStyles from '../../styles/github-markdown.css?inline';

/**
 * Creates an isolated Shadow DOM container for rendering extension UI inside
 * host pages without style pollution. Injects the GitHub Markdown stylesheet
 * and the KaTeX stylesheet into the shadow root.
 *
 * @param idName - The `id` attribute to assign to the host `<div>`.
 * @returns An object containing the host element and its shadow root.
 */
export function createShadowContainer(idName: string): {
  container: HTMLElement;
  shadowRoot: ShadowRoot;
} {
  // Clean up any existing container with the same ID first to prevent duplicate elements in the DOM
  const existing = document.getElementById(idName);
  if (existing) {
    existing.remove();
  }

  const container = document.createElement('div');
  container.id = idName;
  container.style.position = 'relative';
  container.style.zIndex = '999999'; // Ensure overlay resides above all Google DOM layers.

  const shadowRoot = container.attachShadow({ mode: 'open' });

  // Inject our custom premium styling sheets safely.
  const styleElement = document.createElement('style');
  styleElement.textContent = markdownStyles;
  shadowRoot.appendChild(styleElement);

  // Inject KaTeX stylesheet dynamically from extension bundle
  const katexLink = document.createElement('link');
  katexLink.rel = 'stylesheet';
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    katexLink.href = chrome.runtime.getURL('katex.min.css');
  }
  shadowRoot.appendChild(katexLink);

  return { container, shadowRoot };
}
