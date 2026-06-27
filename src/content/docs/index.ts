import { createShadowContainer } from '../shared/shadow-ui';
import { renderMarkdown } from '../../renderer/markdown';
import { renderDiagrams } from '../../renderer/diagram';
import { getThemePreference, injectGlobalButtonStyles, isContextValid } from '../shared/utils';

let isDark = false;
getThemePreference((dark) => {
  isDark = dark;
  updateTheme();
  injectGlobalButtonStyles(isDark);
});

function updateTheme() {
  const container = document.getElementById('md-docs-sidebar-container');
  if (container && container.shadowRoot) {
    const root = container.shadowRoot.host as HTMLElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }
}

function isMarkdownSelection(text: string): boolean {
  if (!text || text.trim().length < 3) return false;

  // Explicitly wrapped blocks are perfectly identified
  if (/^```(?:markdown|md|math)?\s*[\s\S]*?\s*```$/i.test(text.trim())) {
    return true;
  }

  const rules = [
    /^#+\s+/m, // Headings
    /^\s*[-*+]\s+/m, // Lists
    /^\s*\d+\.\s+/m, // Number lists
    /`[^`]+`/m, // Code inline
    /```/m, // Code block
    /\[.+\]\(.+\)/m, // Links
    /\*\*.+\*\*/m, // Bold
    /___.+___/m, // Underline/Bold
    /\$\$.+\$\$/ms, // KaTeX block math
    /\$[^\s$][^$]*?[^\s$]\$/, // KaTeX inline math
  ];

  return rules.some((rule) => rule.test(text));
}

// Helper to get selected text from Google Docs (including hidden event target iframe/textarea selection)
function getSelectedDocsText(): string {
  // 1. Try standard window selection
  let text = window.getSelection()?.toString() || '';
  if (text.trim()) return text;

  // 2. Try the Google Docs event-target elements (iframe or textarea)
  const el = document.querySelector('.docs-texteventtarget-iframe, .docs-texteventtarget');
  if (el) {
    const tagName = el.tagName.toLowerCase();
    if (tagName === 'iframe') {
      const iframe = el as HTMLIFrameElement;
      if (iframe.contentWindow) {
        try {
          text = iframe.contentWindow.document.getSelection()?.toString() || '';
          if (text.trim()) return text;
        } catch (_e) {
          // Intentionally ignored — reading selection from a cross-origin
          // iframe throws a SecurityError; fall through to the next strategy.
        }
      }
    } else if (tagName === 'textarea') {
      const textarea = el as HTMLTextAreaElement;
      try {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        if (start !== null && end !== null && start !== end) {
          text = textarea.value.substring(start, end);
          if (text.trim()) return text;
        }
      } catch (_e) {
        // Intentionally ignored — textarea selection access may fail in
        // sandboxed contexts; fall through to the next strategy.
      }
    }
  }

  // 3. Fallback: Check docs-clip-shadow div
  const clipShadow = document.querySelector('.docs-clip-shadow');
  if (clipShadow) {
    text = clipShadow.textContent || '';
    if (text.trim()) return text;
  }

  return '';
}

let mouseX = 0;
let mouseY = 0;
let isMouseDownInsideEditor = false;
let startX = 0;
let startY = 0;

// Track mousedown coordinates and targets to detect manual text dragging in non-accessibility canvas mode
document.addEventListener(
  'mousedown',
  (e) => {
    if (!isContextValid()) return;
    const target = e.target as HTMLElement;
    const editor = target.closest('.kix-appview-editor, .docs-editor');
    if (editor) {
      isMouseDownInsideEditor = true;
      startX = e.clientX;
      startY = e.clientY;
    } else {
      isMouseDownInsideEditor = false;
    }
  },
  { capture: true, passive: true }
);

