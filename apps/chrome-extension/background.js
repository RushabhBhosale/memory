importScripts('config.js');

const MENU_ID = 'save-to-memory-assistant';
const TOKEN_KEY = 'memoryAssistantToken';
const BACKEND_URL_KEY = 'memoryAssistantBackendUrl';
const QUICK_SAVE_MESSAGE = 'MEMORY_ASSISTANT_QUICK_SAVE';
const LIST_PROJECTS_MESSAGE = 'MEMORY_ASSISTANT_LIST_PROJECTS';
const OPEN_MODAL_MESSAGE = 'MEMORY_ASSISTANT_OPEN_MODAL';

const getDefaultBackendUrl = () =>
  globalThis.MEMORY_ASSISTANT_CONFIG?.BACKEND_URL || 'https://memory-green-kappa.vercel.app';

const storageGet = (keys) =>
  new Promise((resolve) => chrome.storage.local.get(keys, resolve));

const showBadge = async (text, color = '#F4B63D') => {
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });

  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
  }, 2500);
};

const showPageToast = async (tabId, message, tone = 'success') => {
  if (!tabId) {
    await showBadge(tone === 'success' ? 'OK' : 'ERR', tone === 'success' ? '#8BA888' : '#E66A5C');
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      args: [message, tone],
      func: (toastMessage, toastTone) => {
        const existingToast = document.getElementById('memory-assistant-toast');

        if (existingToast) {
          existingToast.remove();
        }

        const toast = document.createElement('div');
        toast.id = 'memory-assistant-toast';
        toast.textContent = toastMessage;
        toast.style.position = 'fixed';
        toast.style.right = '18px';
        toast.style.top = '18px';
        toast.style.zIndex = '2147483647';
        toast.style.maxWidth = '320px';
        toast.style.padding = '12px 14px';
        toast.style.borderRadius = '16px';
        toast.style.background = toastTone === 'success' ? '#F4B63D' : '#E66A5C';
        toast.style.color = '#202124';
        toast.style.font = '700 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        toast.style.boxShadow = '0 14px 32px rgba(32, 33, 36, 0.18)';
        document.documentElement.appendChild(toast);

        setTimeout(() => {
          toast.remove();
        }, 2600);
      }
    });
  } catch {
    await showBadge(tone === 'success' ? 'OK' : 'ERR', tone === 'success' ? '#8BA888' : '#E66A5C');
  }
};

const getAuthConfig = async () => {
  const stored = await storageGet([TOKEN_KEY, BACKEND_URL_KEY]);
  const token = stored[TOKEN_KEY];
  const backendUrl = stored[BACKEND_URL_KEY] || getDefaultBackendUrl();

  if (!token) {
    throw new Error('Not logged in. Open the Memory Assistant extension popup and save your API key.');
  }

  return {
    token,
    backendUrl: backendUrl.replace(/\/$/, '')
  };
};

