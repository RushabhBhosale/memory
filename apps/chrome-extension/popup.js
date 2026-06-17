const TOKEN_KEY = 'memoryAssistantToken';
const BACKEND_URL_KEY = 'memoryAssistantBackendUrl';

const loginView = document.getElementById('loginView');
const appView = document.getElementById('appView');
const logoutButton = document.getElementById('logoutButton');
const backendUrlInput = document.getElementById('backendUrlInput');
const tokenInput = document.getElementById('tokenInput');
const loginButton = document.getElementById('loginButton');
const typeSelect = document.getElementById('typeSelect');
const projectSelect = document.getElementById('projectSelect');
const noteInput = document.getElementById('noteInput');
const savePageButton = document.getElementById('savePageButton');
const captureButton = document.getElementById('captureButton');
const statusText = document.getElementById('status');

const getDefaultBackendUrl = () =>
  globalThis.MEMORY_ASSISTANT_CONFIG?.BACKEND_URL || 'https://memory-green-kappa.vercel.app';

const storageGet = (keys) =>
  new Promise((resolve) => chrome.storage.local.get(keys, resolve));

const storageSet = (value) =>
  new Promise((resolve) => chrome.storage.local.set(value, resolve));

const storageRemove = (keys) =>
  new Promise((resolve) => chrome.storage.local.remove(keys, resolve));

const setStatus = (message, tone = '') => {
  statusText.textContent = message;
  statusText.className = `status ${tone}`.trim();
};

const setBusy = (busy) => {
  savePageButton.disabled = busy;
  captureButton.disabled = busy;
  loginButton.disabled = busy;
};

const getAuthConfig = async () => {
  const stored = await storageGet([TOKEN_KEY, BACKEND_URL_KEY]);

  return {
    token: stored[TOKEN_KEY] || '',
    backendUrl: (stored[BACKEND_URL_KEY] || getDefaultBackendUrl()).replace(/\/$/, '')
  };
};

const getActiveTab = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    throw new Error('No active tab found.');
  }

  return tab;
};

const apiRequest = async (path, options = {}) => {
  const { token, backendUrl } = await getAuthConfig();

  if (!token) {
    throw new Error('Login to Memory Assistant first.');
  }

  const response = await fetch(`${backendUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': token,
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(body.error || body.message || `Request failed with status ${response.status}`);
  }

  return body;
};

const apiFormRequest = async (path, formData) => {
  const { token, backendUrl } = await getAuthConfig();

  if (!token) {
    throw new Error('Login to Memory Assistant first.');
  }

  const response = await fetch(`${backendUrl}${path}`, {
    method: 'POST',
    headers: {
      'x-api-key': token
    },
    body: formData
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(body.error || body.message || `Request failed with status ${response.status}`);
  }

  return body;
};

const renderAuthState = async () => {
  const { token, backendUrl } = await getAuthConfig();
  backendUrlInput.value = backendUrl;

  if (!token) {
    loginView.classList.remove('hidden');
    appView.classList.add('hidden');
    logoutButton.classList.add('hidden');
    setStatus('Login to start saving from Chrome.');
    return;
  }

  loginView.classList.add('hidden');
  appView.classList.remove('hidden');
  logoutButton.classList.remove('hidden');
  await loadProjects();
};

const loadProjects = async () => {
  try {
    setStatus('Loading projects...');
    const response = await apiRequest('/api/extension/projects');
    const projects = response.data || [];
    projectSelect.innerHTML = '<option value="">No project</option>';

    for (const project of projects) {
      const option = document.createElement('option');
      option.value = project._id;
      option.textContent = project.name;
      projectSelect.appendChild(option);
    }

    setStatus(projects.length ? 'Ready.' : 'Ready. No projects found.');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Unable to load projects.', 'error');
  }
};

const buildSource = (tab) => ({
  type: 'chrome_extension',
  title: tab.title || '',
  url: tab.url || '',
  capturedAt: new Date().toISOString()
});

const buildPagePayload = (tab) => ({
  type: typeSelect.value,
  content: `Saved page: ${tab.title || 'Untitled page'}\n${tab.url || ''}`,
  note: noteInput.value.trim(),
  projectId: projectSelect.value || null,
  source: buildSource(tab)
});

const savePage = async () => {
  try {
    setBusy(true);
    setStatus('Saving page...');
    const tab = await getActiveTab();
    await apiRequest('/api/extension/memories', {
      method: 'POST',
      body: JSON.stringify(buildPagePayload(tab))
    });
    noteInput.value = '';
    setStatus('Page saved to Memory Assistant.', 'success');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Unable to save page.', 'error');
  } finally {
    setBusy(false);
  }
};

const dataUrlToBlob = async (dataUrl) => {
  const response = await fetch(dataUrl);

  return response.blob();
};

const captureVisibleTab = async (windowId) =>
  new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
      const message = chrome.runtime.lastError?.message;

      if (message || !dataUrl) {
        reject(new Error(message || 'Screenshot capture failed.'));
        return;
      }

      resolve(dataUrl);
    });
  });

const captureScreenshot = async () => {
  try {
    setBusy(true);
    setStatus('Capturing screenshot...');
    const tab = await getActiveTab();
    const dataUrl = await captureVisibleTab(tab.windowId);
    const blob = await dataUrlToBlob(dataUrl);
    const formData = new FormData();
    const source = buildSource(tab);

    formData.append('image', blob, 'visible-tab.png');
    formData.append('type', typeSelect.value);
    formData.append('note', noteInput.value.trim());
    formData.append('projectId', projectSelect.value || '');
    formData.append('sourceTitle', source.title);
    formData.append('sourceUrl', source.url);
    formData.append('capturedAt', source.capturedAt);

    await apiFormRequest('/api/extension/screenshots', formData);
    noteInput.value = '';
    setStatus('Screenshot saved to Memory Assistant.', 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to capture screenshot.';
    setStatus(
      message.includes('permission') ? 'Chrome could not capture this tab. Try a normal webpage.' : message,
      'error'
    );
  } finally {
    setBusy(false);
  }
};

loginButton.addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  const backendUrl = backendUrlInput.value.trim().replace(/\/$/, '') || getDefaultBackendUrl();

  if (!token) {
    setStatus('Enter your Memory Assistant API key.', 'error');
    return;
  }

  await storageSet({
    [TOKEN_KEY]: token,
    [BACKEND_URL_KEY]: backendUrl
  });
  tokenInput.value = '';
  await renderAuthState();
});

logoutButton.addEventListener('click', async () => {
  await storageRemove([TOKEN_KEY]);
  await renderAuthState();
});

savePageButton.addEventListener('click', savePage);
captureButton.addEventListener('click', captureScreenshot);

renderAuthState();