// Setup selection listener with runtime toggle support using capture phase (true)
// to bypass Google Docs' internal e.stopPropagation() calls on mouse/keyboard events.
if (window.isMdDocsContextValid && window.isMdDocsContextValid()) {
  console.log('Workspace Toolkit for Google Docs: Valid instance already running.');
} else {
  console.log('Workspace Toolkit for Google Docs: Initializing...');
  // Clean up any old indicators/sidebars from a dead script
  const existingIndicator = document.getElementById('md-docs-indicator');
  if (existingIndicator) existingIndicator.remove();
  const existingSidebar = document.getElementById('md-docs-sidebar-container');
  if (existingSidebar) existingSidebar.remove();

  window.isMdDocsContextValid = () => isContextValid();
  window.mdDocsActive = true;

  const handleSelectionWrapper = (e: MouseEvent | KeyboardEvent) => {
    let isDragSelection = false;
    if (e instanceof MouseEvent) {
      mouseX = e.clientX;
      mouseY = e.clientY;
      const dist = Math.sqrt(Math.pow(e.clientX - startX, 2) + Math.pow(e.clientY - startY, 2));
      isDragSelection = isMouseDownInsideEditor && dist > 15; // Dragged by more than 15px
      isMouseDownInsideEditor = false; // Reset
    } else {
      mouseX = 0;
      mouseY = 0;
      isDragSelection = false;
    }

    if (!isContextValid()) {
      document.removeEventListener('mouseup', handleSelectionWrapper, true);
      document.removeEventListener('keyup', handleSelectionWrapper, true);
      const ind = document.getElementById('md-docs-indicator');
      if (ind) ind.remove();
      const sidebar = document.getElementById('md-docs-sidebar-container');
      if (sidebar) sidebar.remove();
      return;
    }

    // Defer check slightly to allow Google Docs event handlers to process selection
    // and populate the hidden selection textarea/iframe.
    if (window.mdDocsActive) {
      setTimeout(() => handleTextSelection(isDragSelection), 50);
    }
  };

  document.addEventListener('mouseup', handleSelectionWrapper, true);
  document.addEventListener('keyup', handleSelectionWrapper, true);

  const cleanup = () => {
    removeFloatingIndicator();
    closeMarkdownSidebar();
  };

  chrome.runtime.onMessage.addListener((message) => {
    if (!isContextValid()) return;
    if (message.type === 'INTEGRATION_STATE_CHANGE' && message.section === 'docs') {
      window.mdDocsActive = message.enabled;
      if (!message.enabled) {
        cleanup();
      }
    }
  });
}

function handleTextSelection(isDragSelection: boolean) {
  // Clear preview indicator if no selection
  const selectedText = getSelectedDocsText();

  if (selectedText.trim()) {
    if (isMarkdownSelection(selectedText)) {
      showFloatingIndicator(selectedText);
    } else {
      removeFloatingIndicator();
    }
    return;
  }

  // If selection text is empty (e.g. Accessibility is OFF) but user did a drag select inside editor,
  // we show the button so they can click it to see the setup guide.
  if (isDragSelection) {
    showFloatingIndicator('');
  } else {
    removeFloatingIndicator();
  }
}

