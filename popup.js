/**
 * Veritas Witness — Popup Script
 */

async function checkApi() {
  const dot  = document.getElementById('api-dot');
  const text = document.getElementById('api-status');
  try {
    const { apiEndpoint } = await chrome.storage.sync.get('apiEndpoint');
    const ep = (apiEndpoint || 'https://veritas-protocol.onrender.com').replace(/\/$/, '');
    const res = await fetch(`${ep}/api/health`, {
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      dot.classList.add('green');
      text.textContent = 'API онлайн';
    } else {
      throw new Error();
    }
  } catch {
    dot.classList.add('red');
    text.textContent = 'API недоступний';
  }
}

async function loadEntropy() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const badge = await chrome.action.getBadgeText({ tabId: tab.id });
    // Guard: badge може бути порожнім після навігації
    if (badge && badge.trim() !== '') {
      const el = document.getElementById('entropy-display');
      el.textContent = `ентропія ${badge}%`;
    }
  } catch {}
}

document.getElementById('btn-analyze-page').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'ANALYZE_PAGE' });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['sidebar.js']
    });
    await chrome.tabs.sendMessage(tab.id, { type: 'ANALYZE_PAGE' });
  }
  window.close();
};

document.getElementById('btn-open-sidebar').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_SIDEBAR', text: '', source: 'popup' });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['sidebar.js']
    });
    await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_SIDEBAR', text: '', source: 'popup' });
  }
  window.close();
};

document.getElementById('options-link').onclick = () => {
  chrome.runtime.openOptionsPage();
  window.close();
};

checkApi();
loadEntropy();
