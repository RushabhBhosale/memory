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
const openModalButton = document.getElementById('openModalButton');
const savePageButton = document.getElementById('savePageButton');
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
  openModalButton.disabled = busy;
  savePageButton.disabled = busy;
  loginButton.disabled = busy;
};

const getAuthConfig = async () => {
  const stored = await storageGet([TOKEN_KEY, BACKEND_URL_KEY]);

  return {
    token: stored[TOKEN_KEY] || '',
    backendUrl: (stored[BACKEND_URL_KEY] || getDefaultBackendUrl()).replace(/\/$/, '')
  };
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

  throw new Error('No active website tab found. Click a normal webpage and try again.');
};

const parseApiResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();

  if (!text) {
    return {};
  }

  if (!contentType.includes('application/json')) {
    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      throw new Error(
        `Backend returned an HTML page for ${response.url}. The extension API route may not be deployed yet.`
      );
    }

    throw new Error(`Backend returned non-JSON response from ${response.url}.`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Backend returned invalid JSON.');
  }
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
  const body = await parseApiResponse(response);

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

const openQuickSaveModal = async () => {
  try {
    setBusy(true);
    setStatus('Opening modal...');

    chrome.runtime.sendMessage({ type: 'MEMORY_ASSISTANT_OPEN_MODAL' }, (response) => {
      setBusy(false);

      if (chrome.runtime.lastError) {
        setStatus(chrome.runtime.lastError.message || 'Unable to open modal.', 'error');
        return;
      }

      if (!response?.ok) {
        setStatus(response?.error || 'Unable to open modal.', 'error');
        return;
      }

      setStatus('Modal opened on the current page.', 'success');
      window.close();
    });
  } catch (error) {
    setBusy(false);
    setStatus(error instanceof Error ? error.message : 'Unable to open modal.', 'error');
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
openModalButton.addEventListener('click', openQuickSaveModal);

renderAuthState();
