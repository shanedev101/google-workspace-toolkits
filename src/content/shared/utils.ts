/**
 * Returns a debounced version of the given function that delays invoking it
 * until after `wait` milliseconds have elapsed since the last invocation.
 */
export function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>): void => {
    if (timeout !== null) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Creates a MutationObserver watching `targetNode` and calls `callback` on
 * any matching DOM mutations. Returns the observer so the caller can
 * disconnect it when no longer needed.
 */
export function observeDOM(
  targetNode: HTMLElement,
  callback: MutationCallback,
  options: MutationObserverInit = { childList: true, subtree: true }
): MutationObserver {
  const observer = new MutationObserver(callback);
  observer.observe(targetNode, options);
  return observer;
}

/**
 * Returns `true` when the Chrome extension context is still alive and the
 * `chrome.runtime.id` is present. Should be checked before any chrome.*
 * API call in long-lived content scripts to avoid "Extension context
 * invalidated" errors after updates.
 */
export function isContextValid(): boolean {
  return (
    typeof chrome !== 'undefined' && typeof chrome.runtime !== 'undefined' && !!chrome.runtime.id
  );
}

/**
 * Reads the stored `themeMode` preference and invokes `callback` immediately
 * with the resolved boolean (true = dark). Also registers a storage-change
 * listener so `callback` is called again whenever the preference changes.
 */
export function getThemePreference(callback: (isDark: boolean) => void): void {
  if (!isContextValid()) return;

  chrome.storage.local.get(['themeMode'], (result) => {
    // chrome.runtime.lastError is accessed via type assertion because
    // @types/chrome does not expose it on the storage callback signature.
    if (!isContextValid() || (chrome.runtime as { lastError?: unknown }).lastError) return;
    const mode = result.themeMode || 'auto';
    if (mode === 'auto') {
      const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      callback(systemIsDark);
    } else {
      callback(mode === 'dark');
    }
  });

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes) => {
    if (!isContextValid()) return;
    if (changes.themeMode) {
      const mode = (changes.themeMode.newValue as string) || 'auto';
      if (mode === 'auto') {
        const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        callback(systemIsDark);
      } else {
        callback(mode === 'dark');
      }
    }
  });
}

/**
 * Injects (or updates) a `<style>` element into the host page's `<head>` that
 * defines the `.glass-overlay-button` CSS class. Called with the current
 * theme so colors are baked directly into the rule set, since the host page
 * does not share our extension's CSS variables.
 */
export function injectGlobalButtonStyles(isDark: boolean = false) {
  const styleId = 'md-workspace-global-button-styles';
  let styleEl = document.getElementById(styleId) as HTMLStyleElement;

  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }

  // The CSS uses a class .glass-overlay-button and supports .dark parent if needed,
  // but since it's injected directly into the main document (which might not have .dark),
  // we dynamically inject the specific colors based on the `isDark` argument.

  const textColor = isDark ? '#c9d1d9' : '#24292f';
  const bgOverlay = isDark ? 'rgba(22, 27, 34, 0.85)' : 'rgba(255, 255, 255, 0.9)';
  const borderCol = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)';
  const hoverBorder = isDark ? 'rgba(138, 180, 248, 0.5)' : 'rgba(66, 133, 244, 0.5)';
  const hoverColor = isDark ? '#8ab4f8' : '#4285f4';
  const shadow = isDark
    ? '0 8px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2)'
    : '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)';
  const hoverShadow = isDark
    ? '0 12px 36px rgba(0, 0, 0, 0.5), 0 4px 12px rgba(0, 0, 0, 0.3)'
    : '0 12px 36px rgba(0, 0, 0, 0.18), 0 4px 12px rgba(0, 0, 0, 0.12)';

  styleEl.textContent = `
    .glass-overlay-button {
      background: ${bgOverlay};
      backdrop-filter: blur(16px) saturate(180%);
      -webkit-backdrop-filter: blur(16px) saturate(180%);
      border: 1px solid ${borderCol};
      box-shadow: ${shadow};
      color: ${textColor};
      border-radius: 50px;
      padding: 10px 20px;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      white-space: nowrap;
      transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
      letter-spacing: 0.3px;
      position: relative;
      overflow: hidden;
      z-index: 999999;
    }
    .glass-overlay-button::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      border-radius: 50px;
      background: linear-gradient(45deg, rgba(66, 133, 244, 0.1), rgba(234, 67, 53, 0.1), rgba(251, 188, 5, 0.1), rgba(52, 168, 83, 0.1));
      opacity: 0;
      transition: opacity 0.3s ease;
      z-index: -1;
    }
    .glass-overlay-button:hover {
      transform: translateY(-3px) scale(1.02);
      box-shadow: ${hoverShadow};
      border-color: ${hoverBorder};
      color: ${hoverColor};
    }
    .glass-overlay-button:hover::before {
      opacity: 1;
    }
    .glass-overlay-button svg {
      flex-shrink: 0;
      transition: transform 0.3s ease;
    }
    .glass-overlay-button:hover svg {
      transform: translateY(2px);
    }
  `;
}
