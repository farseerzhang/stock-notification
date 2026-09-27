import { html, raw } from "hono/html";

/**
 * Renders the dashboard as a single self-contained HTML page. No build
 * step, no JSX, no external framework — just Hono's `html` tagged
 * template plus vanilla JavaScript that calls the existing JSON routes
 * with fetch(). Nothing about the API changes; this is purely a client
 * sitting on top of routes that already exist.
 *
 * Deliberately unauthenticated for now (matches the rest of the API) —
 * see README's "Watchlist management" section for the note on locking
 * this down later.
 */
export function renderDashboard() {
  return html`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Stock Notifier Dashboard</title>
<style>${raw(css)}</style>
</head>
<body>
  <header>
    <h1>Stock Notifier</h1>
    <p class="subtitle">Quant + AI signals, backtesting, and watchlist management</p>
  </header>

  <main>
    <section class="card" id="watchlist-section">
      <h2>Watchlist</h2>
      <ul id="watchlist-list" class="ticker-list"><li class="muted">Loading…</li></ul>
      <div class="row">
        <input id="watchlist-add-input" type="text" placeholder="e.g. TSLA" maxlength="10" />
        <button id="watchlist-add-btn">Add</button>
      </div>
      <p id="watchlist-error" class="error"></p>
    </section>

    <section class="card" id="analyze-section">
      <h2>Analyze</h2>
      <div class="row">
        <input id="analyze-ticker-input" type="text" placeholder="Ticker, e.g. AAPL" maxlength="10" />
        <button id="analyze-btn">Analyze</button>
      </div>
      <div id="analyze-result"></div>
    </section>

    <section class="card" id="backtest-section">
      <h2>Backtest</h2>
      <div class="row">
        <input id="backtest-ticker-input" type="text" placeholder="Ticker, e.g. AAPL" maxlength="10" />
        <input id="backtest-days-input" type="number" placeholder="Days (default 500)" min="51" />
        <input id="backtest-capital-input" type="number" placeholder="Capital (default 10000)" min="1" />
        <button id="backtest-btn">Run backtest</button>
      </div>
      <div id="backtest-result"></div>
    </section>

    <section class="card" id="logs-section">
      <h2>Recent scheduler runs</h2>
      <div class="row">
        <button id="logs-refresh-btn">Refresh</button>
      </div>
      <div id="logs-result"></div>
    </section>
  </main>

  <script>${raw(clientJs)}</script>
</body>
</html>`;
}

const css = `
  :root {
    color-scheme: light dark;
    --bg: #0f1115;
    --card-bg: #171a21;
    --border: #2a2e37;
    --text: #e8e9ec;
    --muted: #8a8f9a;
    --accent: #4f8cff;
    --green: #3fbf6f;
    --red: #e5534b;
    --yellow: #d9a441;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    max-width: 900px;
    margin-inline: auto;
  }
  header { margin-bottom: 24px; }
  h1 { margin: 0 0 4px 0; font-size: 1.6rem; }
  .subtitle { margin: 0; color: var(--muted); font-size: 0.9rem; }
  main { display: flex; flex-direction: column; gap: 20px; }
  .card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px 20px;
  }
  .card h2 { margin-top: 0; font-size: 1.1rem; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
  input {
    background: #0f1115;
    border: 1px solid var(--border);
    color: var(--text);
    padding: 8px 10px;
    border-radius: 6px;
    font-size: 0.9rem;
  }
  input[type="text"] { flex: 1; min-width: 120px; }
  input[type="number"] { width: 140px; }
  button {
    background: var(--accent);
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 0.9rem;
    cursor: pointer;
  }
  button:hover { opacity: 0.9; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .ticker-list { list-style: none; padding: 0; margin: 0 0 12px 0; display: flex; flex-wrap: wrap; gap: 8px; }
  .ticker-list li {
    background: #1f232c;
    border: 1px solid var(--border);
    padding: 6px 10px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
  }
  .ticker-list .remove-btn {
    background: transparent;
    color: var(--red);
    padding: 0 4px;
    font-size: 1rem;
    line-height: 1;
  }
  .muted { color: var(--muted); font-size: 0.9rem; }
  .error { color: var(--red); font-size: 0.85rem; min-height: 1.2em; margin: 4px 0 0 0; }
  .signal-badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 999px;
    font-weight: 600;
    font-size: 0.8rem;
    text-transform: uppercase;
  }
  .signal-BUY { background: rgba(63,191,111,0.15); color: var(--green); }
  .signal-SELL { background: rgba(229,83,75,0.15); color: var(--red); }
  .signal-HOLD { background: rgba(217,164,65,0.15); color: var(--yellow); }
  .signal-ERROR { background: rgba(229,83,75,0.25); color: var(--red); }
  .result-block { margin-top: 8px; font-size: 0.9rem; line-height: 1.5; }
  .result-block p { margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 8px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 500; }
`;

