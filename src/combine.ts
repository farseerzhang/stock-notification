import type { QuantResult, AiResult, Signal, CombinedResult } from "./types";

/**
 * Combines the rule-based quant signal with Gemini's reasoning into one
 * final signal. Conservative by design: only acts on BUY/SELL when both
 * layers agree, OR when Gemini strongly disagrees with high confidence
 * (which is treated as a flag worth surfacing, not blindly followed).
 *
 * Tune AGREEMENT thresholds here as you build confidence in the AI layer.
 */
const HIGH_CONFIDENCE_OVERRIDE = 0.75;

export function combineSignals(
  ticker: string,
  quant: QuantResult,
  ai: AiResult | null
): CombinedResult {
  let finalSignal: Signal;

  if (!ai) {
    // Gemini call failed — fall back to quant-only, never block the pipeline
    finalSignal = quant.signal;
  } else if (ai.signal === quant.signal) {
    // Both layers agree — straightforward
    finalSignal = quant.signal;
  } else if (ai.confidence >= HIGH_CONFIDENCE_OVERRIDE) {
    // AI strongly disagrees with the quant rules — surface AI's view,
    // but this is exactly the case worth watching closely in reasons/logs
    finalSignal = ai.signal;
  } else {
    // Disagreement without high AI confidence — stay cautious
    finalSignal = "HOLD";
  }

  return { ticker, quant, ai, finalSignal };
}
