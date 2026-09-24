# Stock Notifier

A Cloudflare Worker that analyzes US stocks on a schedule, combining
rule-based technical indicators with an AI reasoning layer (Gemini) that
also factors in recent news and company fundamentals — then sends a
BUY/SELL alert straight to Telegram when the signal is worth acting on.

Runs entirely on free tiers: Cloudflare Workers, Twelve Data, Finnhub, and
Gemini's free quota (with one optional paid path — see **Costs** below).

---

## How it works

Every 15 minutes during US market hours, a Cloudflare Cron Trigger wakes
the Worker up, which for each ticker in your watchlist:

1. **Fetches price data** (Twelve Data) → computes RSI, MACD, and SMA20/50
   crossover → produces a rule-based **quant signal** (BUY/SELL/HOLD)
2. **Fetches recent news headlines** (Finnhub, last 7 days)
3. **Fetches fundamentals** (Finnhub) — P/E, EPS, revenue growth,
   debt-to-equity, market cap
4. **Sends all of the above to Gemini**, which weighs technicals,
   fundamentals, and news together and returns its own signal + confidence
   + reasoning
5. **Combines both layers** into one final signal:
   - Quant and AI agree → go with it
   - AI disagrees with ≥75% confidence → surface AI's view (worth watching
     closely)
   - AI disagrees without high confidence → stay cautious, HOLD
6. **If the final signal is BUY/SELL and different from last time**, sends
   a Telegram message with the full breakdown. State is stored in KV so you
   don't get repeat alerts for an unchanged signal.
7. Every run (per ticker) is logged — both to live console logs and to a
   rolling history in KV, viewable via `/logs`.

---

## Project structure

```
stock-notifier/
├── .gitignore
├── package.json
├── tsconfig.json
├── wrangler.toml
├── README.md
└── src/
    ├── index.ts          # Hono app: routes + scheduled() cron handler, orchestrates everything
    ├── types.ts           # Env bindings + all shared TypeScript types
    ├── stockData.ts        # Fetches daily OHLCV candles from Twelve Data
    ├── analysis.ts         # Rule-based quant signal: RSI + MACD + SMA20/50
    ├── finnhubNews.ts       # Fetches recent company news headlines (Finnhub)
    ├── fundamentals.ts       # Fetches P/E, EPS, revenue growth, debt/equity (Finnhub)
    ├── gemini.ts            # Sends indicators + news + fundamentals to Gemini, parses verdict
    ├── combine.ts            # Merges quant signal + AI signal into one final decision
    └── telegram.ts            # Sends the alert message to your Telegram chat
```

**File-by-file summary:**

| File | Purpose |
|---|---|
| `index.ts` | Entry point. Hono routes for manual testing + the `scheduled()` handler Cloudflare Cron calls automatically. Owns the watchlist, KV read/writes, and logging. |
| `types.ts` | `Env` interface (all bindings/secrets), `Candle`, `Signal`, `QuantResult`, `NewsHeadline`, `Fundamentals`, `AiResult`, `CombinedResult`. |
| `stockData.ts` | `fetchDailyCandles()` — pulls 100 days of daily candles from Twelve Data. |
| `analysis.ts` | `quantAnalyze()` — computes RSI(14), MACD(12,26,9), SMA(20)/SMA(50) via the `technicalindicators` npm package and scores them into BUY/SELL/HOLD. |
| `finnhubNews.ts` | `fetchCompanyNews()` — last 7 days of headlines, deduplicated, capped at 8. |
| `fundamentals.ts` | `fetchFundamentals()` — P/E, EPS TTM, revenue/share TTM, revenue growth YoY, debt-to-equity, market cap. Reads defensively since Finnhub's field names vary by company. |
| `gemini.ts` | `analyzeWithGemini()` — builds one prompt combining everything above, calls Gemini in JSON response mode, parses and validates the result. |
| `combine.ts` | `combineSignals()` — the agreement/override logic described above. |
| `telegram.ts` | `sendTelegramMessage()` — thin wrapper around the Telegram Bot API. |

---

## Prerequisites

