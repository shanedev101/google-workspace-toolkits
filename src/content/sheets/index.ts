import { createShadowContainer } from '../shared/shadow-ui';
import { renderMarkdown } from '../../renderer/markdown';
import { renderDiagrams } from '../../renderer/diagram';
import {
  getThemePreference,
  observeDOM,
  debounce,
  injectGlobalButtonStyles,
  isContextValid,
} from '../shared/utils';

let isDark = false;
getThemePreference((dark) => {
  isDark = dark;
  updateTheme();
  injectGlobalButtonStyles(isDark);
});

function updateTheme() {
  const container = document.getElementById('md-sheets-modal-container');
  if (container && container.shadowRoot) {
    const root = container.shadowRoot.host as HTMLElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }
}

// Helper to extract text from formula bar preserving newlines correctly
function getFormulaBarText(el: HTMLElement): string {
  let text = '';
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.nodeValue || '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      const tagName = element.tagName.toLowerCase();
      if (tagName === 'br') {
        text += '\n';
      } else if (tagName === 'div' || tagName === 'p') {
        const startLen = text.length;
        Array.from(element.childNodes).forEach(walk);
        if (text.length > startLen && !text.endsWith('\n')) {
          text += '\n';
        }
      } else {
        Array.from(element.childNodes).forEach(walk);
      }
    }
  };

  Array.from(el.childNodes).forEach(walk);
  return text.replace(/\n$/, '');
}

// Scans active cell or formula bar values
function handleSheetsCellSelection() {
  // Google Sheets formula bar input element has ID "t-formula-bar-input"
  const formulaInput = document.getElementById('t-formula-bar-input');
  if (!formulaInput) return;

  const cellText = getFormulaBarText(formulaInput);
  if (!cellText.trim()) {
    removeSheetsPreviewButton();
    return;
  }

  // Explicitly wrapped in markdown codeblock is a perfect match
  const isExplicit = /^```(?:markdown|md|math)?\s*[\s\S]*?\s*```$/i.test(cellText.trim());

  // Basic check to see if the cell contains Markdown content
  const looksLikeMarkdown =
    isExplicit ||
    cellText.includes('#') ||
    cellText.includes('`') ||
    cellText.includes('- [ ]') ||
    cellText.includes('|') ||
    cellText.includes('$') ||
    cellText.startsWith('- ') ||
    cellText.startsWith('* ');

  if ((isExplicit || looksLikeMarkdown) && cellText.trim().length > 3) {
    injectSheetsPreviewButton(cellText);
  } else {
    removeSheetsPreviewButton();
  }
}

function injectSheetsPreviewButton(cellText: string) {
  if (document.getElementById('md-sheets-preview-btn')) {
    // If it already exists, just update its click listener or it will re-read automatically
    return;
  }

  const btn = document.createElement('button');
  btn.id = 'md-sheets-preview-btn';
  btn.className = 'glass-overlay-button';
  btn.innerHTML = `<img src="${chrome.runtime.getURL('assets/icon_16.png')}" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 6px;" /> Markdown Cell`;

  btn.style.position = 'fixed';
  btn.style.zIndex = '999999999';

  function applyPosition(pos: string) {
    btn.style.top = 'auto';
    btn.style.bottom = 'auto';
    btn.style.left = 'auto';
    btn.style.right = 'auto';
    const margin = '24px';
    if (pos === 'bottom-left') {
      btn.style.bottom = margin;
      btn.style.left = margin;
    } else if (pos === 'top-right') {
      btn.style.top = margin;
      btn.style.right = margin;
    } else if (pos === 'top-left') {
      btn.style.top = margin;
      btn.style.left = margin;
    } else {
      btn.style.bottom = margin;
      btn.style.right = margin;
    }
  }

  chrome.storage.local.get(['sheetsBtnPosition'], (res) => {
    if (!isContextValid() || chrome.runtime.lastError) return;
    applyPosition(res.sheetsBtnPosition || 'bottom-right');
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (!isContextValid()) return;
    if (changes.sheetsBtnPosition) {
      applyPosition((changes.sheetsBtnPosition.newValue as string) || 'bottom-right');
    }
  });

  document.body.appendChild(btn);

  btn.addEventListener('click', () => {
    // Re-read latest formula text in case it was edited
    const formulaInput = document.getElementById('t-formula-bar-input');
    const latestFormula = formulaInput ? getFormulaBarText(formulaInput) : cellText;
    openSheetsMarkdownModal(latestFormula);
  });
}

function removeSheetsPreviewButton() {
  const btn = document.getElementById('md-sheets-preview-btn');
  if (btn) btn.remove();
}

