console.log(
  '[Workspace Toolkit for Google Iframe] Script injected. Frame URL:',
  window.location.href
);

const isIframe = window !== window.parent;

// Simple native observeDOM helper to avoid importing chrome API-dependent utils
function observeDOM(
  targetNode: HTMLElement,
  callback: MutationCallback,
  options: MutationObserverInit = { childList: true, subtree: true }
): MutationObserver {
  const observer = new MutationObserver(callback);
  observer.observe(targetNode, options);
  return observer;
}

// Helper to locate the actual document viewer where raw text is displayed inside the Google iframe.
function findTextContainer(): HTMLElement | null {
  const pre = document.querySelector('pre');
  if (pre) return pre;

  const classContainer = document.querySelector('.a-d-kb');
  if (classContainer) return classContainer as HTMLElement;

  return null;
}

const sendTextToParent = () => {
  const textContainer = findTextContainer();
  if (textContainer) {
    const text = textContainer.innerText || textContainer.textContent || '';
    if (text) {
      console.log(
        '[Workspace Toolkit for Google Iframe] Text found! Sending to parent. Length:',
        text.length
      );
      window.parent.postMessage({ type: 'WORKSPACE_TOOLKIT_FOR_GOOGLE_RAW_TEXT', text }, '*');
    }
  }
};

if (isIframe) {
  // Start extraction and observe changes inside the preview iframe
  if (document.body) {
    sendTextToParent();
    observeDOM(document.body, () => {
      sendTextToParent();
    });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      sendTextToParent();
      observeDOM(document.body, () => {
        sendTextToParent();
      });
    });
  }

  // Listen for parent requests to re-send the text (avoids postMessage race conditions)
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'WORKSPACE_TOOLKIT_FOR_GOOGLE_REQUEST_TEXT') {
      sendTextToParent();
    }
  });
}
