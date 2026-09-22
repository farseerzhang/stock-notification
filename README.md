# Stock Notifier

Cloudflare Worker that analyzes stocks on a schedule and sends BUY/SELL
signals to Telegram. Runs entirely on Cloudflare's free tier.

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Create a KV namespace
```bash
npx wrangler kv:namespace create "STOCK_KV"
```
Copy the returned `id` into `wrangler.toml` under `[[kv_namespaces]]`.

### 3. Create a Telegram bot
1. Message **@BotFather** on Telegram, run `/newbot`, follow the prompts.
2. Copy the bot token it gives you.
3. Send any message to your new bot (so it can see your chat).
4. Visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser
   and find `"chat":{"id": ...}` — that number is your chat ID.

### 4. Get a stock data API key
Sign up for a free key at [Twelve Data](https://twelvedata.com/) (800
requests/day free tier). Swap `src/stockData.ts` for another provider
(Finnhub, Alpha Vantage) if you prefer.

### 5. Set secrets
```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put STOCK_API_KEY
```

### 6. Edit your watchlist
Open `src/index.ts` and change the `WATCHLIST` array to the tickers you
want tracked.

### 7. Adjust the cron schedule (optional)
`wrangler.toml` currently runs every 15 minutes, Mon-Fri, 13:00-21:00 UTC
(covers US market hours across DST). Adjust to taste — see
[crontab.guru](https://crontab.guru/) for syntax help.

### 8. Test locally
```bash
npm run dev
```
Then visit `http://localhost:8787/analyze/AAPL` to test the analysis
logic without waiting for the cron trigger.

### 9. Deploy
```bash
npm run deploy
```

### 10. Watch logs live (optional)
```bash
npm run tail
```

## How it works

- **`src/stockData.ts`** — fetches daily OHLCV candles from Twelve Data
- **`src/analysis.ts`** — computes RSI, MACD, SMA20/50 and combines them
  into a BUY/SELL/HOLD signal via simple scoring rules
- **`src/telegram.ts`** — sends the alert message
- **`src/index.ts`** — Hono app with a manual test route
  (`/analyze/:ticker`) and the `scheduled()` handler Cloudflare Cron
  Triggers call automatically

State (last signal per ticker) is stored in KV so you only get notified
when the signal *changes*, not on every single cron run.

## Next steps to consider

- Move `WATCHLIST` into KV so you can edit it via an API route instead
  of redeploying
- Add an `/watchlist` POST route to add/remove tickers from Telegram
  itself (Telegram webhook → Worker route)
- Backtest the strategy thresholds in `analysis.ts` against historical
  data before trusting it with real signals
- If adding AI-based reasoning, call the Anthropic API from the
  `scheduled()` handler with the computed indicators as context, rather
  than replacing the quant layer entirely — cheaper and more reliable
