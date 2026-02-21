# Veritas Witness Extension

> Браузерне доповнення екосистеми Veritas Protocol

Свідок тепер живе прямо в браузері — без копіювання, без вкладок, без тертя.

---

## Можливості

**🔴 Пасивний індикатор** — ентропія поточної сторінки на іконці розширення. Зелений/жовтий/помаранчевий/червоний без жодних кліків.

**🔵 Контекстне меню** — виділив текст → правий клік → "👁 Свідок — аналізувати виділене" → бічна панель з результатом.

**⚪ Слово Свідка** — другий рівень. Після аналізу кнопка "👁 СЛОВО СВІДКА" запитує Claude через Veritas API і повертає аналіз інформаційного патерну.

**⚡ Авто-аналіз** — опційно, аналізує кожну сторінку автоматично при завантаженні.

Кожна функція вмикається/вимикається незалежно в налаштуваннях.

---

## Встановлення

### З джерельного коду (розробник)

```bash
git clone https://github.com/Architekt-future/veritas-witness-extension.git
```

1. Chrome → `chrome://extensions/`
2. Увімкни **"Режим розробника"** (правий верхній кут)
3. **"Завантажити нерозпаковане"** → вибери папку `veritas-witness-extension`
4. Іконка 👁 з'явиться в панелі браузера

### Налаштування

Клік на іконку → ⚙ Налаштування → вкажи свій Veritas API endpoint.

За замовчуванням використовується публічний сервер `https://veritas-protocol.onrender.com`. Якщо маєш власний деплой — вкажи його URL.

---

## Архітектура

```
manifest.json      — Manifest V3, permissions
background.js      — Service worker: API calls, context menu, badge
content.js         — Injected script: sidebar DOM, аналіз сторінки
popup.html         — Клік на іконку: швидкі дії + статус API
options.html       — Налаштування модулів і endpoint
styles/sidebar.css — Стилі бічної панелі
icons/             — 16/32/48/128px
```

**Потік даних:**
```
Користувач → content.js → background.js → Veritas API → response → sidebar render
```

Background worker ізолює всі мережеві запити — content script не має прямого доступу до API.

---

## Veritas API

Розширення використовує два endpoints:

```
POST /api/analyze   — основний аналіз (ентропія, LAC, контекст, performative)
POST /api/oracle    — Слово Свідка (аналіз патерну через Claude)
```

Документація: [veritas-protocol.onrender.com](https://veritas-protocol.onrender.com)  
Основний репо: [veritas-protocol](https://github.com/Architekt-future/veritas-protocol)

---

## Власний сервер

Якщо не хочеш використовувати публічний endpoint:

1. Задеплой [veritas-protocol](https://github.com/Architekt-future/veritas-protocol) на Render або будь-де
2. Додай `ANTHROPIC_API_KEY` в environment variables
3. В налаштуваннях розширення вкажи свій URL

---

## Статус

🚧 **Pre-release** — працюючий прототип, не опублікований в Chrome Web Store.  
Тестувалось на Chrome 121+, Chromium-based браузерах.

---

## Ліцензія

MIT з етичними вимогами — як і основний Veritas Protocol.  
Детально: [LICENSE](LICENSE)

---

## Частина екосистеми

- **[veritas-protocol](https://github.com/Architekt-future/veritas-protocol)** — основний сервер і веб-інтерфейс
- **veritas-witness-extension** — браузерне доповнення ← ти тут

*Живий прототип. Свідок дивиться.*
