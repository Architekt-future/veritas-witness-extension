/**
 * Veritas Witness — Content Script
 * Injected into every page.
 * Handles: sidebar DOM, passive analysis trigger, selection detection.
 */

(function () {
  if (window.__veritasInjected) return;
  window.__veritasInjected = true;

  // ── STATE ──────────────────────────────────────────────────────────────────
  let sidebarEl = null;
  let currentResult = null;
  let settings = {};

  // ── INIT ───────────────────────────────────────────────────────────────────
  async function init() {
    settings = await getSettings();
    buildSidebar();

    // Passive auto-analysis if enabled
    if (settings.passiveIndicator && settings.autoAnalyze) {
      analyzeCurrentPage();
    }
  }

  function getSettings() {
    return new Promise(resolve =>
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, resolve)
    );
  }

  // ── SIDEBAR DOM ────────────────────────────────────────────────────────────
  function buildSidebar() {
    if (document.getElementById('veritas-sidebar')) return;

    sidebarEl = document.createElement('div');
    sidebarEl.id = 'veritas-sidebar';
    sidebarEl.innerHTML = `
      <div id="vt-header">
        <div id="vt-logo">
          <span id="vt-eye">👁</span>
          <span id="vt-title">VERITAS WITNESS</span>
        </div>
        <div id="vt-controls">
          <button id="vt-analyze-page" title="Аналізувати сторінку">⟳</button>
          <button id="vt-close" title="Закрити">✕</button>
        </div>
      </div>

      <div id="vt-body">
        <div id="vt-idle">
          <div id="vt-idle-text">Виділіть текст і натисніть праву кнопку<br>або натисніть ⟳ для аналізу сторінки</div>
        </div>

        <div id="vt-loading" style="display:none">
          <div id="vt-spinner">⟳</div>
          <div id="vt-loading-text">Свідок аналізує...</div>
        </div>

        <div id="vt-result" style="display:none">

          <!-- ENTROPY GAUGE -->
          <div id="vt-entropy-block">
            <div id="vt-entropy-label">ЕНТРОПІЯ</div>
            <div id="vt-entropy-value">—</div>
            <div id="vt-entropy-bar-wrap">
              <div id="vt-entropy-bar"></div>
            </div>
            <div id="vt-verdict">—</div>
          </div>

          <!-- SIGNALS -->
          <div id="vt-signals-block" style="display:none">
            <div class="vt-section-label">СИГНАЛИ</div>
            <div id="vt-signals-list"></div>
          </div>

          <!-- CONTEXT -->
          <div id="vt-context-block" style="display:none">
            <div class="vt-section-label">🌐 ПОЛЕ</div>
            <div id="vt-context-verdict"></div>
            <div id="vt-context-topics"></div>
          </div>

          <!-- PERFORMATIVE -->
          <div id="vt-perf-block" style="display:none">
            <div class="vt-section-label">🐊 PERFORMATIVE</div>
            <div id="vt-perf-verdict"></div>
          </div>

          <!-- WITNESS WORD -->
          <div id="vt-witness-block" style="display:none">
            <div class="vt-section-label">СЛОВО СВІДКА</div>
            <div id="vt-witness-text"></div>
          </div>

          <!-- WITNESS WORD BUTTON -->
          <button id="vt-witness-btn" style="display:none">
            👁 СЛОВО СВІДКА
          </button>
        </div>

        <div id="vt-error" style="display:none">
          <div id="vt-error-text"></div>
          <button id="vt-retry">↺ Повторити</button>
        </div>
      </div>

      <!-- SETTINGS TOGGLES -->
      <div id="vt-footer">
        <label class="vt-toggle" title="Пасивний індикатор">
          <input type="checkbox" id="vt-tog-passive"> <span>Індикатор</span>
        </label>
        <label class="vt-toggle" title="Слово Свідка">
          <input type="checkbox" id="vt-tog-witness"> <span>Свідок</span>
        </label>
        <a id="vt-options-link" title="Налаштування">⚙</a>
      </div>
    `;

    document.body.appendChild(sidebarEl);
    bindEvents();
    syncToggles();
  }

  // ── EVENTS ─────────────────────────────────────────────────────────────────
  function bindEvents() {
    document.getElementById('vt-close').onclick = hideSidebar;
    document.getElementById('vt-analyze-page').onclick = analyzeCurrentPage;
    document.getElementById('vt-retry').onclick = () => {
      if (currentAnalysisText) analyzeText(currentAnalysisText);
    };
    document.getElementById('vt-witness-btn').onclick = callWitnessWord;
    document.getElementById('vt-options-link').onclick = () =>
      chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });

    // Footer toggles
    document.getElementById('vt-tog-passive').onchange = e =>
      chrome.storage.sync.set({ passiveIndicator: e.target.checked });
    document.getElementById('vt-tog-witness').onchange = e =>
      chrome.storage.sync.set({ witnessWord: e.target.checked });
  }

  function syncToggles() {
    document.getElementById('vt-tog-passive').checked = !!settings.passiveIndicator;
    document.getElementById('vt-tog-witness').checked = !!settings.witnessWord;
  }

  // ── SIDEBAR VISIBILITY ─────────────────────────────────────────────────────
  function showSidebar() {
    sidebarEl.classList.add('vt-open');
  }
  function hideSidebar() {
    sidebarEl.classList.remove('vt-open');
  }

  // ── ANALYSIS ───────────────────────────────────────────────────────────────
  let currentAnalysisText = '';

  function analyzeCurrentPage() {
    showSidebar();
    setLoading(true);
    // Extract page text
    const article = document.querySelector('article, main, [role="main"], .article-body, .story-body');
    const raw = (article || document.body).innerText;
    const words = raw.split(/\s+/).filter(w => w.length > 3).slice(0, 1000).join(' ');
    analyzeText(words, window.location.href);
  }

  function analyzeText(text, url) {
    currentAnalysisText = text;
    setLoading(true);
    showSidebar();

    chrome.runtime.sendMessage(
      { type: 'ANALYZE', text, url },
      (resp) => {
        setLoading(false);
        if (!resp || !resp.ok) {
          showError(resp?.error || 'Помилка зв\'язку з API');
          return;
        }
        currentResult = resp.data;
        renderResult(resp.data);

        // Update badge
        if (settings.passiveIndicator) {
          chrome.runtime.sendMessage({
            type:    'SET_BADGE',
            entropy: resp.data.entropy,
            status:  resp.data.status,
          });
        }
      }
    );
  }

  // ── RENDER RESULT ──────────────────────────────────────────────────────────
  function renderResult(data) {
    document.getElementById('vt-idle').style.display    = 'none';
    document.getElementById('vt-error').style.display   = 'none';
    document.getElementById('vt-result').style.display  = 'block';

    // Entropy
    const pct = Math.round((data.entropy || 0) * 100);
    const color = entropyColor(data.entropy || 0);
    document.getElementById('vt-entropy-value').textContent = pct + '%';
    document.getElementById('vt-entropy-value').style.color = color;
    document.getElementById('vt-entropy-bar').style.width = pct + '%';
    document.getElementById('vt-entropy-bar').style.background = color;
    document.getElementById('vt-verdict').textContent = data.verdict || '—';
    document.getElementById('vt-verdict').style.color = color;

    // Signals
    const signals = collectSignals(data);
    if (signals.length) {
      document.getElementById('vt-signals-block').style.display = 'block';
      document.getElementById('vt-signals-list').innerHTML = signals
        .map(s => `<span class="vt-signal">${s}</span>`).join('');
    }

    // Context
    const ctx = data.context;
    if (ctx?.available && ctx.verdict && ctx.verdict !== 'CONTEXTUALLY_NEUTRAL' && ctx.verdict !== 'NO_CONTEXT') {
      document.getElementById('vt-context-block').style.display = 'block';
      document.getElementById('vt-context-verdict').textContent = ctx.verdict;
      const topics = ctx.summary?.hot_topics?.slice(0, 5).map(([w]) => w).join(' · ') || '';
      if (topics) document.getElementById('vt-context-topics').textContent = topics;
    }

    // Performative
    const perf = data.performative;
    if (perf?.verdict && perf.verdict !== 'GENUINE_ACCOUNTABILITY' && perf.verdict !== 'NO_PERFORMATIVE') {
      document.getElementById('vt-perf-block').style.display = 'block';
      document.getElementById('vt-perf-verdict').textContent = perf.verdict + ' · ' + (perf.score || 0).toFixed(2);
    }

    // Witness Word button
    if (settings.witnessWord) {
      document.getElementById('vt-witness-btn').style.display = 'block';
    }
  }

  function collectSignals(data) {
    const s = [];
    if (data.lac_finance?.verdict && data.lac_finance.verdict !== 'CLEAN')
      s.push('💰 ' + data.lac_finance.verdict);
    if (data.lac_labor?.verdict && data.lac_labor.verdict !== 'CLEAN')
      s.push('⚒ ' + data.lac_labor.verdict);
    if (data.self_preservation?.verdict && data.self_preservation.verdict !== 'SAFE')
      s.push('🛡 ' + data.self_preservation.verdict);
    if (data.meta_intent?.verdict && data.meta_intent.verdict !== 'TRANSPARENT')
      s.push('🎯 ' + data.meta_intent.verdict);
    return s;
  }

  // ── WITNESS WORD ───────────────────────────────────────────────────────────
  function callWitnessWord() {
    if (!currentResult) return;
    const btn = document.getElementById('vt-witness-btn');
    btn.disabled = true;
    btn.textContent = '⟳ СВІДОК ДУМАЄ...';

    document.getElementById('vt-witness-block').style.display = 'block';
    document.getElementById('vt-witness-text').textContent = '...';

    chrome.runtime.sendMessage(
      {
        type:        'WITNESS_WORD',
        diagnostics: currentResult,
        textPreview: currentAnalysisText.slice(0, 300),
      },
      (resp) => {
        btn.disabled = false;
        btn.textContent = '↺ СЛОВО СВІДКА ЗНОВУ';
        if (!resp || !resp.ok) {
          document.getElementById('vt-witness-text').textContent = 'Помилка: ' + (resp?.error || '?');
          return;
        }
        document.getElementById('vt-witness-text').textContent =
          resp.data.witness_text || resp.data.oracle_text || 'Свідок мовчить.';
      }
    );
  }

  // ── UI HELPERS ─────────────────────────────────────────────────────────────
  function setLoading(on) {
    document.getElementById('vt-loading').style.display = on ? 'block' : 'none';
    document.getElementById('vt-result').style.display  = on ? 'none'  : 'block';
    document.getElementById('vt-idle').style.display    = on ? 'none'  : 'none';
    if (on) {
      document.getElementById('vt-signals-block').style.display = 'none';
      document.getElementById('vt-context-block').style.display = 'none';
      document.getElementById('vt-perf-block').style.display    = 'none';
      document.getElementById('vt-witness-block').style.display = 'none';
      document.getElementById('vt-witness-btn').style.display   = 'none';
    }
  }

  function showError(msg) {
    document.getElementById('vt-result').style.display  = 'none';
    document.getElementById('vt-loading').style.display = 'none';
    document.getElementById('vt-error').style.display   = 'block';
    document.getElementById('vt-error-text').textContent = msg;
  }

  function entropyColor(e) {
    if (e < 0.25) return '#4ade80';
    if (e < 0.45) return '#facc15';
    if (e < 0.65) return '#fb923c';
    return '#f87171';
  }

  // ── MESSAGE LISTENER ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'OPEN_SIDEBAR') {
      showSidebar();
      analyzeText(msg.text);
    }
    if (msg.type === 'ANALYZE_PAGE') {
      analyzeCurrentPage();
    }
  });

  // ── START ──────────────────────────────────────────────────────────────────
  init();
})();