async function extractTextFromGoogleDocsCopy(): Promise<string> {
  const docsTarget = document.querySelector(
    '.docs-texteventtarget-iframe, .docs-texteventtarget'
  ) as HTMLElement;
  if (!docsTarget) return '';

  const prevActiveEl = document.activeElement as HTMLElement;
  const isIframe = docsTarget.tagName.toLowerCase() === 'iframe';

  if (isIframe) {
    try {
      (docsTarget as HTMLIFrameElement).contentWindow?.focus();
    } catch (_e) {
      // Intentionally ignored — focusing a cross-origin iframe may throw
      // a SecurityError; copy will still be attempted on the parent document.
    }
  } else {
    docsTarget.focus();
  }

  let previousClipboard = '';
  try {
    previousClipboard = await navigator.clipboard.readText();
  } catch (e) {
    console.debug('Failed to read previous clipboard:', e);
  }

  // Execute copy programmatically on the appropriate document context
  let copySuccess = false;
  if (isIframe) {
    try {
      const iframeDoc = (docsTarget as HTMLIFrameElement).contentWindow?.document;
      if (iframeDoc) {
        copySuccess = iframeDoc.execCommand('copy');
      }
    } catch (e) {
      console.debug('Failed to copy inside iframe document:', e);
    }
  }

  if (!copySuccess) {
    copySuccess = document.execCommand('copy');
  }

  // Wait a short duration to ensure clipboard updates
  await new Promise((resolve) => setTimeout(resolve, 80));

  let selectedText = '';
  try {
    selectedText = await navigator.clipboard.readText();
  } catch (e) {
    console.debug('Failed to read new clipboard:', e);
  }

  // Restore previous clipboard content if it changed
  if (previousClipboard !== selectedText) {
    try {
      await navigator.clipboard.writeText(previousClipboard);
    } catch (e) {
      console.debug('Failed to restore clipboard:', e);
    }
  }

  // Restore focus
  if (prevActiveEl && prevActiveEl !== document.activeElement) {
    try {
      prevActiveEl.focus();
    } catch (_e) {
      // Intentionally ignored — restoring focus on a detached or restricted
      // element may throw; this is best-effort only.
    }
  }

  return selectedText;
}

function showFloatingIndicator(selectedText: string) {
  if (document.getElementById('md-docs-indicator')) return;

  const indicator = document.createElement('button');
  indicator.id = 'md-docs-indicator';
  indicator.className = 'glass-overlay-button';
  indicator.innerHTML = `<img src="${chrome.runtime.getURL('assets/icon_16.png')}" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 6px;" /> Preview Markdown`;
  indicator.style.position = 'fixed';
  indicator.style.zIndex = '999999';

  // Position near mouse coordinates if available, otherwise find kix cursor, or fallback to center top
  let top = mouseY - 45;
  let left = mouseX - 80;

  if (mouseX === 0 && mouseY === 0) {
    const caret = document.querySelector('.kix-cursor, .kix-active-cursor-caret') as HTMLElement;
    if (caret) {
      const rect = caret.getBoundingClientRect();
      top = rect.top - 45;
      left = rect.left - 80;
    } else {
      top = 100;
      left = window.innerWidth / 2 - 80;
    }
  }

  indicator.style.top = `${Math.max(10, top)}px`;
  indicator.style.left = `${Math.max(10, Math.min(window.innerWidth - 180, left))}px`;

  document.body.appendChild(indicator);

  indicator.addEventListener('mousedown', async (e) => {
    e.preventDefault(); // Prevent losing text focus highlight
    e.stopPropagation();

    let textToPreview = selectedText;
    if (!textToPreview) {
      textToPreview = await extractTextFromGoogleDocsCopy();
    }

    openMarkdownSidebar(textToPreview);
    removeFloatingIndicator();
  });
}

function removeFloatingIndicator() {
  const indicator = document.getElementById('md-docs-indicator');
  if (indicator) indicator.remove();
}

