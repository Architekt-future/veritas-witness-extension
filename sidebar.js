/**
 * Veritas Witness — Sidebar Logic
 * Handles: sidebar DOM injection, analysis, result rendering, witness word
 * 
 * Sidebar HTML structure is defined in sidebar.html (for reference/documentation).
 * The actual DOM is built here via innerHTML for content script injection.
 */

(function () {
  if (window.__veritasInjected) return;
  window.__veritasInjected = true;

  // ── STATE ──────────────────────────────────────────────────────────────────
  let sidebarEl        = null;
  let currentResult    = null;
  let currentText      = '';
  let settings         = {};

  // ── INIT ───────────────────────────────────────────────────────────────────
  async function init() {
    settings = await getSettings();
    buildSidebar();
    if (settings.passiveIndicator && settings.autoAnalyze) {
      analyzeCurrentPage();
    }
  }

  function getSettings() {
    return new Promise(resolve =>
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, resolve)
    );
  }

  // ── BUILD SIDEBAR ──────────────────────────────────────────────────────────
  function buildSidebar() {
    if (document.getElementById('veritas-sidebar')) {
      sidebarEl = document.getElementById('veritas-sidebar');
      return;
    }

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
          <div id="vt-idle-text">
            Виділіть текст і натисніть праву кнопку<br>
            або натисніть ⟳ для аналізу сторінки
          </div>
        </div>

        <div id="vt-loading" style="display:none">
          <div id="vt-spinner">⟳</div>
          <div id="vt-loading-text">Свідок аналізує...</div>
        </div>

        <div id="vt-result" style="display:none">
          <div id="vt-entropy-block">
            <div id="vt-entropy-label">ЕНТРОПІЯ</div>
            <div id="vt-entropy-value">—</div>
            <div id="vt-entropy-bar-wrap"><div id="vt-entropy-bar"></div></div>
            <div id="vt-verdict">—</div>
          </div>
          <div id="vt-signals-block" style="display:none">
            <div class="vt-section-label">СИГНАЛИ</div>
            <div id="vt-signals-list"></div>
          </div>
          <div id="vt-context-block" style="display:none">
            <div class="vt-section-label">🌐 ПОЛЕ</div>
            <div id="vt-context-verdict"></div>
            <div id="vt-context-topics"></div>
          </div>
          <div id="vt-perf-block" style="display:none">
            <div class="vt-section-label">🐊 PERFORMATIVE</div>
            <div id="vt-perf-verdict"></div>
          </div>
          <div id="vt-witness-block" style="display:none">
            <div class="vt-section-label">СЛОВО СВІДКА</div>
            <div id="vt-witness-text"></div>
          </div>
          <button id="vt-witness-btn" style="display:none">👁 СЛОВО СВІДКА</button>
        </div>

        <div id="vt-error" style="display:none">
          <div id="vt-error-text"></div>
          <button id="vt-retry">↺ Повторити</button>
        </div>
      </div>

      <div id="vt-footer">
        <label class="vt-toggle">
          <input type="checkbox" id="vt-tog-passive"> <span>Індикатор</span>
        </label>
        <label class="vt-toggle">
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
    get('vt-close').onclick        = hideSidebar;
    get('vt-analyze-page').onclick = analyzeCurrentPage;
    get('vt-retry').onclick        = () => { if (currentText) analyzeText(currentText); };
    get('vt-witness-btn').onclick  = callWitnessWord;
    get('vt-options-link').onclick = () => chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });

    get('vt-tog-passive').onchange = e =>
      chrome.storage.sync.set({ passiveIndicator: e.target.checked });
    get('vt-tog-witness').onchange = e =>
      chrome.storage.sync.set({ witnessWord: e.target.checked });
  }

  function syncToggles() {
    get('vt-tog-passive').checked = !!settings.passiveIndicator;
    get('vt-tog-witness').checked = !!settings.witnessWord;
  }

  // ── VISIBILITY ─────────────────────────────────────────────────────────────
  function showSidebar() { sidebarEl.classList.add('vt-open'); }
  function hideSidebar()  { sidebarEl.classList.remove('vt-open'); }

  // ── ANALYSIS ───────────────────────────────────────────────────────────────
  function analyzeCurrentPage() {
    showSidebar();
    setLoading(true);
    const root = document.querySelector(
      'article, main, [role="main"], .article-body, .story-body'
    ) || document.body;
    const words = root.innerText
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 1000)
      .join(' ');
    analyzeText(words);
  }

  function analyzeText(text) {
    currentText = text;
    setLoading(true);
    showSidebar();

    chrome.runtime.sendMessage({ type: 'ANALYZE', text }, (resp) => {
      setLoading(false);
      if (!resp?.ok) {
        showError(resp?.error || 'Помилка зв\'язку з API');
        return;
      }
      currentResult = resp.data;
      renderResult(resp.data);

      if (settings.passiveIndicator) {
        chrome.runtime.sendMessage({
          type:    'SET_BADGE',
          entropy: resp.data.entropy,
          status:  resp.data.status,
        });
      }
    });
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────
  function renderResult(data) {
    hide('vt-idle'); hide('vt-error'); show('vt-result');

    const pct   = Math.round((data.entropy || 0) * 100);
    const color = entropyColor(data.entropy || 0);

    setText('vt-entropy-value', pct + '%');
    setStyle('vt-entropy-value', 'color', color);
    setStyle('vt-entropy-bar',   'width',  pct + '%');
    setStyle('vt-entropy-bar',   'background', color);
    setText('vt-verdict', data.verdict || '—');
    setStyle('vt-verdict', 'color', color);

    // Signals
    const signals = collectSignals(data);
    if (signals.length) {
      show('vt-signals-block');
      get('vt-signals-list').innerHTML = signals
        .map(s => `<span class="vt-signal">${s}</span>`).join('');
    } else {
      hide('vt-signals-block');
    }

    // Context
    const ctx = data.context;
    if (ctx?.available && ctx.verdict &&
        ctx.verdict !== 'CONTEXTUALLY_NEUTRAL' &&
        ctx.verdict !== 'NO_CONTEXT') {
      show('vt-context-block');
      setText('vt-context-verdict', ctx.verdict);
      const topics = (ctx.summary?.hot_topics || [])
        .slice(0, 5).map(([w]) => w).join(' · ');
      setText('vt-context-topics', topics);
    } else {
      hide('vt-context-block');
    }

    // Performative
    const perf = data.performative;
    if (perf?.verdict &&
        perf.verdict !== 'GENUINE_ACCOUNTABILITY' &&
        perf.verdict !== 'NO_PERFORMATIVE') {
      show('vt-perf-block');
      setText('vt-perf-verdict',
        perf.verdict + ' · ' + (perf.score || 0).toFixed(2));
    } else {
      hide('vt-perf-block');
    }

    // Witness Word button
    if (settings.witnessWord) show('vt-witness-btn');
    else hide('vt-witness-btn');

    hide('vt-witness-block');
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
    const btn = get('vt-witness-btn');
    btn.disabled = true;
    btn.textContent = '⟳ СВІДОК ДУМАЄ...';
    show('vt-witness-block');
    setText('vt-witness-text', '...');

    chrome.runtime.sendMessage({
      type:        'WITNESS_WORD',
      diagnostics: currentResult,
      textPreview: currentText.slice(0, 300),
    }, (resp) => {
      btn.disabled = false;
      btn.textContent = '↺ СЛОВО СВІДКА ЗНОВУ';
      if (!resp?.ok) {
        setText('vt-witness-text', 'Помилка: ' + (resp?.error || '?'));
        return;
      }
      setText('vt-witness-text',
        resp.data.witness_text || resp.data.oracle_text || 'Свідок мовчить.');
    });
  }

  // ── UI HELPERS ─────────────────────────────────────────────────────────────
  function get(id)               { return document.getElementById(id); }
  function show(id)              { get(id).style.display = 'block'; }
  function hide(id)              { get(id).style.display = 'none'; }
  function setText(id, text)     { get(id).textContent = text; }
  function setStyle(id, p, v)    { get(id).style[p] = v; }

  function setLoading(on) {
    get('vt-loading').style.display = on ? 'block' : 'none';
    get('vt-result').style.display  = on ? 'none'  : 'block';
    get('vt-idle').style.display    = 'none';
    if (on) {
      ['vt-signals-block','vt-context-block','vt-perf-block',
       'vt-witness-block','vt-witness-btn'].forEach(hide);
    }
  }

  function showError(msg) {
    hide('vt-result'); hide('vt-loading'); show('vt-error');
    setText('vt-error-text', msg);
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
      if (msg.text) analyzeText(msg.text);
    }
    if (msg.type === 'ANALYZE_PAGE') {
      analyzeCurrentPage();
    }
  });

  // ── START ──────────────────────────────────────────────────────────────────
  init();
})();
