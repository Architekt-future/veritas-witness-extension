/**
 * Veritas Witness — Options Script
 */

const KEYS = [
  'apiEndpoint',
  'passiveIndicator',
  'contextMenu',
  'witnessWord',
  'autoAnalyze',
  'language',
];

// Load saved settings into form
chrome.storage.sync.get(KEYS, (s) => {
  document.getElementById('apiEndpoint').value =
    s.apiEndpoint || 'https://veritas-protocol.onrender.com';

  document.getElementById('passiveIndicator').checked =
    s.passiveIndicator !== false;

  document.getElementById('contextMenu').checked =
    s.contextMenu !== false;

  document.getElementById('witnessWord').checked =
    s.witnessWord !== false;

  document.getElementById('autoAnalyze').checked =
    !!s.autoAnalyze;

  document.getElementById('language').value =
    s.language || 'uk';
});

// Save
document.getElementById('save-btn').onclick = () => {
  const settings = {
    apiEndpoint:      document.getElementById('apiEndpoint').value.trim(),
    passiveIndicator: document.getElementById('passiveIndicator').checked,
    contextMenu:      document.getElementById('contextMenu').checked,
    witnessWord:      document.getElementById('witnessWord').checked,
    autoAnalyze:      document.getElementById('autoAnalyze').checked,
    language:         document.getElementById('language').value,
  };

  chrome.storage.sync.set(settings, () => {
    const status = document.getElementById('save-status');
    status.textContent = '✓ ЗБЕРЕЖЕНО';
    setTimeout(() => { status.textContent = ''; }, 2000);
  });
};