function openMarkdownSidebar(markdownText: string) {
  // Remove existing sidebar if open
  closeMarkdownSidebar();

  const { container, shadowRoot } = createShadowContainer('md-docs-sidebar-container');

  // Sidebar styling for clean side-by-side presentation.
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.right = '0';
  container.style.width = '450px';
  container.style.height = '100vh';
  container.style.boxShadow = '-5px 0 25px rgba(0,0,0,0.15)';
  container.style.backgroundColor = 'var(--bg-primary)';
  container.style.borderLeft = '1px solid var(--border-color)';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.transition = 'transform 0.3s ease';

  // Create inner content wrapper
  const sidebarHeader = document.createElement('div');
  sidebarHeader.style.padding = '1rem';
  sidebarHeader.style.borderBottom = '1px solid var(--border-color)';
  sidebarHeader.style.display = 'flex';
  sidebarHeader.style.justifyContent = 'space-between';
  sidebarHeader.style.alignItems = 'center';
  sidebarHeader.style.background = 'var(--bg-secondary)';

  const title = document.createElement('div');
  title.style.display = 'flex';
  title.style.alignItems = 'center';
  title.style.gap = '8px';
  title.innerHTML = `<img src="${chrome.runtime.getURL('assets/icon_16.png')}" style="width: 18px; height: 18px;" /><span style="font-weight: bold; font-size: 14px; color: var(--text-primary);">Markdown Selection Preview</span>`;

  const closeBtn = document.createElement('button');
  closeBtn.innerText = '✕';
  closeBtn.style.background = 'none';
  closeBtn.style.border = 'none';
  closeBtn.style.fontSize = '16px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.color = 'var(--text-muted)';
  closeBtn.addEventListener('click', closeMarkdownSidebar);

  sidebarHeader.appendChild(title);
  sidebarHeader.appendChild(closeBtn);

  const previewBody = document.createElement('div');
  previewBody.style.flex = '1';
  previewBody.style.overflowY = 'auto';
  previewBody.className = 'markdown-body';

  if (!markdownText.trim()) {
    previewBody.innerHTML = `
      <div style="padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; color: var(--text-primary);">
        <div style="display: flex; align-items: center; gap: 12px; background-color: rgba(66, 133, 244, 0.08); border: 1px solid var(--primary-color); border-radius: 8px; padding: 16px; color: var(--primary-color);">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <div>
            <div style="font-weight: 600; margin-bottom: 2px;">Google Docs Setup Required</div>
            <div style="font-size: 13px; opacity: 0.9;">One-time configuration needed to preview selections.</div>
          </div>
        </div>
        
        <p style="font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin: 0;">
          Google Docs uses custom Canvas rendering, which blocks normal extensions from reading highlighted text. Turning on <strong>Screen Reader support</strong> forces Docs to expose text selections to the browser.
        </p>

        <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px;">
          <h4 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600;">Enable Screen Reader Support:</h4>
          <ol style="margin: 0; padding-left: 20px; font-size: 13px; color: var(--text-secondary); line-height: 1.6;">
            <li>Go to <strong>Tools</strong> in the top menu.</li>
            <li>Select <strong>Accessibility settings</strong>.</li>
            <li>Check <strong>"Turn on screen reader support"</strong>.</li>
            <li>Click <strong>OK</strong>.</li>
          </ol>
        </div>
        
        <p style="font-size: 12px; color: var(--text-muted); font-style: italic; margin: 0;">
          Note: This is a secure Google Docs account-wide setting. You only need to do this once.
        </p>
      </div>
    `;
  } else {
    try {
      previewBody.innerHTML = renderMarkdown(markdownText);
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      previewBody.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; background-color: rgba(255, 68, 68, 0.08); border: 1px solid #ff4444; border-radius: 8px; padding: 16px; margin: 16px 0; color: #ff4444;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
            <circle cx="12" cy="12" r="10" fill="rgba(255,68,68,0.2)"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <div>
            <div style="font-weight: 600; margin-bottom: 4px;">Markdown Rendering Error</div>
            <div style="font-size: 13px; font-family: monospace; opacity: 0.9;">${errMessage}</div>
          </div>
        </div>
      `;
    }
  }

  shadowRoot.appendChild(sidebarHeader);
  shadowRoot.appendChild(previewBody);

  document.body.appendChild(container);

  // Apply initial theme classes.
  updateTheme();

  // Resize Google Docs main canvas viewport to fit sidebar side-by-side
  const docsEditor = document.querySelector('.kix-appview-editor') as HTMLElement;
  if (docsEditor) {
    docsEditor.style.marginRight = '450px';
  }

  // Render async diagrams.
  renderDiagrams(previewBody, isDark);
}

function closeMarkdownSidebar() {
  const container = document.getElementById('md-docs-sidebar-container');
  if (container) container.remove();

  // Restore Google Docs editor layout size
  const docsEditor = document.querySelector('.kix-appview-editor') as HTMLElement;
  if (docsEditor) {
    docsEditor.style.marginRight = '';
  }
}

console.log('Workspace Toolkit for Google Docs Content Script Loaded Successfully.');
