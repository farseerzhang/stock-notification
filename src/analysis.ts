import { RSI, MACD, SMA } from "technicalindicators";
import type { Candle, QuantResult, Signal } from "./types";

/**
 * Simple rule-based strategy combining three well-known indicators:
 * - RSI: overbought/oversold
 * - MACD histogram: momentum shift
 * - SMA crossover (fast vs slow): trend direction
 *
 * This result feeds into the Gemini reasoning layer as grounding context —
 * see gemini.ts and combine.ts.
 */
export function quantAnalyze(ticker: string, candles: Candle[]): QuantResult {
  const closes = candles.map((c) => c.close);
  const latestPrice = closes[closes.length - 1];

  const rsiValues = RSI.calculate({ values: closes, period: 14 });
  const rsi = rsiValues.length ? rsiValues[rsiValues.length - 1] : null;

  const macdValues = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const macdHistogram = macdValues.length
      ? macdValues[macdValues.length - 1].histogram ?? null
      : null;
  const prevMacdHistogram =
      macdValues.length > 1 ? macdValues[macdValues.length - 2].histogram ?? null : null;

  const smaFastValues = SMA.calculate({ values: closes, period: 20 });
  const smaSlowValues = SMA.calculate({ values: closes, period: 50 });
  const smaFast = smaFastValues.length ? smaFastValues[smaFastValues.length - 1] : null;
  const smaSlow = smaSlowValues.length ? smaSlowValues[smaSlowValues.length - 1] : null;

  const reasons: string[] = [];
  let buyScore = 0;
  let sellScore = 0;

  if (rsi !== null) {
    if (rsi < 30) {
      buyScore++;
      reasons.push(`RSI oversold (${rsi.toFixed(1)})`);
    } else if (rsi > 70) {
      sellScore++;
      reasons.push(`RSI overbought (${rsi.toFixed(1)})`);
    }
  }

  if (macdHistogram !== null && prevMacdHistogram !== null) {
    if (prevMacdHistogram < 0 && macdHistogram > 0) {
      buyScore++;
      reasons.push("MACD bullish crossover");
    } else if (prevMacdHistogram > 0 && macdHistogram < 0) {
      sellScore++;
      reasons.push("MACD bearish crossover");
    }
  }

  if (smaFast !== null && smaSlow !== null) {
    if (smaFast > smaSlow) {
      buyScore++;
      reasons.push("Price trend up (SMA20 > SMA50)");
    } else {
      sellScore++;
      reasons.push("Price trend down (SMA20 < SMA50)");
    }
  }

  let signal: Signal = "HOLD";
  if (buyScore >= 2 && buyScore > sellScore) signal = "BUY";
  else if (sellScore >= 2 && sellScore > buyScore) signal = "SELL";

  return {
    ticker,
    signal,
    reasons,
    price: latestPrice,
    indicators: { rsi, macdHistogram, smaFast, smaSlow },
  };
}
