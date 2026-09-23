import type { QuantResult, Candle, AiResult, Signal } from "./types";

const DEFAULT_MODEL = "gemini-2.5-flash";

/**
 * Sends the quant indicators + recent price action to Gemini and asks it to
 * reason over them, producing a final signal + confidence + short rationale.
 *
 * This is deliberately NOT asking Gemini to invent its own indicators from
 * scratch — it's given the already-computed RSI/MACD/SMA numbers plus recent
 * closes, and asked to weigh them like an analyst would. Keeps the AI layer
 * grounded in real computed numbers rather than hallucinated math.
 */
export async function analyzeWithGemini(
  apiKey: string,
  quant: QuantResult,
  recentCandles: Candle[],
  model = DEFAULT_MODEL
): Promise<AiResult> {
  const recentCloses = recentCandles
    .slice(-10)
    .map((c) => c.close.toFixed(2))
    .join(", ");

  const prompt = `You are a disciplined equity analyst assistant. You are given
already-computed technical indicators for ${quant.ticker} plus the last 10
daily closing prices. Weigh them together and decide on a signal.

Current price: $${quant.price.toFixed(2)}
Last 10 closes: ${recentCloses}

Indicators:
- RSI(14): ${quant.indicators.rsi?.toFixed(2) ?? "N/A"}
- MACD histogram: ${quant.indicators.macdHistogram?.toFixed(3) ?? "N/A"}
- SMA(20): ${quant.indicators.smaFast?.toFixed(2) ?? "N/A"}
- SMA(50): ${quant.indicators.smaSlow?.toFixed(2) ?? "N/A"}
- Rule-based signal from these indicators alone: ${quant.signal}
- Rule-based reasons: ${quant.reasons.join("; ") || "none triggered"}

Respond with ONLY a JSON object, no other text, in this exact shape:
{"signal": "BUY" | "SELL" | "HOLD", "confidence": <number 0 to 1>, "reasoning": "<one or two sentences>"}

Be conservative — only deviate from the rule-based signal if you have a clear
reason to, and reflect any disagreement honestly in your confidence score.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API request failed: ${res.status} ${body}`);
  }

  const data = await res.json<{
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  }>();

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini response had no text content");
  }

  let parsed: { signal?: string; confidence?: number; reasoning?: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Gemini did not return valid JSON: ${text.slice(0, 200)}`);
  }

  const signal = normalizeSignal(parsed.signal);
  const confidence =
    typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;

  return {
    signal,
    confidence,
    reasoning: parsed.reasoning ?? "No reasoning provided",
  };
}

function normalizeSignal(value: unknown): Signal {
  if (value === "BUY" || value === "SELL" || value === "HOLD") return value;
  return "HOLD";
}
