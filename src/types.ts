export interface Env {
  STOCK_KV: KVNamespace;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  STOCK_API_KEY: string;
  ANTHROPIC_API_KEY?: string;
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

export interface AnalysisResult {
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
