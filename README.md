# Stock Notifier

Cloudflare Worker that analyzes equities on a schedule and sends BUY/SELL
signals to Telegram. Designed to run on Cloudflare's free tier and to be
conservative by default: a rule-based quant layer drives signals, while an
optional Gemini (Generative Language) reasoning layer can provide
additional context and influence the final verdict.

This README describes the current implementation and how to run/deploy it.

Highlights
- Rule-based quant layer (RSI, MACD histogram, SMA20/50) in `src/analysis.ts`.
- Optional AI reasoning via Google Generative Language (Gemini) in `src/gemini.ts`.
- Company news and simple fundamentals fetched from Finnhub (`src/finnhubNews.ts`, `src/fundamentals.ts`).
- Notifications are sent to Telegram (`src/telegram.ts`).
- State is stored in Workers KV: per-ticker last signal and a recent run log.

Prerequisites
- Node.js (recommended LTS)
- Wrangler (Cloudflare Workers CLI)
- A Telegram bot token and chat id
- A stock price API key (Twelve Data recommended)
- A Finnhub API key (for news and fundamentals)
- Optional: a Google Generative Language API key (Gemini) if you want the AI layer

Quick setup
1) Install dependencies
```bash
npm install
```

2) Create a KV namespace for run state
```bash
npx wrangler kv:namespace create "STOCK_KV"
```
Copy the returned id into `wrangler.toml` under `[[kv_namespaces]]`.

3) Add required secrets (do NOT commit secrets into source control)
```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put STOCK_API_KEY      # Twelve Data
npx wrangler secret put FINNHUB_API_KEY    # Finnhub (news + fundamentals)
# Optional for AI: npx wrangler secret put GEMINI_API_KEY
```

4) Edit the watchlist
Open `src/index.ts` and update the `WATCHLIST` array to the tickers you want monitored. (Moving the watchlist into KV is recommended for runtime edits without redeploying.)

5) Optional toggles
- `ENABLE_NEWS`: set to `false` (string) to disable fetching news.
- `ENABLE_FUNDAMENTALS`: set to `false` (string) to disable fundamentals fetches.
- `GEMINI_MODEL`: set to override the default Gemini model (defaults to `gemini-3.5-flash-lite`).

Local testing
```bash
npm run dev
```
Useful local routes while the worker is running:
- GET /               — health check (returns "stock-notifier is running")
- GET /analyze/:ticker — run full analysis for a ticker (quant + optional AI/news/fundamentals)
- GET /test-telegram   — verify Telegram wiring (sends a test message)
- GET /logs            — view recent scheduler run history (supports `?limit=N`)

Deployment
```bash
npm run deploy
```
The project uses a cron trigger (configured in `wrangler.toml`) to run every 15 minutes during US market hours by default — adjust that schedule to taste.

How the analysis works (high level)
- `src/stockData.ts` fetches daily OHLCV candles from Twelve Data and returns a chronological `Candle[]`.
- `src/analysis.ts` computes RSI(14), MACD histogram, SMA(20) and SMA(50), and scores simple buy/sell rules to produce a rule-based `QuantResult`.
- `src/finnhubNews.ts` fetches recent headlines (deduplicated, up to 8) from Finnhub.
- `src/fundamentals.ts` pulls a small set of fundamental metrics from Finnhub and returns nulls for missing fields.
- `src/gemini.ts` (optional) feeds the quant output, recent closes, news and fundamentals to Gemini and requests a JSON-only structured verdict.
- `src/combine.ts` combines quant + AI: the default is conservative — the final signal is the quant signal unless Gemini either agrees or strongly (>=75% confidence) disagrees.
- `src/telegram.ts` posts messages to Telegram in Markdown format.

What is stored in KV
- `last-signal:<TICKER>` — the last final signal sent for a ticker (used to avoid noisy repeat notifications).
- `run-log` — an array of recent run entries (kept to a limit, currently 50) for inspection via the `/logs` route.

Operational notes & troubleshooting
- If the Gemini call fails or returns invalid JSON, the worker falls back to the quant-only signal — this keeps the pipeline resilient.
- If you change the watchlist or rewrite history locally, remember to deploy and (optionally) clear/adjust KV keys.
- Telegram errors will surface in logs; call `/test-telegram` to validate credentials and chat id.
- If notifications are missing: confirm `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and that the bot has been messaged (so it can see the chat).

Extensibility ideas
- Move the watchlist into KV and add authenticated API routes to manage it at runtime.
- Add backtesting harness for the quant rules using historical candles.
- Add rate-limiting / retry logic for third-party API calls.

Useful endpoints summary
- GET /               — health
- GET /analyze/:ticker — manual analysis
- GET /test-telegram   — test Telegram
- GET /logs            — recent scheduler history

