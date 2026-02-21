/**
 * Veritas Witness — Background Service Worker
 * Handles: API calls, context menu, badge updates, message routing
 */

// ── DEFAULTS ──────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  apiEndpoint:      'https://veritas-protocol.onrender.com',
  passiveIndicator: true,   // badge entropy on page load
  contextMenu:      true,   // right-click → analyze selection
  witnessWord:      true,   // second-level Claude analysis
  autoAnalyze:      false,  // analyze every page automatically (off by default)
  language:         'uk',
};

// ── INIT ──────────────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  // Set defaults if not already set
  const existing = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  await chrome.storage.sync.set({ ...DEFAULT_SETTINGS, ...existing });
  buildContextMenu();
  console.log('✅ Veritas Witness installed');
});

// Rebuild context menu when settings change
chrome.storage.onChanged.addListener((changes) => {
  if (changes.contextMenu) buildContextMenu();
});

// ── CONTEXT MENU ──────────────────────────────────────────────────────────────
function buildContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.storage.sync.get('contextMenu', ({ contextMenu }) => {
      if (!contextMenu) return;
      chrome.contextMenus.create({
        id:       'veritas-analyze',
        title:    '👁 Свідок — аналізувати виділене',
        contexts: ['selection'],
      });
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'veritas-analyze') return;
  const text = info.selectionText?.trim();
  if (!text) return;

  // Open sidebar with selected text
  await chrome.tabs.sendMessage(tab.id, {
    type:   'OPEN_SIDEBAR',
    text,
    source: 'context_menu',
  });
});

// ── MESSAGE ROUTER ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ANALYZE')       { handleAnalyze(msg, sendResponse); return true; }
  if (msg.type === 'WITNESS_WORD')  { handleWitnessWord(msg, sendResponse); return true; }
  if (msg.type === 'SET_BADGE')     { handleBadge(msg, sender.tab?.id); }
  if (msg.type === 'GET_SETTINGS')  { chrome.storage.sync.get(DEFAULT_SETTINGS, sendResponse); return true; }
});

// ── API: ANALYZE ──────────────────────────────────────────────────────────────
async function handleAnalyze({ text, url }, sendResponse) {
  try {
    const { apiEndpoint } = await chrome.storage.sync.get('apiEndpoint');
    const endpoint = (apiEndpoint || DEFAULT_SETTINGS.apiEndpoint).replace(/\/$/, '');

    const body = url && !text ? { url } : { text };

    const res = await fetch(`${endpoint}/api/analyze`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    sendResponse({ ok: true, data });
  } catch (e) {
    sendResponse({ ok: false, error: e.message });
  }
}

// ── API: WITNESS WORD ─────────────────────────────────────────────────────────
async function handleWitnessWord({ diagnostics, textPreview }, sendResponse) {
  try {
    const { apiEndpoint } = await chrome.storage.sync.get('apiEndpoint');
    const endpoint = (apiEndpoint || DEFAULT_SETTINGS.apiEndpoint).replace(/\/$/, '');

    const res = await fetch(`${endpoint}/api/oracle`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ diagnostics, text_preview: textPreview }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    sendResponse({ ok: true, data });
  } catch (e) {
    sendResponse({ ok: false, error: e.message });
  }
}

// ── BADGE ─────────────────────────────────────────────────────────────────────
function handleBadge({ entropy, status }, tabId) {
  if (!tabId) return;

  let color, text;
  if (entropy === null || entropy === undefined) {
    color = '#334'; text = '';
  } else if (entropy < 0.25) {
    color = '#4ade80'; text = Math.round(entropy * 100) + '';
  } else if (entropy < 0.45) {
    color = '#facc15'; text = Math.round(entropy * 100) + '';
  } else if (entropy < 0.65) {
    color = '#fb923c'; text = Math.round(entropy * 100) + '';
  } else {
    color = '#f87171'; text = Math.round(entropy * 100) + '';
  }

  chrome.action.setBadgeBackgroundColor({ tabId, color });
  chrome.action.setBadgeText({ tabId, text });
}

// ── TAB UPDATES ───────────────────────────────────────────────────────────────
// Clear badge on navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    chrome.action.setBadgeText({ tabId, text: '' });
  }
});
