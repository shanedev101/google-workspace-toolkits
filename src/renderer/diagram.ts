/**
 * Mermaid diagram renderer. Finds `mermaid` code blocks produced by the
 * Markdown pipeline and replaces them with rendered SVG in-place.
 * Initialisation is deferred until the first diagram is encountered.
 */
import mermaid from 'mermaid';

let mermaidInitialized = false;

/**
 * Finds all `<pre><code class="language-mermaid">` blocks inside `container`,
 * renders each one to SVG using Mermaid, and replaces the original `<pre>`
 * element with the rendered chart div.
 *
 * @param container - The element to search for Mermaid code blocks.
 * @param isDarkMode - When `true`, initialises Mermaid with the dark theme.
 */
export async function renderDiagrams(
  container: HTMLElement,
  isDarkMode: boolean = true
): Promise<void> {
  const elements = container.querySelectorAll('pre code.language-mermaid');
  if (elements.length === 0) return;

  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: isDarkMode ? 'dark' : 'default',
      securityLevel: 'loose',
      logLevel: 'fatal',
    });
    mermaidInitialized = true;
  }

  for (let i = 0; i < elements.length; i++) {
    const codeElement = elements[i];
    const preElement = codeElement.parentElement;
    if (!preElement) continue;

    const rawCode = codeElement.textContent || '';
    const chartDiv = document.createElement('div');
    chartDiv.className = 'mermaid-chart';
    chartDiv.style.margin = '1.5rem 0';
    chartDiv.style.display = 'flex';
    chartDiv.style.justifyContent = 'center';

    preElement.replaceWith(chartDiv);

    try {
      const uniqueId = `mermaid-svg-${Date.now()}-${i}`;
      const { svg } = await mermaid.render(uniqueId, rawCode);
      chartDiv.innerHTML = svg;
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      chartDiv.innerHTML = `
        <div class="mermaid-error" style="
          display: flex;
          align-items: center;
          gap: 12px;
          background-color: rgba(255, 68, 68, 0.08);
          border: 1px solid #ff4444;
          border-radius: 8px;
          padding: 16px;
          width: 100%;
          box-sizing: border-box;
          color: #ff4444;
          text-align: left;
        ">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
            <circle cx="12" cy="12" r="10" fill="rgba(255,68,68,0.2)"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <div>
            <div style="font-weight: 600; margin-bottom: 4px;">Mermaid Diagram Error</div>
            <div style="font-size: 13px; font-family: monospace; opacity: 0.9;">${errMessage}</div>
          </div>
        </div>
      `;
    }
  }
}
