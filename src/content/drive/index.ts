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

let isDark = true;
getThemePreference((dark) => {
  isDark = dark;
  updateTheme();
  injectGlobalButtonStyles(isDark);
});

function updateTheme() {
  const container = document.getElementById('md-drive-preview-container');
  if (container && container.shadowRoot) {
    const root = container.shadowRoot.host as HTMLElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }
}

/**
 * -----------------------------------------------------------------------------
 * GOOGLE DRIVE PREVIEW DETECTION WORKAROUNDS (OPEN SOURCE / MV3 COMPATIBLE)
 * -----------------------------------------------------------------------------
 * Google Drive dynamically renders previews using complex, sandboxed, and asynchronous
 * layouts. To robustly detect and render Markdown previews, this script uses:
 *
 * 1. STRING SUBSTRING MATCHING: Google Drive's filename containers in the top bar
 *    also contain action buttons (e.g. "Open with", "Print"). If we read `textContent`,
 *    the names of these actions are concatenated with the filename (e.g., "README.mdOpen with").
 *    We extract the true filename by searching for the extension index and cutting the string.
 *
 * 2. ASYNCHRONOUS POLLING RETRY: The filename container renders instantly, but the
 *    actual text container (iframe/pre) takes up to 1.5 seconds to fetch and load.
 *    We run a high-performance 200ms polling cycle to inject the button as soon as
 *    the content frame becomes accessible, avoiding race conditions.
 */

function isElementVisible(el: HTMLElement): boolean {
  if (el.offsetWidth === 0 && el.offsetHeight === 0) {
    return false;
  }

  const dialog = el.closest('[role="dialog"]');
  if (dialog) {
    const dialogEl = dialog as HTMLElement;
    if (dialogEl.offsetWidth === 0 && dialogEl.offsetHeight === 0) {
      return false;
    }
  }

  return true;
}

// Helper to find the preview header and extract the filename robustly.
function findPreviewHeader(): {
  element: HTMLElement;
  fileName: string;
  fileId: string | null;
} | null {
  // Check if we are on a standalone viewer page (direct view)
  const urlMatch = window.location.href.match(/[/]file[/]d[/]([^/]+)/);
  if (urlMatch && window.location.href.includes('/view')) {
    const fileId = urlMatch[1];
    const titleText = document.title || '';
    const suffixes = [' - Google Drive', ' - Google Viewer', ' - Google Docs', ' - Google Sheets'];
    let fileName = titleText;
    for (const suffix of suffixes) {
      if (fileName.endsWith(suffix)) {
        fileName = fileName.substring(0, fileName.length - suffix.length);
        break;
      }
    }
    const extensions = ['.md', '.markdown', '.txt'];
    const hasMarkdownExt = extensions.some((ext) => fileName.toLowerCase().endsWith(ext));
    if (hasMarkdownExt) {
      const headerEl = document.querySelector(
        '.ndfHFb-c516Te, .a-da-Ia-T-A, [role="heading"]'
      ) as HTMLElement;
      return { element: headerEl || document.body, fileName, fileId };
    }
  }

  // Query all headings, dialog titles, and any divs/spans inside dialogs to capture filename robustly
  const candidates = document.querySelectorAll(
    '[role="dialog"] div, [role="dialog"] span, [role="dialog"] [role="heading"], .ndfHFb-c516Te div, .ndfHFb-c516Te span, .a-da-Ia-T-A, [role="heading"]'
  );

  const extensions = ['.md', '.markdown', '.txt'];
  for (const el of Array.from(candidates)) {
    const htmlEl = el as HTMLElement;
    if (!isElementVisible(htmlEl)) {
      continue;
    }

    const text = htmlEl.textContent?.trim() || '';

    // Attempt to extract metadata JSON if Drive inlined it
    const idMatch = text.match(/"id"\s*:\s*"([^"]+)"/);
    const titleMatch = text.match(/"title"\s*:\s*"([^"]+)"/);

    if (idMatch && titleMatch) {
      const fileId = idMatch[1];
      const fileName = titleMatch[1];
      const hasMarkdownExt = extensions.some((ext) => fileName.toLowerCase().endsWith(ext));
      if (hasMarkdownExt) {
        return { element: htmlEl, fileName, fileId };
      }
    }

    // Fallback substring matching for plain elements
    for (const ext of extensions) {
      const idx = text.toLowerCase().indexOf(ext);
      if (idx !== -1) {
        // Cut the string right after the extension to eliminate any concatenated button text
        const fileName = text.substring(0, idx + ext.length).trim();
        // Filename is single-line, clean, and under 100 characters
        if (fileName.length < 100 && !fileName.includes('\n')) {
          // Try to extract file ID from URL as final fallback
          const urlMatch = window.location.href.match(/[/]file[/]d[/]([^/]+)/);
          const fileId = urlMatch ? urlMatch[1] : null;
          return { element: htmlEl, fileName, fileId };
        }
      }
    }
  }
  return null;
}

