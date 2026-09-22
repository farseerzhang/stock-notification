import { Hono } from "hono";
import type { Env, AnalysisResult } from "./types";
import { fetchDailyCandles } from "./stockData";
import { analyze } from "./analysis";
import { sendTelegramMessage } from "./telegram";

const app = new Hono<{ Bindings: Env }>();

// Your watchlist. Move this to KV later if you want to edit it without redeploying.
const WATCHLIST = ["AAPL", "MSFT", "NVDA"];

// Manual trigger endpoint: GET /analyze/AAPL — useful for testing without waiting for cron
app.get("/analyze/:ticker", async (c) => {
  const ticker = c.req.param("ticker").toUpperCase();
  try {
    const candles = await fetchDailyCandles(ticker, c.env.STOCK_API_KEY);
    const result = analyze(ticker, candles);
    return c.json(result);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// Health check
app.get("/", (c) => c.text("stock-notifier is running"));

async function runScheduledAnalysis(env: Env): Promise<void> {
  const results: AnalysisResult[] = [];

  for (const ticker of WATCHLIST) {
    try {
      const candles = await fetchDailyCandles(ticker, env.STOCK_API_KEY);
      const result = analyze(ticker, candles);
      results.push(result);

      // Avoid spamming: only notify if the signal changed since last run
      const lastSignalKey = `last-signal:${ticker}`;
      const lastSignal = await env.STOCK_KV.get(lastSignalKey);

      if (result.signal !== "HOLD" && result.signal !== lastSignal) {
        const message =
          `*${result.signal}* signal for *${ticker}*\n` +
          `Price: $${result.price.toFixed(2)}\n` +
          `Reasons: ${result.reasons.join(", ")}`;

        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, message);
      }

      await env.STOCK_KV.put(lastSignalKey, result.signal);
    } catch (err) {
      console.error(`Failed to analyze ${ticker}:`, (err as Error).message);
    }
  }
}

export default {
  fetch: app.fetch,

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduledAnalysis(env));
  },
};