- Node.js and npm installed locally
- A free [Cloudflare](https://dash.cloudflare.com/sign-up) account
- A GitHub repo (optional but recommended — see **Deploying** below)

---

## Setting up your accounts & getting each key

You'll need **four** external keys/tokens total. All are free tier.

### 1. Twelve Data (stock price data)
1. Sign up at [twelvedata.com](https://twelvedata.com/)
2. Your API key is shown on the **Dashboard** right after login (also under
   **Account → API Keys**)
3. Free tier: 800 requests/day, 8 requests/minute

### 2. Telegram bot + chat ID
1. Open Telegram, message **@BotFather**, send `/newbot`, follow the
   prompts → copy the **bot token** it gives you
2. Search for your new bot by the username you gave it, and send it any
   message (e.g. "hi") — required so Telegram has something to show you
3. In a browser, open:
   ```
   https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
   ```
4. Find `"chat": { "id": ... }` in the JSON response — that number is your
   **chat ID**
   - If `"result": []` (empty), send your bot a fresh message and reload
     the URL immediately after

### 3. Gemini API key (AI reasoning layer)
1. Get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Default model used is `gemini-3.6-flash`. If you hit a `404` saying a
   model is retired, or a `503` saying it's overloaded, you can override
   the model without a code change (see **Environment variables** below)

### 4. Finnhub API key (news + fundamentals)
1. Sign up at [finnhub.io/register](https://finnhub.io/register)
2. Your API key is shown on the dashboard immediately after signup
3. Free tier: 60 calls/minute — covers both the news and fundamentals
   endpoints with the same key

---

## Environment variables & secrets

Set in `wrangler.toml` (non-sensitive config) or via `wrangler secret put`
(everything sensitive — never commit these).

| Name | Type | Required | Notes |
|---|---|---|---|
| `STOCK_KV` | KV binding | Yes | Set in `wrangler.toml`, created via CLI |
| `TELEGRAM_BOT_TOKEN` | secret | Yes | From BotFather |
| `TELEGRAM_CHAT_ID` | secret | Yes | From `getUpdates` |
| `STOCK_API_KEY` | secret | Yes | Twelve Data key |
| `GEMINI_API_KEY` | secret | Yes | Google AI Studio key |
| `GEMINI_MODEL` | secret | No | Defaults to `gemini-3.6-flash` if unset. Override to swap models without redeploying code — e.g. `gemini-3.5-flash-lite` if the flagship model is overloaded (503) |
| `FINNHUB_API_KEY` | secret | Yes | Used for both news and fundamentals |
| `ENABLE_NEWS` | secret | No | `"false"` disables the Finnhub news fetch + Gemini's use of it. Defaults to enabled |
| `ENABLE_FUNDAMENTALS` | secret | No | `"false"` disables the Finnhub fundamentals fetch. Defaults to enabled |

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Log in to Cloudflare
```bash
npx wrangler login
```
Opens a browser tab to authorize Wrangler.

### 3. Create the KV namespace
```bash
npx wrangler kv:namespace create "STOCK_KV"
```
Copy the returned `id` into `wrangler.toml` under `[[kv_namespaces]]`,
replacing `REPLACE_WITH_YOUR_KV_ID`.

### 4. Edit your watchlist
Open `src/index.ts` and change:
```typescript
const WATCHLIST = ["AAPL", "MSFT", "NVDA"];
```
to whatever tickers you want tracked.

### 5. Adjust the cron schedule (optional)
`wrangler.toml` runs every 15 minutes, Mon–Fri, 13:00–21:00 UTC (covers
US market hours across DST). Adjust with [crontab.guru](https://crontab.guru/)
if needed.

### 6. Do an initial CLI deploy (creates the Worker)
```bash
npx wrangler deploy
```
This must happen **before** setting secrets — secrets attach to a Worker
by name, so the Worker needs to exist first.

### 7. Set your secrets
```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put STOCK_API_KEY
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put FINNHUB_API_KEY
```
(Optional overrides: `GEMINI_MODEL`, `ENABLE_NEWS`, `ENABLE_FUNDAMENTALS`
— same `wrangler secret put <NAME>` pattern.)

### 8. Redeploy so the Worker picks up your watchlist/config changes
```bash
npx wrangler deploy
```

---

## Deploying

You have two options going forward:

### Option A — manual CLI deploy
```bash
npx wrangler deploy
```
Re-run this any time you change code or config.

### Option B — GitHub auto-deploy (recommended once things are stable)
1. Push your repo to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial stock notifier setup"
   git branch -M main
   git remote add origin <your-repo-url>
   git push -u origin main
   ```
2. In the Cloudflare dashboard → **Workers & Pages** → **Create** →
   **Import an existing Git repository** → select your repo
3. Cloudflare auto-detects `wrangler.toml` and deploys on every push to
   `main`

Note: secrets and the KV namespace are **not** created automatically by
the Git integration — do those once via CLI (steps 3 and 7 above)
regardless of which deploy method you use going forward.

---

## Testing

Replace `<your-subdomain>` with your actual Workers subdomain (shown at
the end of `wrangler deploy` output, or in the dashboard).

**Health check:**
```bash
curl https://stock-notifier.<your-subdomain>.workers.dev/
```
→ `stock-notifier is running`

**Full analysis for one ticker (manual, doesn't wait for cron):**
```bash
curl https://stock-notifier.<your-subdomain>.workers.dev/analyze/AAPL
```
→ JSON with `quant`, `ai` (signal/confidence/reasoning/newsConsidered/
fundamentalsConsidered), and `finalSignal`

**Confirm Telegram wiring independent of market conditions:**
```bash
curl https://stock-notifier.<your-subdomain>.workers.dev/test-telegram
```
→ should land a message in your Telegram chat immediately

**View recent scheduler run history:**
```bash
curl https://stock-notifier.<your-subdomain>.workers.dev/logs
curl "https://stock-notifier.<your-subdomain>.workers.dev/logs?limit=10"
```

**Watch live logs while cron fires (or while testing manually):**
```bash
npx wrangler tail
```
Leave running in one terminal, trigger requests in another — you'll see
`[scheduler]` log lines and any errors in real time.

**Confirm the cron trigger is registered:**
Dashboard → your Worker → **Triggers** tab, or check **Logs** for past
invocation timestamps.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `ai: null` in `/analyze` response | Gemini call threw an error (silently caught for pipeline resilience) | Run `wrangler tail`, re-trigger, read the actual error logged |
| Gemini `404 ... no longer available` | Model name retired | Set `GEMINI_MODEL` secret to the model Google's error message recommends |
| Gemini `503 ... high demand` | Transient overload on that model | Retry in a minute, or switch to a lighter model like `gemini-3.5-flash-lite` via `GEMINI_MODEL` |
| Finnhub `401 Unauthorized` | `FINNHUB_API_KEY` not set, wrong, or has a stray space | `wrangler secret list` to confirm it's set; test the key directly: `curl "https://finnhub.io/api/v1/company-news?symbol=AAPL&from=2026-09-17&to=2026-09-24&token=YOUR_KEY"` |
| No Telegram message ever arrives | Signal never left HOLD, or it's unchanged from last run (dedup via KV) | Use `/test-telegram` to isolate whether it's a wiring issue or just quiet market conditions |
| `/analyze/:ticker` 500 error | Usually `STOCK_API_KEY` invalid or ticker not recognized by Twelve Data | Check the error message in the response body |

---

## Costs — what's genuinely free vs. what to watch

- **Cloudflare Workers, Cron Triggers, KV**: free tier, ample headroom for
  this workload
- **Twelve Data**: free tier, 800 req/day — fine for a handful of tickers
  on a 15-min cron
- **Finnhub**: free tier, 60 calls/min — two calls per ticker per run
  (news + fundamentals), comfortably within limits
- **Gemini**: token usage has a free quota; stay on plain `generateContent`
  calls (no Google Search grounding tool) to avoid the separate
  per-search billing that applies beyond that quota — this project does
  **not** use search grounding, by design, for exactly this reason

With 3 tickers on the default 15-min/market-hours cron (~32 runs/day),
expect roughly:
- ~96 Twelve Data requests/day
- ~192 Finnhub requests/day
- ~32 Gemini calls/day

All well within free tiers. Expanding your watchlist or tightening the
cron interval scales these linearly — recheck the relevant free-tier caps
if you go much bigger.

---

## Next steps to consider

- Move `WATCHLIST` into KV so you can edit it via an API route instead of
  redeploying
- Add an endpoint to add/remove tickers from Telegram itself (Telegram
  webhook → Worker route)
- Backtest `analysis.ts`'s thresholds against historical data before
  trusting the quant layer with real signals
- Add retry-with-backoff around the Gemini call so a transient 503
  doesn't fall back to quant-only for that run