// Helper to locate the actual document viewer where raw text is displayed.
function findTextContainer(): HTMLElement | null {
  // 1. Check for standard preformatted text viewers
  const pre = document.querySelector('pre');
  if (pre && isElementVisible(pre)) return pre;

  // 2. Check for legacy text viewer classes
  const classContainer = document.querySelector('.a-d-kb');
  if (classContainer && isElementVisible(classContainer as HTMLElement))
    return classContainer as HTMLElement;

  // 3. Scan all variations of Drive document preview iframe containers
  const iframeSelectors = [
    'iframe.a-da-Ia-d',
    'iframe[src*="viewer"]',
    'iframe[src*="drive.google.com/viewer"]',
    'iframe[src*="docs.google.com/viewer"]',
    'iframe[title="Preview"]',
    '.ndfHFb-c516Te-bN97Pc iframe',
    '[role="dialog"] iframe',
    'iframe', // Fallback to any iframe on the page when preview modal is active
  ];

  for (const sel of iframeSelectors) {
    const iframe = document.querySelector(sel);
    if (iframe && isElementVisible(iframe as HTMLElement)) return iframe as HTMLElement;
  }

  return null;
}

let driveObservers: MutationObserver[] = [];
let retryInterval: ReturnType<typeof setInterval> | null = null;
let lastHeaderId: string | null = null;
let lastHeaderName: string | null = null;
let iframeRawText: string | null = null;

function cleanupOldContext() {
  if (retryInterval) {
    clearInterval(retryInterval);
    retryInterval = null;
  }
  driveObservers.forEach((obs) => obs.disconnect());
  driveObservers = [];
  const btn = document.getElementById('md-preview-toggle-btn');
  if (btn) btn.remove();
  const preview = document.getElementById('md-drive-preview-container');
  if (preview) preview.remove();
}

// Scans Google Drive preview modal to check if it's displaying a Markdown file.
function handlePreviewMutation() {
  if (!isContextValid()) {
    cleanupOldContext();
    return;
  }
  const headerInfo = findPreviewHeader();

  if (!headerInfo) {
    if (lastHeaderId !== null || lastHeaderName !== null) {
      console.log('[Workspace Toolkit for Google] Preview closed.');
      lastHeaderId = null;
      lastHeaderName = null;
      iframeRawText = null;
    }
    if (retryInterval) {
      clearInterval(retryInterval);
      retryInterval = null;
    }
    return;
  }

  const { fileName, fileId } = headerInfo;

  if (fileId !== lastHeaderId || fileName !== lastHeaderName) {
    console.log('[Workspace Toolkit for Google] Scanned for preview header:', headerInfo);

    // Clean up old elements from previous file preview if they exist
    const btn = document.getElementById('md-preview-toggle-btn');
    if (btn) btn.remove();
    const preview = document.getElementById('md-drive-preview-container');
    if (preview) preview.remove();

    // Clear any active polling from the previous file preview
    if (retryInterval) {
      clearInterval(retryInterval);
      retryInterval = null;
    }

    // Reset iframe raw text for the new file
    iframeRawText = null;

    lastHeaderId = fileId;
    lastHeaderName = fileName;
  }

  if (document.getElementById('md-preview-toggle-btn')) {
    return;
  }

  // Try to find the text container
  const textContainer = findTextContainer();

  if (textContainer) {
    if (retryInterval) {
      clearInterval(retryInterval);
      retryInterval = null;
    }
    injectPreviewToggle(textContainer as HTMLElement, fileId);
    return;
  }

  // If header is found but textContainer is not loaded yet, start polling
  if (!retryInterval) {
    console.log(
      '[Workspace Toolkit for Google] Header found but textContainer missing. Starting polling retry...'
    );
    let attempts = 0;
    retryInterval = setInterval(() => {
      attempts++;
      const container = findTextContainer();
      if (container) {
        clearInterval(retryInterval!);
        retryInterval = null;
        if (!document.getElementById('md-preview-toggle-btn')) {
          injectPreviewToggle(container as HTMLElement, fileId);
        }
      } else if (attempts > 30) {
        // 6 seconds maximum wait
        console.log('[Workspace Toolkit for Google] Polling retry timed out.');
        clearInterval(retryInterval!);
        retryInterval = null;
      }
    }, 200);
  }
}

