/**
 * Background service worker for Google Workspace Toolkits.
 *
 * Responsibilities:
 * - Opens the side panel when the extension icon is clicked.
 * - Registers and unregisters content scripts based on the user's enabled
 *   integrations and the permissions that have been granted.
 * - Adds a declarativeNetRequest rule to bypass CORS on Drive preview downloads.
 * - Proxies authenticated `fetch` requests on behalf of content scripts that
 *   cannot perform cross-origin fetches directly.
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log('Google Workspace Toolkits Chrome Extension Installed.');

  // Set default settings
  chrome.storage.local.get(['themeMode'], (result: { themeMode?: string }) => {
    if (!result.themeMode) {
      chrome.storage.local.set({ themeMode: 'auto' }, () => {
        console.log('Default theme set to auto.');
      });
    }
  });

  // Enable Side Panel on extension icon click
  if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
  }

  // Register dynamic rules to bypass CORS on download redirects
  if (chrome.declarativeNetRequest) {
    const rules: chrome.declarativeNetRequest.Rule[] = [
      {
        id: 1,
        priority: 1,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
          responseHeaders: [
            {
              header: 'Access-Control-Allow-Origin',
              operation: chrome.declarativeNetRequest.HeaderOperation.SET,
              value: 'https://drive.google.com',
            },
            {
              header: 'Access-Control-Allow-Credentials',
              operation: chrome.declarativeNetRequest.HeaderOperation.SET,
              value: 'true',
            },
            {
              header: 'Access-Control-Allow-Headers',
              operation: chrome.declarativeNetRequest.HeaderOperation.SET,
              value: '*',
            },
          ],
        },
        condition: {
          urlFilter: 'googleusercontent.com',
        },
      },
    ];

    chrome.declarativeNetRequest.getDynamicRules((existingRules) => {
      const existingIds = existingRules.map((r) => r.id);
      chrome.declarativeNetRequest.updateDynamicRules(
        {
          removeRuleIds: existingIds,
          addRules: rules,
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error(
              '[Google Workspace Toolkits] Failed to register dynamic rules:',
              chrome.runtime.lastError.message
            );
          } else {
            console.log(
              '[Google Workspace Toolkits] Dynamic CORS bypass rules registered successfully.'
            );
          }
        }
      );
    });
  }
});

// Listener to handle safe, CORS-free network fetches on behalf of content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_URL') {
    fetch(message.url, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Fetch failed with status ${res.status}`);
        }
        return res.text();
      })
      .then((text) => {
        sendResponse({ success: true, text });
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep the message channel open for async response
  }
});

// Sync registered content scripts on background startup
async function syncContentScriptRegistrations() {
  const SECTIONS = {
    docs: {
      origins: ['https://docs.google.com/document/*'],
      scripts: [
        {
          id: 'content-docs',
          js: ['content-docs.js'],
          matches: ['https://docs.google.com/document/*'],
          runAt: 'document_end',
        },
      ],
    },
    sheets: {
      origins: ['https://docs.google.com/spreadsheets/*'],
      scripts: [
        {
          id: 'content-sheets',
          js: ['content-sheets.js'],
          matches: ['https://docs.google.com/spreadsheets/*'],
          runAt: 'document_end',
        },
      ],
    },
    drive: {
      origins: [
        'https://drive.google.com/*',
        'https://drive.usercontent.google.com/*',
        'https://*.googleusercontent.com/*',
        'https://docs.google.com/*',
      ],
      scripts: [
        {
          id: 'content-drive',
          js: ['content-drive.js'],
          matches: ['https://drive.google.com/*'],
          runAt: 'document_end',
        },
        {
          id: 'content-drive-iframe',
          js: ['content-drive-iframe.js'],
          matches: [
            'https://drive.google.com/*',
            'https://docs.google.com/*',
            'https://*.googleusercontent.com/*',
          ],
          allFrames: true,
          runAt: 'document_end',
        },
      ],
    },
  };

  for (const [key, config] of Object.entries(SECTIONS)) {
    try {
      const hasPermission = await chrome.permissions.contains({
        origins: config.origins,
      });

      const scriptIds = config.scripts.map((s) => s.id);

      if (hasPermission) {
        // Unregister first to avoid duplicates
        try {
          await chrome.scripting.unregisterContentScripts({ ids: scriptIds });
        } catch (e) {
          // Ignore
        }
        // Register script
        await chrome.scripting.registerContentScripts(
          config.scripts as chrome.scripting.RegisteredContentScript[]
        );
        console.log(`[Background] Registered content scripts for ${key}`);
      } else {
        // Unregister script if permission is not granted
        try {
          await chrome.scripting.unregisterContentScripts({ ids: scriptIds });
        } catch (e) {
          // Ignore
        }
      }
    } catch (err) {
      console.error(`[Background] Failed to sync scripts for ${key}:`, err);
    }
  }
}

syncContentScriptRegistrations();