function openSheetsMarkdownModal(markdownText: string) {
  closeSheetsMarkdownModal();

  // Clean/strip outer markdown code block wrapper if present to avoid rendering as raw codeblock
  let cleanText = markdownText.trim();
  const match = cleanText.match(/^```(?:markdown|md|math)?\n?([\s\S]*?)\n?```$/i);
  if (match) {
    cleanText = match[1];
  }

  const { container, shadowRoot } = createShadowContainer('md-sheets-modal-container');

  // Fullscreen glassmorphic modal overlay
  container.style.position = 'fixed';
  container.style.inset = '0';
  container.style.backgroundColor = 'rgba(0,0,0,0.5)';
  container.style.backdropFilter = 'blur(6px)';
  container.style.display = 'flex';
  container.style.justifyContent = 'center';
  container.style.alignItems = 'center';

  const modalBox = document.createElement('div');
  modalBox.style.width = '850px';
  modalBox.style.maxWidth = '90vw';
  modalBox.style.maxHeight = '80vh';
  modalBox.style.borderRadius = '12px';
  modalBox.style.overflow = 'hidden';
  modalBox.style.display = 'flex';
  modalBox.style.flexDirection = 'column';
  modalBox.style.backgroundColor = 'var(--bg-primary)';
  modalBox.style.border = '1px solid var(--border-color)';
  modalBox.style.boxShadow = '0 20px 40px rgba(0,0,0,0.3)';

  const modalHeader = document.createElement('div');
  modalHeader.style.padding = '1rem';
  modalHeader.style.display = 'flex';
  modalHeader.style.justifyContent = 'space-between';
  modalHeader.style.alignItems = 'center';
  modalHeader.style.borderBottom = '1px solid var(--border-color)';
  modalHeader.style.background = 'var(--bg-secondary)';

  const title = document.createElement('div');
  title.style.display = 'flex';
  title.style.alignItems = 'center';
  title.style.gap = '8px';
  title.innerHTML = `<img src="${chrome.runtime.getURL('assets/icon_16.png')}" style="width: 18px; height: 18px;" /><span style="font-weight: bold; color: var(--text-primary);">Markdown Cell Render</span>`;

  const closeBtn = document.createElement('button');
  closeBtn.innerText = '✕';
  closeBtn.style.background = 'none';
  closeBtn.style.border = 'none';
  closeBtn.style.fontSize = '16px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.color = 'var(--text-muted)';
  closeBtn.addEventListener('click', closeSheetsMarkdownModal);

  modalHeader.appendChild(title);
  modalHeader.appendChild(closeBtn);

  const modalBody = document.createElement('div');
  modalBody.style.padding = '1.5rem';
  modalBody.style.overflowY = 'auto';
  modalBody.className = 'markdown-body';
  try {
    modalBody.innerHTML = renderMarkdown(cleanText);
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);
    modalBody.innerHTML = `
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

  modalBox.appendChild(modalHeader);
  modalBox.appendChild(modalBody);
  shadowRoot.appendChild(modalBox);

  // Close when clicking modal backdrop background
  container.addEventListener('click', (e) => {
    const path = e.composedPath();
    if (path.includes(modalBox)) {
      return;
    }
    closeSheetsMarkdownModal();
  });

  document.body.appendChild(container);

  // Sync themes
  updateTheme();

  // Lazy render diagrams
  renderDiagrams(modalBody, isDark);
}

function closeSheetsMarkdownModal() {
  const container = document.getElementById('md-sheets-modal-container');
  if (container) container.remove();
}

// Watch sheets cell selection and edits with dynamic toggle support.
if (window.isMdSheetsContextValid && window.isMdSheetsContextValid()) {
  console.log('Workspace Toolkit for Google Sheets: Valid instance already running.');
} else {
  console.log('Workspace Toolkit for Google Sheets: Initializing...');
  // Clean up old UI elements
  removeSheetsPreviewButton();
  closeSheetsMarkdownModal();

  window.isMdSheetsContextValid = () => isContextValid();
  window.mdSheetsActive = true;

  let sheetsObserver: MutationObserver | null = null;

  const handleSheetsCellSelectionWrapper = () => {
    if (!isContextValid()) {
      if (sheetsObserver) {
        sheetsObserver.disconnect();
        sheetsObserver = null;
      }
      removeSheetsPreviewButton();
      closeSheetsMarkdownModal();
      return;
    }
    handleSheetsCellSelection();
  };

  const debouncedSheetsMutation = debounce(handleSheetsCellSelectionWrapper, 300);

  const startObserving = () => {
    if (sheetsObserver) return;
    sheetsObserver = observeDOM(document.body, () => {
      if (!isContextValid()) {
        if (sheetsObserver) {
          sheetsObserver.disconnect();
          sheetsObserver = null;
        }
        removeSheetsPreviewButton();
        closeSheetsMarkdownModal();
        return;
      }
      if (window.mdSheetsActive) {
        debouncedSheetsMutation();
      }
    });
    debouncedSheetsMutation();
  };

  const stopObserving = () => {
    if (sheetsObserver) {
      sheetsObserver.disconnect();
      sheetsObserver = null;
    }
    removeSheetsPreviewButton();
    closeSheetsMarkdownModal();
  };

  chrome.runtime.onMessage.addListener((message) => {
    if (!isContextValid()) return;
    if (message.type === 'INTEGRATION_STATE_CHANGE' && message.section === 'sheets') {
      window.mdSheetsActive = message.enabled;
      if (message.enabled) {
        startObserving();
      } else {
        stopObserving();
      }
    }
  });

  // Start initially
  startObserving();
}

console.log('Workspace Toolkit for Google Sheets Content Script Loaded Successfully.');