function requestTextFromIframes() {
  const iframes = document.querySelectorAll('iframe');
  iframes.forEach((iframe) => {
    try {
      iframe.contentWindow?.postMessage({ type: 'WORKSPACE_TOOLKIT_FOR_GOOGLE_REQUEST_TEXT' }, '*');
    } catch (err) {
      // Ignore
    }
  });
}

function injectPreviewToggle(textContainer: HTMLElement, fileId: string | null) {
  // Create our glassmorphic action button.
  const button = document.createElement('button');
  button.id = 'md-preview-toggle-btn';
  button.className = 'glass-overlay-button';
  button.innerHTML = `<img src="${chrome.runtime.getURL('assets/icon_16.png')}" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 6px;" /> Preview Markdown`;

  // Set premium glassmorphic inline styles to ensure it remains beautifully styled in the host DOM
  button.style.position = 'fixed';
  button.style.zIndex = '999999999'; // Lay on top of any other Google DOM structures

  // Apply position logic
  function applyPosition(pos: string) {
    button.style.top = 'auto';
    button.style.bottom = 'auto';
    button.style.left = 'auto';
    button.style.right = 'auto';
    const margin = '24px';
    if (pos === 'bottom-left') {
      button.style.bottom = margin;
      button.style.left = margin;
    } else if (pos === 'top-right') {
      button.style.top = margin;
      button.style.right = margin;
    } else if (pos === 'top-left') {
      button.style.top = margin;
      button.style.left = margin;
    } else {
      // default: bottom-right
      button.style.bottom = margin;
      button.style.right = margin;
    }
  }

  chrome.storage.local.get(['driveBtnPosition'], (res) => {
    if (!isContextValid() || chrome.runtime.lastError) return;
    applyPosition(res.driveBtnPosition || 'bottom-right');
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (!isContextValid()) return;
    if (changes.driveBtnPosition) {
      applyPosition((changes.driveBtnPosition.newValue as string) || 'bottom-right');
    }
  });

  // Inject into document body
  document.body.appendChild(button);

  // Request text from iframes immediately to avoid race condition
  requestTextFromIframes();

  let isPreviewMode = false;
  const originalDisplay = textContainer.style.display;

  button.addEventListener('click', async () => {
    isPreviewMode = !isPreviewMode;

    if (isPreviewMode) {
      button.innerHTML =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg> Show Raw Text';

      let rawText = '';
      let fetchSuccess = false;

      // 1. Try to read directly from the DOM or iframe (same-origin) first. It is synchronous and instant.
      if (textContainer.tagName === 'IFRAME') {
        const iframe = textContainer as HTMLIFrameElement;
        try {
          const doc = iframe.contentDocument || iframe.contentWindow?.document;
          if (doc && doc.body) {
            rawText = doc.body.innerText || doc.body.textContent || '';
            if (rawText.trim().length > 0) {
              fetchSuccess = true;
            }
          }
        } catch (err) {
          // Cross-origin iframe, we must rely on postMessage (iframeRawText)
        }
      } else {
        rawText = textContainer.innerText || textContainer.textContent || '';
        if (rawText.trim().length > 0) {
          fetchSuccess = true;
        }
      }

      // 2. If direct read failed (cross-origin), check if we already have iframeRawText from postMessage
      if (!fetchSuccess && iframeRawText) {
        rawText = iframeRawText;
        fetchSuccess = true;
      }

      // 3. If still no text and it's an iframe, wait for postMessage (max 1.5 seconds instead of 5s)
      if (!fetchSuccess && textContainer.tagName === 'IFRAME') {
        requestTextFromIframes();
        button.innerHTML = '⏳ Loading...';
        button.style.opacity = '0.7';
        button.style.cursor = 'wait';

        const waited = await new Promise<string>((resolve) => {
          let elapsed = 0;
          const poll = setInterval(() => {
            elapsed += 100;
            if (iframeRawText) {
              clearInterval(poll);
              resolve(iframeRawText);
            } else if (elapsed >= 1500) {
              // 1.5 seconds timeout
              clearInterval(poll);
              resolve('');
            }
          }, 100);
        });

        button.style.opacity = '';
        button.style.cursor = '';

        if (waited) {
          rawText = waited;
          fetchSuccess = true;
        }
      }

      // 4. Fallback: Fetch raw content directly from Drive export URL using fileId
      if (!fetchSuccess && fileId) {
        try {
          button.innerHTML = '⏳ Loading...';
          button.style.opacity = '0.7';
          button.style.cursor = 'wait';
          const exportUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
          const resp = await fetch(exportUrl, { credentials: 'include' });
          if (resp.ok) {
            rawText = await resp.text();
            if (rawText.trim().length > 0) {
              fetchSuccess = true;
            }
          }
        } catch (fetchErr) {
          console.warn('[Workspace Toolkit for Google] Direct fetch fallback failed:', fetchErr);
        } finally {
          button.style.opacity = '';
          button.style.cursor = '';
        }
      }

      // 5. Fallback error message if everything failed

      if (!fetchSuccess) {
        rawText =
          '# Error\nCould not extract text from the file preview. It might be a cross-origin security restriction or the file is still loading.';
      }

      // 5. Restore button text in case it was stuck on Loading...
      button.innerHTML =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg> Show Raw Text';

      // Hide the native viewer
      textContainer.style.display = 'none';

      // Create and inject our beautiful Markdown Preview Shadow Container
      const { container, shadowRoot } = createShadowContainer('md-drive-preview-container');
      container.style.position = 'fixed'; // FIXED positioning ensures it overlays the modal perfectly
      container.style.top = '60px'; // Align nicely below header
      container.style.left = '10%';
      container.style.width = '80%';
      container.style.height = 'calc(100% - 120px)';
      container.style.overflow = 'hidden';
      container.style.borderRadius = '12px';
      container.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
      container.style.zIndex = '99999998'; // Lay on top of Drive preview backdrop

      // Explicitly allow mouse select and pointer events inside fixed preview container
      container.style.pointerEvents = 'auto';
      container.style.userSelect = 'text';
      container.style.setProperty('-webkit-user-select', 'text');

      // Enable keyboard focus for arrow/space/page key scrolling
      container.tabIndex = 0;
      container.style.outline = 'none';

      // Prevent Google Drive's global scroll lock from intercepting scroll inputs
      container.addEventListener(
        'wheel',
        (e) => {
          e.stopPropagation();
        },
        { passive: true }
      );

      container.addEventListener(
        'touchmove',
        (e) => {
          e.stopPropagation();
        },
        { passive: true }
      );

      container.addEventListener(
        'keydown',
        (e) => {
          const scrollKeys = [
            'Space',
            'ArrowUp',
            'ArrowDown',
            'PageUp',
            'PageDown',
            'Home',
            'End',
            ' ',
          ];
          if (scrollKeys.includes(e.code) || scrollKeys.includes(e.key)) {
            e.stopPropagation();
          }
        },
        { passive: true }
      );

      const mdBody = document.createElement('div');
      mdBody.className = 'markdown-body';
      mdBody.style.pointerEvents = 'auto';
      mdBody.style.userSelect = 'text';
      mdBody.style.setProperty('-webkit-user-select', 'text');
      mdBody.style.height = '100%';
      mdBody.style.overflowY = 'auto';
      mdBody.style.boxSizing = 'border-box';
      try {
        mdBody.innerHTML = renderMarkdown(rawText);
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : String(err);
        mdBody.innerHTML = `
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
      shadowRoot.appendChild(mdBody);

      // Insert directly into document body to prevent height collapse layouts!
      document.body.appendChild(container);

      // Apply initial theme
      updateTheme();

      // Async render diagrams (Mermaid)
      await renderDiagrams(mdBody, isDark);
    } else {
      button.innerHTML = `<img src="${chrome.runtime.getURL('assets/icon_16.png')}" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 6px;" /> Preview Markdown`;

      // Restore native text viewer
      textContainer.style.display = originalDisplay;

      // Remove preview container
      const preview = document.getElementById('md-drive-preview-container');
      if (preview) preview.remove();
    }
  });
}

if (window.isMdDriveContextValid && window.isMdDriveContextValid()) {
  console.log('Workspace Toolkit for Google Drive: Valid instance already running.');
} else {
  console.log('Workspace Toolkit for Google Drive: Initializing...');
  cleanupOldContext();

  window.isMdDriveContextValid = () => isContextValid();
  window.mdDriveActive = true;

  const debouncedMutation = debounce(() => {
    if (!isContextValid()) {
      cleanupOldContext();
      return;
    }
    handlePreviewMutation();
  }, 300);

  const startObserving = () => {
    if (!isContextValid()) {
      cleanupOldContext();
      return;
    }
    if (driveObservers.length > 0) return;

    // Observer 1: Clean up buttons when preview is closed
    const cleanupObs = observeDOM(document.body, () => {
      if (!isContextValid()) {
        cleanupOldContext();
        return;
      }
      if (!window.mdDriveActive) return;
      const headerInfo = findPreviewHeader();
      if (!headerInfo) {
        if (retryInterval) {
          clearInterval(retryInterval);
          retryInterval = null;
        }
        const btn = document.getElementById('md-preview-toggle-btn');
        if (btn) btn.remove();
        const preview = document.getElementById('md-drive-preview-container');
        if (preview) preview.remove();
      }
    });

    // Observer 2: Watch for Drive preview modal opens
    const mainObs = observeDOM(document.body, () => {
      if (!isContextValid()) {
        cleanupOldContext();
        return;
      }
      if (window.mdDriveActive) {
        debouncedMutation();
      }
    });

    driveObservers.push(cleanupObs, mainObs);
    debouncedMutation();
  };

  const stopObserving = () => {
    cleanupOldContext();
  };

  chrome.runtime.onMessage.addListener((message) => {
    if (!isContextValid()) return;
    if (message.type === 'INTEGRATION_STATE_CHANGE' && message.section === 'drive') {
      window.mdDriveActive = message.enabled;
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

console.log('Workspace Toolkit for Google Drive Content Script Loaded Successfully.');

// -----------------------------------------------------------------------------
// CROSS-ORIGIN IFRAME RAW TEXT EXTRACTION SYSTEM (PARENT LISTENER)
// -----------------------------------------------------------------------------
function handleIframeMessage(event: MessageEvent) {
  if (!isContextValid()) {
    window.removeEventListener('message', handleIframeMessage);
    return;
  }
  if (event.data && event.data.type === 'WORKSPACE_TOOLKIT_FOR_GOOGLE_RAW_TEXT') {
    iframeRawText = event.data.text;
    console.log(
      '[Workspace Toolkit for Google] Raw text received from iframe. Length:',
      iframeRawText?.length
    );
  }
}
window.addEventListener('message', handleIframeMessage);
