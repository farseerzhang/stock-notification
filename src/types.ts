export interface Env {
  STOCK_KV: KVNamespace;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  STOCK_API_KEY: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL?: string; // optional override, defaults to gemini-2.5-flash
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

// Output of the Gemini reasoning layer
export interface AiResult {
  signal: Signal;
  confidence: number; // 0-1
  reasoning: string;
}

// Final combined result sent to Telegram / returned by the API
export interface CombinedResult {
  ticker: string;
  quant: QuantResult;
  ai: AiResult | null; // null if Gemini call failed — quant-only fallback
  finalSignal: Signal;
}