const apiRequest = async (path, options = {}) => {
  const { token, backendUrl } = await getAuthConfig();
  const response = await fetch(`${backendUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': token,
      ...(options.headers || {})
    }
  });
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  let body = {};

  if (text && contentType.includes('application/json')) {
    body = JSON.parse(text);
  } else if (text && text.trim().startsWith('<')) {
    throw new Error('Extension API route is not available yet. Redeploy the backend.');
  } else if (text) {
    throw new Error('Backend returned a non-JSON response.');
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('API key rejected. Open the extension popup and save the correct x-api-key.');
    }

    throw new Error(body.error || body.message || `Request failed with status ${response.status}`);
  }

  return body;
};

const isInjectableTab = (tab) =>
  Boolean(
    tab?.id &&
      tab.url &&
      /^(https?:|file:)/i.test(tab.url)
  );

const getActiveTab = async () => {
  const queries = [
    { active: true, currentWindow: true },
    { active: true, lastFocusedWindow: true },
    { active: true, windowType: 'normal' }
  ];

  for (const query of queries) {
    const tabs = await chrome.tabs.query(query);
    const injectableTab = tabs.find(isInjectableTab);

    if (injectableTab) {
      return injectableTab;
    }
  }

  throw new Error('No active website tab found. Click a normal webpage and try the shortcut again.');
};

const openQuickSaveModal = async (tab) => {
  if (!tab?.id) {
    await showBadge('ERR', '#E66A5C');
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [
        {
          title: tab.title || '',
          url: tab.url || ''
        }
      ],
      func: (pageSource) => {
        const MODAL_ID = 'memory-assistant-quick-save-root';
        const existing = document.getElementById(MODAL_ID);

        if (existing) {
          existing.remove();
          return;
        }

        const selectedText = window.getSelection?.().toString().trim() || '';
        const root = document.createElement('div');
        root.id = MODAL_ID;
        root.innerHTML = `
          <div class="ma-backdrop" data-close="true"></div>
          <section class="ma-modal" role="dialog" aria-modal="true" aria-label="Save to Memory Assistant">
            <div class="ma-header">
              <div>
                <p class="ma-eyebrow">Memory Assistant</p>
                <h2>Quick Save</h2>
              </div>
              <button class="ma-icon-button" data-close="true" type="button" aria-label="Close">x</button>
            </div>
            <label>
              Save as
              <select id="ma-type">
                <option value="memory">Memory</option>
                <option value="log">Log</option>
                <option value="note">Note</option>
                <option value="task">Task</option>
                <option value="project">Project</option>
                <option value="reminder">Reminder</option>
              </select>
            </label>
            <label>
              Project
              <select id="ma-project">
                <option value="">No project</option>
              </select>
            </label>
            <label>
              Title
              <input id="ma-title" type="text" placeholder="Optional title">
            </label>
            <label>
              Content
              <textarea id="ma-content" rows="6" placeholder="What should I save?"></textarea>
            </label>
            <div class="ma-actions">
              <button id="ma-save" class="ma-primary" type="button">Save</button>
              <button class="ma-secondary" data-close="true" type="button">Cancel</button>
            </div>
            <p id="ma-status" class="ma-status" role="status"></p>
          </section>
        `;

        const style = document.createElement('style');
        style.textContent = `
          #${MODAL_ID}, #${MODAL_ID} * { box-sizing: border-box; }
          #${MODAL_ID} {
            color: #202124;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            position: fixed;
            z-index: 2147483647;
          }
          #${MODAL_ID} .ma-backdrop {
            background: rgba(32, 33, 36, 0.36);
            inset: 0;
            position: fixed;
          }
          #${MODAL_ID} .ma-modal {
            background: #fff;
            border: 1px solid #e8e5e3;
            border-radius: 20px;
            box-shadow: 0 28px 70px rgba(32, 33, 36, 0.28);
            display: grid;
            gap: 12px;
            max-height: min(720px, calc(100vh - 32px));
            overflow: auto;
            padding: 18px;
            position: fixed;
            right: 18px;
            top: 18px;
            width: min(420px, calc(100vw - 36px));
          }
          #${MODAL_ID} .ma-header {
            align-items: center;
            display: flex;
            justify-content: space-between;
          }
          #${MODAL_ID} .ma-eyebrow {
            color: #686a64;
            font-size: 12px;
            font-weight: 800;
            margin: 0 0 2px;
          }
          #${MODAL_ID} h2 {
            color: #202124;
            font-size: 24px;
            line-height: 28px;
            margin: 0;
          }
          #${MODAL_ID} label {
            color: #202124;
            display: grid;
            font-size: 13px;
            font-weight: 800;
            gap: 7px;
            margin: 0;
          }
          #${MODAL_ID} input,
          #${MODAL_ID} select,
          #${MODAL_ID} textarea {
            background: #f9f8f4;
            border: 1px solid #e8e5e3;
            border-radius: 14px;
            color: #202124;
            font: inherit;
            outline: none;
            padding: 11px 12px;
            width: 100%;
          }
          #${MODAL_ID} textarea {
            line-height: 20px;
            resize: vertical;
          }
          #${MODAL_ID} input:focus,
          #${MODAL_ID} select:focus,
          #${MODAL_ID} textarea:focus {
            border-color: #f4b63d;
            box-shadow: 0 0 0 3px rgba(244, 182, 61, 0.24);
          }
          #${MODAL_ID} .ma-actions {
            display: flex;
            gap: 10px;
          }
          #${MODAL_ID} button {
            border: 0;
            border-radius: 14px;
            cursor: pointer;
            font: inherit;
            font-weight: 900;
            min-height: 42px;
            padding: 10px 14px;
          }
          #${MODAL_ID} .ma-primary {
            background: #f4b63d;
            color: #202124;
            flex: 1;
          }
          #${MODAL_ID} .ma-secondary {
            background: #f9f8f4;
            color: #202124;
          }
          #${MODAL_ID} .ma-icon-button {
            background: transparent;
            color: #686a64;
            font-size: 24px;
            min-height: 36px;
            padding: 0 8px;
          }
          #${MODAL_ID} .ma-status {
            color: #686a64;
            font-size: 13px;
            font-weight: 700;
            line-height: 18px;
            margin: 0;
            min-height: 18px;
          }
          #${MODAL_ID} .ma-status.ma-error { color: #e66a5c; }
          #${MODAL_ID} .ma-status.ma-success { color: #8ba888; }
        `;
        root.appendChild(style);
        document.documentElement.appendChild(root);

        const typeSelect = root.querySelector('#ma-type');
        const projectSelect = root.querySelector('#ma-project');
        const titleInput = root.querySelector('#ma-title');
        const contentInput = root.querySelector('#ma-content');
        const saveButton = root.querySelector('#ma-save');
        const status = root.querySelector('#ma-status');

        contentInput.value = selectedText;
        contentInput.focus();

        const setStatus = (message, tone = '') => {
          status.textContent = message;
          status.className = `ma-status ${tone ? `ma-${tone}` : ''}`.trim();
        };

        const close = () => root.remove();

        root.addEventListener('click', (event) => {
          if (event.target?.dataset?.close === 'true') {
            close();
          }
        });

        root.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') {
            close();
          }
        });

        chrome.runtime.sendMessage({ type: 'MEMORY_ASSISTANT_LIST_PROJECTS' }, (response) => {
          if (chrome.runtime.lastError) {
            setStatus('Project list unavailable. You can still save without a project.');
            return;
          }

          if (!response?.ok) {
            setStatus('Project list unavailable. You can still save without a project.');
            return;
          }

          for (const project of response.projects || []) {
            const option = document.createElement('option');
            option.value = project._id;
            option.textContent = project.name;
            projectSelect.appendChild(option);
          }
        });

        saveButton.addEventListener('click', () => {
          const content = contentInput.value.trim();

          if (!content) {
            setStatus('Add content before saving.', 'error');
            contentInput.focus();
            return;
          }

          saveButton.disabled = true;
          setStatus('Saving...');

          chrome.runtime.sendMessage(
            {
              type: 'MEMORY_ASSISTANT_QUICK_SAVE',
              payload: {
                type: typeSelect.value,
                title: titleInput.value.trim(),
                content,
                note: '',
                projectId: projectSelect.value || null,
                source: {
                  type: 'chrome_extension',
                  title: pageSource.title,
                  url: pageSource.url,
                  capturedAt: new Date().toISOString()
                }
              }
            },
            (response) => {
              saveButton.disabled = false;

              if (chrome.runtime.lastError) {
                setStatus(chrome.runtime.lastError.message || 'Extension connection failed.', 'error');
                return;
              }

              if (!response?.ok) {
                setStatus(response?.error || 'Unable to save.', 'error');
                return;
              }

              setStatus('Saved to Memory Assistant.', 'success');
              setTimeout(close, 700);
            }
          );
        });
      }
    });
  } catch (error) {
    const message =
      error instanceof Error && /Cannot access|Cannot access contents|chrome:\/\//i.test(error.message)
        ? 'Chrome blocked this page. Try a normal website tab, not a browser/system page.'
        : error instanceof Error
          ? error.message
          : 'Unable to open quick save.';

    await showPageToast(
      tab.id,
      message,
      'error'
    );
  }
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Save to Memory Assistant',
      contexts: ['selection']
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) {
    return;
  }

  const selectedText = (info.selectionText || '').trim();

  if (!selectedText) {
    await showPageToast(tab?.id, 'Select text before saving.', 'error');
    return;
  }

  try {
    await apiRequest('/api/extension/memories', {
      method: 'POST',
      body: JSON.stringify({
        type: 'note',
        content: selectedText,
        note: '',
        projectId: null,
        source: {
          type: 'chrome_extension',
          title: tab?.title || '',
          url: info.pageUrl || tab?.url || '',
          capturedAt: new Date().toISOString()
        }
      })
    });

    await showPageToast(tab?.id, 'Saved to Memory Assistant');
  } catch (error) {
    await showPageToast(
      tab?.id,
      error instanceof Error ? error.message : 'Unable to save selection.',
      'error'
    );
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-quick-save') {
    return;
  }

  try {
    await openQuickSaveModal(await getActiveTab());
  } catch (error) {
    console.error(error);
    await showBadge('ERR', '#E66A5C');
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === OPEN_MODAL_MESSAGE) {
    getActiveTab()
      .then((tab) => openQuickSaveModal(tab))
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Unable to open quick save.'
        });
      });

    return true;
  }

  if (message?.type === LIST_PROJECTS_MESSAGE) {
    apiRequest('/api/extension/projects')
      .then((response) => {
        sendResponse({ ok: true, projects: response.data || [] });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Unable to load projects.'
        });
      });

    return true;
  }

  if (message?.type === QUICK_SAVE_MESSAGE) {
    apiRequest('/api/extension/memories', {
      method: 'POST',
      body: JSON.stringify(message.payload || {})
    })
      .then(() => {
        showPageToast(sender.tab?.id, 'Saved to Memory Assistant');
        sendResponse({ ok: true });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Unable to save.'
        });
      });

    return true;
  }

  return false;
});
