export interface Env {
  STOCK_KV: KVNamespace;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  STOCK_API_KEY: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL?: string; // optional override
  FINNHUB_API_KEY: string; // free tier: company news endpoint
  ENABLE_NEWS?: string; // "true"/"false" — toggles fetching + feeding news to Gemini
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Signal = "BUY" | "SELL" | "HOLD";

// Output of the rule-based quant layer (RSI/MACD/SMA)
export interface QuantResult {
  ticker: string;
  signal: Signal;
  reasons: string[];
  price: number;
  indicators: {
    rsi: number | null;
    macdHistogram: number | null;
    smaFast: number | null;
    smaSlow: number | null;
  };
}

// A single news headline fetched from Finnhub
export interface NewsHeadline {
  headline: string;
  summary: string;
  source: string;
  url: string;
  datetime: number; // unix seconds
}

// Output of the Gemini reasoning layer
export interface AiResult {
  signal: Signal;
  confidence: number; // 0-1
  reasoning: string;
  newsConsidered: number; // how many headlines were fed in, 0 if news disabled/unavailable
}

// Final combined result sent to Telegram / returned by the API
export interface CombinedResult {
  ticker: string;
  quant: QuantResult;
  ai: AiResult | null; // null if Gemini call failed — quant-only fallback
  finalSignal: Signal;
}