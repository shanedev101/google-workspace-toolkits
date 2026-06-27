import './sidepanel.css';

interface SectionConfig {
  checkboxId: string;
  origins: string[];
  scripts: chrome.scripting.RegisteredContentScript[];
}

const SECTIONS: Record<string, SectionConfig> = {
  docs: {
    checkboxId: 'docs-enabled',
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
    checkboxId: 'sheets-enabled',
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
    checkboxId: 'drive-enabled',
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

const notifyTabsOfStateChange = async (key: string, enabled: boolean) => {
  const config = SECTIONS[key];
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id && tab.url) {
      // Check if tab URL matches the section origins
      const isMatch = config.origins.some((origin) => {
        const regex = new RegExp('^' + origin.replace(/\*/g, '.*'));
        return regex.test(tab.url!);
      });
      if (isMatch) {
        try {
          // Try sending message first
          await chrome.tabs.sendMessage(tab.id, {
            type: 'INTEGRATION_STATE_CHANGE',
            section: key,
            enabled,
          });
        } catch (e) {
          // If message fails (meaning script not injected yet), and we are enabling, inject it!
          if (enabled) {
            for (const script of config.scripts) {
              if (script.js) {
                for (const jsFile of script.js) {
                  try {
                    await chrome.scripting.executeScript({
                      target: {
                        tabId: tab.id,
                        allFrames: script.allFrames || false,
                      },
                      files: [jsFile],
                    });
                  } catch (err) {
                    console.error(`Failed dynamic injection into tab ${tab.id}:`, err);
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  const themeSelect = document.getElementById('md-theme') as HTMLSelectElement;
  const sheetsPositionSelect = document.getElementById('sheets-btn-position') as HTMLSelectElement;
  const drivePositionSelect = document.getElementById('drive-btn-position') as HTMLSelectElement;
  // Inject version from manifest into footer
  const versionEl = document.getElementById('app-version');
  if (versionEl) {
    const manifest = chrome.runtime.getManifest();
    versionEl.textContent = `v${manifest.version}`;
  }

  const mdState = await chrome.storage.local.get([
    'themeMode',
    'sheetsBtnPosition',
    'driveBtnPosition',
    'sectionOrder',
    'sectionStates',
  ]);
  if (mdState.themeMode) {
    themeSelect.value = mdState.themeMode;
  }
  if (mdState.sheetsBtnPosition) {
    sheetsPositionSelect.value = mdState.sheetsBtnPosition;
  }
  if (mdState.driveBtnPosition) {
    drivePositionSelect.value = mdState.driveBtnPosition;
  }

  // Restore saved accordion open/closed states
  const accordions = document.querySelectorAll('details.accordion');
  accordions.forEach((acc) => {
    const accordion = acc as HTMLDetailsElement;
    const id = accordion.getAttribute('data-id');
    if (id && mdState.sectionStates && mdState.sectionStates[id] !== undefined) {
      accordion.open = mdState.sectionStates[id];
    }
  });

  // Bind toggle listener to save accordion states
  accordions.forEach((acc) => {
    const accordion = acc as HTMLDetailsElement;
    accordion.addEventListener('toggle', async () => {
      const id = accordion.getAttribute('data-id');
      if (!id) return;

      const res = await chrome.storage.local.get(['sectionStates']);
      const sectionStates = res.sectionStates || {};
      sectionStates[id] = accordion.open;
      await chrome.storage.local.set({ sectionStates });
    });
  });

  // Restore saved section order
  const draggableContainer = document.getElementById('draggable-container') as HTMLElement;
  if (draggableContainer && mdState.sectionOrder) {
    mdState.sectionOrder.forEach((id: string) => {
      const el = draggableContainer.querySelector(`[data-id="${id}"]`);
      if (el) {
        draggableContainer.appendChild(el);
      }
    });
  }

  themeSelect.addEventListener('change', async (e) => {
    const theme = (e.target as HTMLSelectElement).value;
    await chrome.storage.local.set({ themeMode: theme });
  });

  sheetsPositionSelect.addEventListener('change', async (e) => {
    const pos = (e.target as HTMLSelectElement).value;
    await chrome.storage.local.set({ sheetsBtnPosition: pos });
  });

  drivePositionSelect.addEventListener('change', async (e) => {
    const pos = (e.target as HTMLSelectElement).value;
    await chrome.storage.local.set({ driveBtnPosition: pos });
  });

  // Handle Dynamic Permissions and Content Script Registrations
  for (const [key, config] of Object.entries(SECTIONS)) {
    const checkbox = document.getElementById(config.checkboxId) as HTMLInputElement;
    if (!checkbox) continue;

    // Check if permission is currently granted
    const hasPermission = await chrome.permissions.contains({
      origins: config.origins,
    });
    checkbox.checked = hasPermission;

    if (hasPermission) {
      // Sync tab states and inject scripts if integration is already enabled on load/reload
      notifyTabsOfStateChange(key, true).catch((err) => {
        console.error(`[Workspace Toolkit for Google] Failed to initialize state for ${key}:`, err);
      });
    }

    // Handle toggle action using click to ensure user gesture context is preserved
    checkbox.addEventListener('click', () => {
      const checked = checkbox.checked;
      if (checked) {
        chrome.permissions.request({ origins: config.origins }, async (granted) => {
          if (granted) {
            const scriptIds = config.scripts.map((s) => s.id);
            try {
              // Unregister first to avoid duplicates
              await chrome.scripting.unregisterContentScripts({
                ids: scriptIds,
              });
            } catch (e) {
              // Ignore
            }
            try {
              await chrome.scripting.registerContentScripts(config.scripts);
              console.log(`[Workspace Toolkit for Google] Registered scripts for ${key}`);

              // Apply immediately to matching active tabs
              await notifyTabsOfStateChange(key, true);
            } catch (error) {
              console.error(
                `[Workspace Toolkit for Google] Failed to register scripts for ${key}:`,
                error
              );
              checkbox.checked = false;
            }
          } else {
            checkbox.checked = false;
          }
        });
      } else {
        (async () => {
          try {
            // Apply cleanup immediately to active tabs
            await notifyTabsOfStateChange(key, false);

            // Unregister content scripts
            const scriptIds = config.scripts.map((s) => s.id);
            try {
              await chrome.scripting.unregisterContentScripts({
                ids: scriptIds,
              });
            } catch (e) {
              // Ignore
            }
            // Revoke permission
            chrome.permissions.remove({ origins: config.origins }, (removed) => {
              console.log(
                `[Workspace Toolkit for Google] Revoked permissions for ${key}: ${removed}`
              );
            });
          } catch (error) {
            console.error(
              `[Workspace Toolkit for Google] Failed to disable integration for ${key}:`,
              error
            );
          }
        })();
      }
    });
  }

  // Handle Drag and Drop for Section Reordering
  if (draggableContainer) {
    const draggableAccordions = draggableContainer.querySelectorAll('.accordion');
    let dragOccurred = false;

    draggableAccordions.forEach((acc) => {
      const accordion = acc as HTMLElement;

      accordion.addEventListener('dragstart', () => {
        dragOccurred = false;
        accordion.classList.add('dragging');
      });

      accordion.addEventListener('drag', () => {
        dragOccurred = true;
      });

      accordion.addEventListener('dragend', async () => {
        accordion.classList.remove('dragging');

        // Save new order to storage
        const currentAccordions = [...draggableContainer.querySelectorAll('.accordion')];
        const order = currentAccordions.map((el) => el.getAttribute('data-id'));
        await chrome.storage.local.set({ sectionOrder: order });
      });

      // Prevent details summary toggle if we just finished dragging
      const summary = accordion.querySelector('summary');
      if (summary) {
        summary.addEventListener('click', (e) => {
          if (dragOccurred) {
            e.preventDefault();
            dragOccurred = false;
          }
        });
      }
    });

    draggableContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      const draggingElement = draggableContainer.querySelector('.dragging') as HTMLElement;
      if (!draggingElement) return;

      const siblings = [
        ...draggableContainer.querySelectorAll('.accordion:not(.dragging)'),
      ] as HTMLElement[];
      const nextSibling = siblings.find((sibling) => {
        const box = sibling.getBoundingClientRect();
        return e.clientY <= box.top + box.height / 2;
      });

      draggableContainer.insertBefore(draggingElement, nextSibling || null);
    });
  }
});
