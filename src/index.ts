import { Hono } from "hono";
import type { Env, CombinedResult } from "./types";
import { fetchDailyCandles } from "./stockData";
import { quantAnalyze } from "./analysis";
import { fetchCompanyNews } from "./finnhubNews";
import { analyzeWithGemini } from "./gemini";
import { combineSignals } from "./combine";
import { sendTelegramMessage } from "./telegram";

const app = new Hono<{ Bindings: Env }>();

// Your watchlist. Move this to KV later if you want to edit it without redeploying.
const WATCHLIST = ["AAPL", "MSFT", "NVDA"];

async function runFullAnalysis(env: Env, ticker: string): Promise<CombinedResult> {
  const candles = await fetchDailyCandles(ticker, env.STOCK_API_KEY);
  const quant = quantAnalyze(ticker, candles);

  const newsEnabled = env.ENABLE_NEWS !== "false"; // defaults to true

  let news: Awaited<ReturnType<typeof fetchCompanyNews>> = [];
  if (newsEnabled) {
    try {
      news = await fetchCompanyNews(ticker, env.FINNHUB_API_KEY);
    } catch (err) {
      // Never let news fetch failure block the whole analysis
      console.error(`News fetch failed for ${ticker}:`, (err as Error).message);
    }
  }

  let ai = null;
  try {
    ai = await analyzeWithGemini(env.GEMINI_API_KEY, quant, candles, news, env.GEMINI_MODEL);
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

// How many recent scheduler runs to keep in KV for later inspection via /logs
const LOG_HISTORY_LIMIT = 50;

interface RunLogEntry {
  timestamp: string;
  ticker: string;
  quantSignal: string;
  quantReasons: string[];
  aiSignal: string | null;
  aiConfidence: number | null;
  aiReasoning: string | null;
  newsConsidered: number | null;
  finalSignal: string;
  notified: boolean;
  error?: string;
}

async function appendLogEntry(env: Env, entry: RunLogEntry): Promise<void> {
  const raw = await env.STOCK_KV.get("run-log");
  const history: RunLogEntry[] = raw ? JSON.parse(raw) : [];
  history.push(entry);
  // keep only the most recent N entries so the KV value doesn't grow unbounded
  const trimmed = history.slice(-LOG_HISTORY_LIMIT);
  await env.STOCK_KV.put("run-log", JSON.stringify(trimmed));
}

async function runScheduledAnalysis(env: Env, trigger: string): Promise<void> {
  const runStartedAt = new Date().toISOString();
  console.log(`[scheduler] triggered at ${runStartedAt} (cron: ${trigger}), watchlist: ${WATCHLIST.join(", ")}`);

  for (const ticker of WATCHLIST) {
    const timestamp = new Date().toISOString();
    try {
      const result = await runFullAnalysis(env, ticker);

      console.log(
          `[scheduler] ${ticker} — quant=${result.quant.signal} ` +
          `(${result.quant.reasons.join(", ") || "no rules triggered"}) ` +
          `ai=${result.ai ? `${result.ai.signal} @ ${(result.ai.confidence * 100).toFixed(0)}% (${result.ai.newsConsidered} headlines)` : "unavailable"} ` +
          `final=${result.finalSignal} price=$${result.quant.price.toFixed(2)}`
      );

      const lastSignalKey = `last-signal:${ticker}`;
      const lastSignal = await env.STOCK_KV.get(lastSignalKey);
      const willNotify = result.finalSignal !== "HOLD" && result.finalSignal !== lastSignal;

      if (willNotify) {
        const aiLine = result.ai
            ? `\nAI (${(result.ai.confidence * 100).toFixed(0)}% conf, ${result.ai.newsConsidered} headlines): ${result.ai.signal} — ${result.ai.reasoning}`
            : `\nAI: unavailable, quant-only`;

        const message =
            `*${result.finalSignal}* signal for *${ticker}*\n` +
            `Price: $${result.quant.price.toFixed(2)}\n` +
            `Quant: ${result.quant.signal} — ${result.quant.reasons.join(", ") || "no rules triggered"}` +
            aiLine;

        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, message);
        console.log(`[scheduler] ${ticker} — Telegram notification sent (${result.finalSignal})`);
      }

      await env.STOCK_KV.put(lastSignalKey, result.finalSignal);

      await appendLogEntry(env, {
        timestamp,
        ticker,
        quantSignal: result.quant.signal,
        quantReasons: result.quant.reasons,
        aiSignal: result.ai?.signal ?? null,
        aiConfidence: result.ai?.confidence ?? null,
        aiReasoning: result.ai?.reasoning ?? null,
        newsConsidered: result.ai?.newsConsidered ?? null,
        finalSignal: result.finalSignal,
        notified: willNotify,
      });
    } catch (err) {
      const message = (err as Error).message;
      console.error(`[scheduler] ${ticker} — failed: ${message}`);
      await appendLogEntry(env, {
        timestamp,
        ticker,
        quantSignal: "ERROR",
        quantReasons: [],
        aiSignal: null,
        aiConfidence: null,
        aiReasoning: null,
        newsConsidered: null,
        finalSignal: "ERROR",
        notified: false,
        error: message,
      });
    }
  }

  console.log(`[scheduler] run complete, started at ${runStartedAt}`);
}

// View recent scheduler run history: GET /logs (optionally /logs?limit=10)
app.get("/logs", async (c) => {
  const raw = await c.env.STOCK_KV.get("run-log");
  const history: RunLogEntry[] = raw ? JSON.parse(raw) : [];
  const limitParam = c.req.query("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : history.length;
  return c.json(history.slice(-limit).reverse()); // most recent first
});

export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduledAnalysis(env, event.cron));
  },
};