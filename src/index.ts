import { Hono } from "hono";
import type { Env, CombinedResult } from "./types";
import { fetchDailyCandles } from "./stockData";
import { quantAnalyze } from "./analysis";
import { analyzeWithGemini } from "./gemini";
import { combineSignals } from "./combine";
import { sendTelegramMessage } from "./telegram";

const app = new Hono<{ Bindings: Env }>();

// Your watchlist. Move this to KV later if you want to edit it without redeploying.
const WATCHLIST = ["RMBS", "MSFT", "NVDA"];

async function runFullAnalysis(env: Env, ticker: string): Promise<CombinedResult> {
  const candles = await fetchDailyCandles(ticker, env.STOCK_API_KEY);
  const quant = quantAnalyze(ticker, candles);

  let ai = null;
  try {
    ai = await analyzeWithGemini(env.GEMINI_API_KEY, quant, candles, env.GEMINI_MODEL);
  } catch (err) {
    // Never let a Gemini failure break the pipeline — quant-only fallback
    console.error(`Gemini analysis failed for ${ticker}:`, (err as Error).message);
  }

  return combineSignals(ticker, quant, ai);
}

// Manual trigger endpoint: GET /analyze/AAPL — test both layers without waiting for cron
app.get("/analyze/:ticker", async (c) => {
  const ticker = c.req.param("ticker").toUpperCase();
  try {
    const result = await runFullAnalysis(c.env, ticker);
    return c.json(result);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// Debug route: confirms Telegram wiring independent of market conditions
app.get("/test-telegram", async (c) => {
  try {
    await sendTelegramMessage(
        c.env.TELEGRAM_BOT_TOKEN,
        c.env.TELEGRAM_CHAT_ID,
        "✅ Test message from stock-notifier — Telegram wiring works."
    );
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// Health check
app.get("/", (c) => c.text("stock-notifier is running"));

async function runScheduledAnalysis(env: Env): Promise<void> {
  for (const ticker of WATCHLIST) {
    try {
      const result = await runFullAnalysis(env, ticker);

      const lastSignalKey = `last-signal:${ticker}`;
      const lastSignal = await env.STOCK_KV.get(lastSignalKey);

      if (result.finalSignal !== "HOLD" && result.finalSignal !== lastSignal) {
        const aiLine = result.ai
            ? `\nAI (${(result.ai.confidence * 100).toFixed(0)}% conf): ${result.ai.signal} — ${result.ai.reasoning}`
            : `\nAI: unavailable, quant-only`;

        const message =
            `*${result.finalSignal}* signal for *${ticker}*\n` +
            `Price: $${result.quant.price.toFixed(2)}\n` +
            `Quant: ${result.quant.signal} — ${result.quant.reasons.join(", ") || "no rules triggered"}` +
            aiLine;

        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, message);
      }

      await env.STOCK_KV.put(lastSignalKey, result.finalSignal);
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