const clientJs = `
function signalBadge(signal) {
  return '<span class="signal-badge signal-' + signal + '">' + signal + '</span>';
}

function showError(elId, message) {
  var el = document.getElementById(elId);
  if (el) el.textContent = message || '';
}

// --- Watchlist ---

async function loadWatchlist() {
  showError('watchlist-error', '');
  var listEl = document.getElementById('watchlist-list');
  try {
    var res = await fetch('/watchlist');
    var data = await res.json();
    if (!data.watchlist || data.watchlist.length === 0) {
      listEl.innerHTML = '<li class="muted">No tickers yet</li>';
      return;
    }
    listEl.innerHTML = data.watchlist.map(function (ticker) {
      return '<li>' + ticker + ' <button class="remove-btn" data-ticker="' + ticker + '" title="Remove">&times;</button></li>';
    }).join('');
    Array.prototype.forEach.call(listEl.querySelectorAll('.remove-btn'), function (btn) {
      btn.addEventListener('click', function () { removeTicker(btn.dataset.ticker); });
    });
  } catch (err) {
    listEl.innerHTML = '<li class="muted">Failed to load</li>';
    showError('watchlist-error', err.message);
  }
}

async function addTicker() {
  var input = document.getElementById('watchlist-add-input');
  var ticker = input.value.trim().toUpperCase();
  if (!ticker) return;
  showError('watchlist-error', '');
  try {
    var res = await fetch('/watchlist/' + ticker, { method: 'POST' });
    if (!res.ok) throw new Error('Request failed: ' + res.status);
    input.value = '';
    await loadWatchlist();
  } catch (err) {
    showError('watchlist-error', err.message);
  }
}

async function removeTicker(ticker) {
  showError('watchlist-error', '');
  try {
    var res = await fetch('/watchlist/' + ticker, { method: 'DELETE' });
    if (!res.ok) throw new Error('Request failed: ' + res.status);
    await loadWatchlist();
  } catch (err) {
    showError('watchlist-error', err.message);
  }
}

// --- Analyze ---

async function runAnalyze() {
  var ticker = document.getElementById('analyze-ticker-input').value.trim().toUpperCase();
  var resultEl = document.getElementById('analyze-result');
  if (!ticker) return;
  resultEl.innerHTML = '<p class="muted">Loading…</p>';
  try {
    var res = await fetch('/analyze/' + ticker);
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    var out = '<div class="result-block">';
    out += '<p><strong>' + data.ticker + '</strong> — Final: ' + signalBadge(data.finalSignal) + ' &nbsp; Price: $' + data.quant.price.toFixed(2) + '</p>';
    out += '<p>Quant: ' + signalBadge(data.quant.signal) + ' — ' + (data.quant.reasons.join(', ') || 'no rules triggered') + '</p>';
    if (data.ai) {
      out += '<p>AI (' + Math.round(data.ai.confidence * 100) + '% conf, ' + data.ai.newsConsidered + ' headlines' + (data.ai.fundamentalsConsidered ? ', fundamentals' : '') + '): ' + signalBadge(data.ai.signal) + ' — ' + data.ai.reasoning + '</p>';
    } else {
      out += '<p class="muted">AI: unavailable, quant-only fallback</p>';
    }
    out += '</div>';
    resultEl.innerHTML = out;
  } catch (err) {
    resultEl.innerHTML = '<p class="error">' + err.message + '</p>';
  }
}

// --- Backtest ---

async function runBacktestUi() {
  var ticker = document.getElementById('backtest-ticker-input').value.trim().toUpperCase();
  var days = document.getElementById('backtest-days-input').value;
  var capital = document.getElementById('backtest-capital-input').value;
  var resultEl = document.getElementById('backtest-result');
  if (!ticker) return;

  var url = '/backtest/' + ticker + '?';
  if (days) url += 'days=' + encodeURIComponent(days) + '&';
  if (capital) url += 'capital=' + encodeURIComponent(capital);

  resultEl.innerHTML = '<p class="muted">Running backtest…</p>';
  try {
    var res = await fetch(url);
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    var out = '<div class="result-block">';
    out += '<p>' + data.fromDate + ' \u2192 ' + data.toDate + ' (' + data.candlesEvaluated + ' days evaluated)</p>';
    out += '<p>Total return: <strong>' + data.totalReturnPct + '%</strong> &nbsp; Buy &amp; hold: ' + data.buyAndHoldReturnPct + '%</p>';
    out += '<p>Max drawdown: ' + data.maxDrawdownPct + '% &nbsp; Win rate: ' + (data.winRatePct !== null ? data.winRatePct + '%' : 'n/a') + ' &nbsp; Trades: ' + data.totalTrades + '</p>';
    out += '<p>Ending capital: $' + data.endingCapital.toLocaleString() + ' (from $' + data.startingCapital.toLocaleString() + ')</p>';

    if (data.trades.length > 0) {
      out += '<table><thead><tr><th>Entry</th><th>Entry $</th><th>Exit</th><th>Exit $</th><th>Days</th><th>Return</th></tr></thead><tbody>';
      data.trades.forEach(function (t) {
        out += '<tr><td>' + t.entryDate + '</td><td>' + t.entryPrice.toFixed(2) + '</td><td>' + (t.exitDate || '\u2014') + '</td><td>' + (t.exitPrice !== null ? t.exitPrice.toFixed(2) : '\u2014') + '</td><td>' + (t.holdingDays !== null ? t.holdingDays : '\u2014') + '</td><td>' + (t.returnPct !== null ? t.returnPct.toFixed(2) + '%' : '\u2014') + '</td></tr>';
      });
      out += '</tbody></table>';
    }
    out += '</div>';
    resultEl.innerHTML = out;
  } catch (err) {
    resultEl.innerHTML = '<p class="error">' + err.message + '</p>';
  }
}

// --- Logs ---

async function loadLogs() {
  var resultEl = document.getElementById('logs-result');
  resultEl.innerHTML = '<p class="muted">Loading…</p>';
  try {
    var res = await fetch('/logs?limit=20');
    var data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      resultEl.innerHTML = '<p class="muted">No scheduler runs logged yet</p>';
      return;
    }
    var out = '<table><thead><tr><th>Time</th><th>Ticker</th><th>Quant</th><th>AI</th><th>Final</th><th>Notified</th></tr></thead><tbody>';
    data.forEach(function (entry) {
      out += '<tr><td>' + entry.timestamp + '</td><td>' + entry.ticker + '</td><td>' + signalBadge(entry.quantSignal) + '</td><td>' + (entry.aiSignal ? signalBadge(entry.aiSignal) : '\u2014') + '</td><td>' + signalBadge(entry.finalSignal) + '</td><td>' + (entry.notified ? 'Yes' : 'No') + '</td></tr>';
      if (entry.error) {
        out += '<tr><td colspan="6" class="error">' + entry.error + '</td></tr>';
      }
    });
    out += '</tbody></table>';
    resultEl.innerHTML = out;
  } catch (err) {
    resultEl.innerHTML = '<p class="error">' + err.message + '</p>';
  }
}

// --- Wire up ---

document.addEventListener('DOMContentLoaded', function () {
  loadWatchlist();
  loadLogs();

  document.getElementById('watchlist-add-btn').addEventListener('click', addTicker);
  document.getElementById('watchlist-add-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') addTicker();
  });

  document.getElementById('analyze-btn').addEventListener('click', runAnalyze);
  document.getElementById('analyze-ticker-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') runAnalyze();
  });

  document.getElementById('backtest-btn').addEventListener('click', runBacktestUi);

  document.getElementById('logs-refresh-btn').addEventListener('click', loadLogs);
});
`;
