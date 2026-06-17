importScripts('config.js');

const MENU_ID = 'save-to-memory-assistant';
const TOKEN_KEY = 'memoryAssistantToken';
const BACKEND_URL_KEY = 'memoryAssistantBackendUrl';

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
    throw new Error('Login to Memory Assistant from the extension popup first.');
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
    throw new Error(body.error || body.message || `Request failed with status ${response.status}`);
  }

  return body;
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
