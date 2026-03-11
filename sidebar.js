/**
 * Veritas Witness — Sidebar Logic  v1.1
 * Changelog:
 *   v1.1 — додано блок МОДУЛІ: всі спрацьовані детектори з score + badge
 *          entropy_boosted показується замість base entropy
 *          множник × N.NN (N мод.) під шкалою
 */

(function () {
  if (window.__veritasInjected) return;
  window.__veritasInjected = true;

  let sidebarEl     = null;
  let currentResult = null;
  let currentText   = '';
  let settings      = {};

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

  // ── SIDEBAR DOM ────────────────────────────────────────────────────────────
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

          <!-- ENTROPY GAUGE -->
          <div id="vt-entropy-block">
            <div id="vt-entropy-label">ЕНТРОПІЯ</div>
            <div id="vt-entropy-value">—</div>
            <div id="vt-entropy-bar-wrap"><div id="vt-entropy-bar"></div></div>
            <div id="vt-entropy-multiplier" style="display:none"></div>
            <div id="vt-verdict">—</div>
            <div id="vt-explanation" style="display:none"></div>
          </div>

          <!-- MODULES BLOCK — спрацьовані детектори -->
          <div id="vt-modules-block" style="display:none">
            <div class="vt-section-label">МОДУЛІ</div>
            <div id="vt-modules-list"></div>
          </div>

          <!-- SIGNALS (LAC + Self-pres + Meta) -->
          <div id="vt-signals-block" style="display:none">
            <div class="vt-section-label">СИГНАЛИ</div>
            <div id="vt-signals-list"></div>
          </div>

          <!-- CONTEXT FIELD -->
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

          <!-- NARRATIVE PIVOT -->
          <div id="vt-pivot-block" style="display:none">
            <div class="vt-section-label">🔄 НАРАТИВНИЙ PIVOT</div>
            <div id="vt-pivot-verdict"></div>
            <div id="vt-pivot-explanation"></div>
            <div id="vt-pivot-evidence"></div>
          </div>

          <!-- WITNESS WORD OUTPUT -->
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

  function showSidebar() { sidebarEl.classList.add('vt-open'); }
  function hideSidebar()  { sidebarEl.classList.remove('vt-open'); }

  // ── TEXT EXTRACTION ────────────────────────────────────────────────────────
  function extractArticleText() {
    const ARTICLE_SELECTORS = [
      'article',
      '[itemprop="articleBody"]',
      '.article-body', '.article__body', '.article-content',
      '.post-content', '.entry-content',
      '.story-body', '.news-text', '.article-text',
      '[role="main"] p',
    ];

    let articleEl = null;
    for (const sel of ARTICLE_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim().length > 200) {
        articleEl = el;
        break;
      }
    }

    if (!articleEl) {
      const paragraphs = Array.from(document.querySelectorAll('p'))
        .filter(p => {
          const parent = p.closest(
            'nav, header, footer, aside, [class*="sidebar"], [class*="related"], ' +
            '[class*="recommend"], [class*="also"], [class*="widget"], ' +
            '[id*="sidebar"], [id*="footer"], [id*="header"]'
          );
          return !parent && p.innerText.trim().length > 40;
        })
        .map(p => p.innerText.trim());
      return paragraphs.slice(0, 50).join('\n');
    }

    const clone = articleEl.cloneNode(true);
    const NOISE = [
      'nav', 'header', 'footer', 'aside',
      'script', 'style', 'noscript',
      '[class="sidebar"]', '[id="sidebar"]',
      '[class="related"]', '[id="related"]',
      '[class="related-articles"]', '[id="related-articles"]',
      '[class="also-read"]', '[class="read-also"]',
      '[class="more-news"]', '[id="more-news"]',
      '[class="social"]', '[class="social-share"]',
      '[class="share"]', '[class="sharing"]',
      '[class="comments"]', '[id="comments"]',
      '[class="advertisement"]', '[class="advert"]',
      '[class="banner"]', '[id="banner"]',
      '[class="newsletter"]', '[class="subscribe"]',
      '[class="breadcrumb"]', '[class="breadcrumbs"]',
      '[class="pagination"]',
      'figure > figcaption',
    ];
    NOISE.forEach(sel => clone.querySelectorAll(sel).forEach(el => el.remove()));
    return clone.innerText.trim();
  }

  function analyzeCurrentPage() {
    showSidebar();
    setLoading(true);
    let raw = extractArticleText();

    raw = raw.replace(
      /Skip Найпопулярніше and continue reading Найпопулярніше[\s\S]*?End of Найпопулярніше/gi, ''
    );
    raw = raw.replace(
      /Skip Підписуйтеся на нас у соцмережах[\s\S]*?End of Підписуйтеся на нас у соцмережах/gi, ''
    );
    raw = raw.replace(
      /Skip .{5,60} and continue reading .{5,60}[\s\S]*?End of .{5,60}/gi, ''
    );

    const words = raw.split(/\s+/).filter(w => w.length > 0).slice(0, 1500).join(' ');
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
          // badge показує boosted entropy якщо є
          entropy: (resp.data.entropy_boosted != null)
            ? resp.data.entropy_boosted / 100
            : resp.data.entropy,
          status:  resp.data.status,
        });
      }
    });
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────
  function renderResult(data) {
    hide('vt-idle'); hide('vt-error'); show('vt-result');

    const diag = data.diagnostics || {};

    // ── Entropy: показуємо boosted якщо є ──────────────────────────────────
    const basePct    = Math.round((data.entropy || 0) * 100);
    const boostedPct = data.entropy_boosted != null ? data.entropy_boosted : basePct;
    const color      = entropyColor(boostedPct / 100);

    setText('vt-entropy-value', boostedPct + '%');
    setStyle('vt-entropy-value', 'color', color);
    setStyle('vt-entropy-bar',   'width',  boostedPct + '%');
    setStyle('vt-entropy-bar',   'background', color);
    setText('vt-verdict', data.verdict || '—');
    setStyle('vt-verdict', 'color', color);

    // Множник
    const multiplier  = data.entropy_multiplier;
    const modCount    = data.triggered_count || 0;
    const multEl      = get('vt-entropy-multiplier');
    if (multiplier && multiplier > 1.0) {
      multEl.textContent = `× ${multiplier.toFixed(2)} (${modCount} мод.)`;
      show('vt-entropy-multiplier');
    } else {
      hide('vt-entropy-multiplier');
    }

    if (data.explanation) {
      setText('vt-explanation', data.explanation);
      show('vt-explanation');
    } else {
      hide('vt-explanation');
    }

    // ── MODULES BLOCK ──────────────────────────────────────────────────────
    renderModules(data, diag);

    // ── SIGNALS ────────────────────────────────────────────────────────────
    const signals = collectSignals(data, diag);
    if (signals.length) {
      show('vt-signals-block');
      get('vt-signals-list').innerHTML = signals
        .map(s => `<span class="vt-signal">${s}</span>`).join('');
    } else {
      hide('vt-signals-block');
    }

    // ── CONTEXT ────────────────────────────────────────────────────────────
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

    // ── PERFORMATIVE ───────────────────────────────────────────────────────
    const perf = data.performative;
    if (perf?.verdict &&
        perf.verdict !== 'GENUINE_ACCOUNTABILITY' &&
        perf.verdict !== 'NO_PERFORMATIVE') {
      show('vt-perf-block');
      setText('vt-perf-verdict', perf.verdict + ' · ' + (perf.score || 0).toFixed(2));
    } else {
      hide('vt-perf-block');
    }

    // ── NARRATIVE PIVOT ────────────────────────────────────────────────────
    const pivot = data.narrative_pivot;
    if (pivot?.has_pivot && pivot.verdict !== 'NO_PIVOT') {
      show('vt-pivot-block');
      setText('vt-pivot-verdict', pivot.verdict + ' · ' + (pivot.score || 0).toFixed(2));
      setText('vt-pivot-explanation', pivot.explanation || '');
      if (pivot.evidence?.length) {
        setText('vt-pivot-evidence', '«' + pivot.evidence[0].slice(0, 80) + '…»');
      }
    } else {
      hide('vt-pivot-block');
    }

    if (settings.witnessWord) show('vt-witness-btn');
    else hide('vt-witness-btn');
    hide('vt-witness-block');
  }

  // ── MODULES BLOCK ──────────────────────────────────────────────────────────
  // Визначення всіх модулів: ключ, іконка, назва, як дістати score і verdict
  const MODULE_DEFS = [
    {
      key:      'self_preservation',
      icon:     '🛡',
      label:    'САМОЗБЕРЕЖЕННЯ',
      color:    '#f87171',
      isActive: (data, diag) => {
        const v = diag.self_preservation_verdict || data.self_preservation?.verdict || '';
        return v && v !== 'SAFE' && v !== 'CLEAN' && v !== '';
      },
      score: (data, diag) =>
        diag.self_preservation_score ?? data.self_preservation?.score ?? null,
      verdict: (data, diag) =>
        diag.self_preservation_verdict || data.self_preservation?.verdict || '',
    },
    {
      key:      'meta_intent',
      icon:     '🎯',
      label:    'МЕТА-НАМІР',
      color:    '#fb923c',
      isActive: (data) => {
        const v = data.meta_intent?.verdict || '';
        return v && v !== 'TRANSPARENT' && v !== 'CLEAN' && v !== '';
      },
      score:   (data) => data.meta_intent?.score ?? null,
      verdict: (data) => data.meta_intent?.verdict || '',
    },
    {
      key:      'manipulation',
      icon:     '🧠',
      label:    'МАНІПУЛЯЦІЯ',
      color:    '#f87171',
      isActive: (data, diag) => (diag.manipulation_score || 0) >= 0.20,
      score:    (data, diag) => diag.manipulation_score ?? null,
      verdict:  (data, diag) => diag.manipulation_verdict || '',
    },
    {
      key:      'framing',
      icon:     '🖼️',
      label:    'ФРЕЙМІНГ',
      color:    '#f59e42',
      isActive: (data, diag) => diag.is_framing === true,
      score:    (data, diag) => diag.framing_score ?? null,
      verdict:  (data, diag) => translateFramingVerdict(diag.framing_verdict || ''),
      detail:   (data, diag) => (diag.framing_patterns || [])
        .map(p => FRAMING_LABELS[p] || p).join(', '),
    },
    {
      key:      'lac_epistemology',
      icon:     '🔬',
      label:    'LAC ЕПІСТЕМОЛОГІЯ',
      color:    '#c084fc',
      isActive: (data, diag) => {
        const v = diag.lac_epistemology_verdict || '';
        return diag.is_epistemic_content && v && v !== 'N/A' && v !== 'CLEAN';
      },
      score:    (data, diag) => diag.lac_epistemology_score ?? null,
      verdict:  (data, diag) => diag.lac_epistemology_verdict || '',
    },
    {
      key:      'lac_finance',
      icon:     '💰',
      label:    'LAC ФІНАНСИ',
      color:    '#facc15',
      isActive: (data, diag) => {
        const v = diag.lac_finance_verdict || '';
        return diag.is_financial_content && v && v !== 'N/A' && v !== 'CLEAN';
      },
      score:    (data, diag) => diag.lac_finance_score ?? null,
      verdict:  (data, diag) => diag.lac_finance_verdict || '',
    },
    {
      key:      'lac_labor',
      icon:     '⚙️',
      label:    'LAC ПРАЦЯ',
      color:    '#4ade80',
      isActive: (data, diag) => {
        const v = diag.lac_labor_verdict || '';
        return diag.is_labor_content && v && v !== 'N/A' && v !== 'CLEAN';
      },
      score:    (data, diag) => diag.lac_labor_score ?? null,
      verdict:  (data, diag) => diag.lac_labor_verdict || '',
    },
    {
      key:      'axiom',
      icon:     '⚠️',
      label:    'АКСІОМ-ДРЕЙФ',
      color:    '#fb923c',
      isActive: (data, diag) => (diag.axiom_score || 0) >= 0.25,
      score:    (data, diag) => diag.axiom_score ?? null,
      verdict:  (data, diag) => diag.axiom_verdict || '',
    },
    {
      key:      'claim_gap',
      icon:     '📭',
      label:    'ЗАЯВИ БЕЗ ДОКАЗІВ',
      color:    '#94a3b8',
      isActive: (data) => data.claim_gap?.is_flagged === true,
      score:    (data) => data.claim_gap?.gap_score ?? null,
      verdict:  (data) => data.claim_gap?.verdict || '',
    },
    {
      key:      'performative',
      icon:     '🐊',
      label:    'КРОКОДИЛЯЧІ СЛЬОЗИ',
      color:    '#cc8833',
      isActive: (data) => data.performative?.is_performative === true,
      score:    (data) => data.performative?.score ?? null,
      verdict:  (data) => data.performative?.verdict || '',
    },
    {
      key:      'narrative_pivot',
      icon:     '🔄',
      label:    'НАРАТИВНИЙ PIVOT',
      color:    '#fb923c',
      isActive: (data) => data.narrative_pivot?.has_pivot === true,
      score:    (data) => data.narrative_pivot?.score ?? null,
      verdict:  (data) => data.narrative_pivot?.verdict || '',
    },
  ];

  const FRAMING_LABELS = {
    'agenda_setting':     'переключення уваги',
    'false_dilemma':      'хибна дилема',
    'ground_preparation': 'підготовка ґрунту',
    'overton_shift':      'зсув Овертона',
    'presupposition':     'вбудована передумова',
    'juxtaposition':      'зіставлення без висновку',
  };

  function translateFramingVerdict(v) {
    const MAP = {
      'AGENDA_SETTING':     'ПЕРЕКЛЮЧЕННЯ УВАГИ',
      'FALSE_DILEMMA':      'ХИБНА ДИЛЕМА',
      'GROUND_PREPARATION': 'ПІДГОТОВКА ҐРУНТУ',
      'OVERTON_SHIFT':      'ЗСУВ ОВЕРТОНА',
      'PRESUPPOSITION':     'ВБУДОВАНА ПЕРЕДУМОВА',
      'JUXTAPOSITION':      'ЗІСТАВЛЕННЯ БЕЗ ВИСНОВКУ',
      'COMBINED':           'КОМБІНОВАНИЙ',
    };
    return MAP[v] || v;
  }

  function renderModules(data, diag) {
    const active = MODULE_DEFS.filter(m => m.isActive(data, diag));

    if (!active.length) {
      hide('vt-modules-block');
      return;
    }

    const html = active.map(m => {
      const score   = m.score(data, diag);
      const verdict = m.verdict(data, diag);
      const detail  = m.detail ? m.detail(data, diag) : '';
      const scoreTxt = score != null ? (score * 100).toFixed(0) + '%' : '';

      return `
        <div class="vt-module-row" style="border-left-color:${m.color}">
          <div class="vt-module-header">
            <span class="vt-module-icon">${m.icon}</span>
            <span class="vt-module-label" style="color:${m.color}">${m.label}</span>
            ${scoreTxt ? `<span class="vt-module-score" style="color:${m.color}">${scoreTxt}</span>` : ''}
          </div>
          ${verdict ? `<div class="vt-module-verdict">${verdict}</div>` : ''}
          ${detail  ? `<div class="vt-module-detail">${detail}</div>`  : ''}
        </div>
      `;
    }).join('');

    get('vt-modules-list').innerHTML = html;
    show('vt-modules-block');
  }

  // ── SIGNALS (compact, для дублювання в шапці) ──────────────────────────────
  function collectSignals(data, diag) {
    const s = [];
    if (diag.is_financial_content && diag.lac_finance_verdict &&
        diag.lac_finance_verdict !== 'CLEAN' && diag.lac_finance_verdict !== 'N/A')
      s.push('💰 ' + diag.lac_finance_verdict);
    if (diag.is_labor_content && diag.lac_labor_verdict &&
        diag.lac_labor_verdict !== 'CLEAN' && diag.lac_labor_verdict !== 'N/A')
      s.push('⚙️ ' + diag.lac_labor_verdict);
    const spVerdict = diag.self_preservation_verdict || data.self_preservation?.verdict || '';
    if (spVerdict && spVerdict !== 'SAFE' && spVerdict !== 'CLEAN')
      s.push('🛡 ' + spVerdict);
    const miVerdict = data.meta_intent?.verdict || '';
    if (miVerdict && miVerdict !== 'TRANSPARENT' && miVerdict !== 'CLEAN')
      s.push('🎯 ' + miVerdict);
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

    const textTopic  = currentResult.context?.text_topic || null;
    const articleText = currentResult.article_text || currentText || '';

    chrome.runtime.sendMessage({
      type:        'WITNESS_WORD',
      diagnostics: currentResult,
      articleText,
      textTopic,
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

  // ── HELPERS ────────────────────────────────────────────────────────────────
  function get(id)            { return document.getElementById(id); }
  function show(id)           { get(id).style.display = 'block'; }
  function hide(id)           { get(id).style.display = 'none'; }
  function setText(id, text)  { get(id).textContent = text; }
  function setStyle(id, p, v) { get(id).style[p] = v; }

  function setLoading(on) {
    get('vt-loading').style.display = on ? 'block' : 'none';
    get('vt-result').style.display  = on ? 'none'  : 'block';
    get('vt-idle').style.display    = 'none';
    if (on) {
      [
        'vt-modules-block', 'vt-signals-block', 'vt-context-block',
        'vt-perf-block', 'vt-pivot-block', 'vt-witness-block', 'vt-witness-btn',
        'vt-entropy-multiplier',
      ].forEach(hide);
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

  // ── MESSAGES ───────────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'OPEN_SIDEBAR') {
      showSidebar();
      if (msg.text) analyzeText(msg.text);
    }
    if (msg.type === 'ANALYZE_PAGE') {
      analyzeCurrentPage();
    }
  });

  init();
})();
