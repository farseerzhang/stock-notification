import { quantAnalyze } from "./analysis";
import type { Candle, BacktestConfig, BacktestTrade, BacktestResult, Signal } from "./types";

// Minimum candles needed before the quant layer produces a meaningful signal
// (SMA50 is the longest lookback among RSI/MACD/SMA).
const WARMUP_CANDLES = 50;

/**
 * Walks forward day-by-day through historical candles, computing the quant
 * signal at each point using ONLY data available up to that day (no
 * lookahead), and simulates a simple fully-in/fully-out strategy:
 *
 * - Enter a position on a BUY signal (if not already in one)
 * - Exit the position on a SELL signal (if currently in one)
 * - A signal must actually CHANGE to trigger an action — mirrors the live
 *   bot's dedup behavior, so backtest results reflect what you'd actually
 *   have been notified about
 * - No shorting: a SELL signal while flat is just noted, not acted on
 * - Any position still open at the end of the window is closed at the
 *   final candle's price for reporting purposes (marked as such in the
 *   trade log)
 */
export function runBacktest(
  ticker: string,
  candles: Candle[],
  config: BacktestConfig
): BacktestResult {
  if (candles.length <= WARMUP_CANDLES) {
    throw new Error(
      `Not enough candles for a backtest: got ${candles.length}, need more than ${WARMUP_CANDLES}`
    );
  }

  const trades: BacktestTrade[] = [];
  let lastSignal: Signal = "HOLD";
  let openPosition: { entryDate: string; entryPrice: number; entryIndex: number } | null = null;

  let capital = config.startingCapital;
  const equityCurve: number[] = [];

  // Evaluate starting once we have enough warm-up history
  for (let i = WARMUP_CANDLES; i < candles.length; i++) {
    const windowCandles = candles.slice(0, i + 1); // no lookahead
    const today = candles[i];
    const quant = quantAnalyze(ticker, windowCandles);

    if (quant.signal !== lastSignal) {
      if (quant.signal === "BUY" && !openPosition) {
        openPosition = {
          entryDate: new Date(today.timestamp).toISOString().split("T")[0],
          entryPrice: today.close,
          entryIndex: i,
        };
      } else if (quant.signal === "SELL" && openPosition) {
        const exitPrice = today.close;
        const returnPct = ((exitPrice - openPosition.entryPrice) / openPosition.entryPrice) * 100;
        capital = capital * (exitPrice / openPosition.entryPrice);

        trades.push({
          entryDate: openPosition.entryDate,
          entryPrice: openPosition.entryPrice,
          exitDate: new Date(today.timestamp).toISOString().split("T")[0],
          exitPrice,
          holdingDays: i - openPosition.entryIndex,
          returnPct,
          exitReason: "SELL signal",
        });

        openPosition = null;
      }
      lastSignal = quant.signal;
    }

    // Track equity curve for drawdown calc: mark-to-market if in a position
    const markToMarket = openPosition
      ? capital * (today.close / openPosition.entryPrice)
      : capital;
    equityCurve.push(markToMarket);
  }

  // Close any still-open position at the final candle for reporting
  const lastCandle = candles[candles.length - 1];
  if (openPosition) {
    const exitPrice = lastCandle.close;
    const returnPct = ((exitPrice - openPosition.entryPrice) / openPosition.entryPrice) * 100;
    capital = capital * (exitPrice / openPosition.entryPrice);

    trades.push({
      entryDate: openPosition.entryDate,
      entryPrice: openPosition.entryPrice,
      exitDate: new Date(lastCandle.timestamp).toISOString().split("T")[0],
      exitPrice,
      holdingDays: candles.length - 1 - openPosition.entryIndex,
      returnPct,
      exitReason: "end of backtest window",
    });
  }

  const totalReturnPct = ((capital - config.startingCapital) / config.startingCapital) * 100;

  const maxDrawdownPct = computeMaxDrawdown(equityCurve);

  const closedTrades = trades.filter((t) => t.returnPct !== null);
  const winningTrades = closedTrades.filter((t) => (t.returnPct ?? 0) > 0);
  const winRatePct = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : null;

  const holdingDaysList = closedTrades
    .map((t) => t.holdingDays)
    .filter((d): d is number => d !== null);
  const avgHoldingDays =
    holdingDaysList.length > 0
      ? holdingDaysList.reduce((a, b) => a + b, 0) / holdingDaysList.length
      : null;

  const evalStartCandle = candles[WARMUP_CANDLES];
  const buyAndHoldReturnPct =
    ((lastCandle.close - evalStartCandle.close) / evalStartCandle.close) * 100;

  return {
    ticker,
    fromDate: new Date(evalStartCandle.timestamp).toISOString().split("T")[0],
    toDate: new Date(lastCandle.timestamp).toISOString().split("T")[0],
    candlesEvaluated: candles.length - WARMUP_CANDLES,
    startingCapital: config.startingCapital,
    endingCapital: Math.round(capital * 100) / 100,
    totalReturnPct: Math.round(totalReturnPct * 100) / 100,
    maxDrawdownPct: Math.round(maxDrawdownPct * 100) / 100,
    winRatePct: winRatePct !== null ? Math.round(winRatePct * 100) / 100 : null,
    totalTrades: closedTrades.length,
    avgHoldingDays: avgHoldingDays !== null ? Math.round(avgHoldingDays * 10) / 10 : null,
    buyAndHoldReturnPct: Math.round(buyAndHoldReturnPct * 100) / 100,
    trades,
  };
}

function computeMaxDrawdown(equityCurve: number[]): number {
  let peak = -Infinity;
  let maxDrawdown = 0;

  for (const value of equityCurve) {
    if (value > peak) peak = value;
    const drawdown = ((peak - value) / peak) * 100;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  return maxDrawdown;
}
