import type { QuantResult, Candle, AiResult, NewsHeadline, Signal } from "./types";

const DEFAULT_MODEL = "gemini-3.5-flash-lite";

/**
 * Combines quant indicators + recent news headlines (fetched separately via
 * Finnhub, not Gemini search grounding — see finnhubNews.ts) into one
 * structured verdict. Single call, JSON response mode, no search tool — so
 * no grounding cost, just normal token pricing.
 */
export async function analyzeWithGemini(
    apiKey: string,
    quant: QuantResult,
    recentCandles: Candle[],
    news: NewsHeadline[],
    model = DEFAULT_MODEL
): Promise<AiResult> {
  const recentCloses = recentCandles
      .slice(-10)
      .map((c) => c.close.toFixed(2))
      .join(", ");

  const newsBlock =
      news.length > 0
          ? news
              .map((n, i) => `${i + 1}. [${n.source}] ${n.headline} — ${n.summary}`)
              .join("\n")
          : "No recent news available for this run.";

  const prompt = `You are a disciplined equity analyst assistant. You are given
already-computed technical indicators for ${quant.ticker} plus the last 10
daily closing prices, and a list of recent news headlines. Weigh all of it
together and decide on a signal.

Current price: $${quant.price.toFixed(2)}
Last 10 closes: ${recentCloses}

Technical indicators:
- RSI(14): ${quant.indicators.rsi?.toFixed(2) ?? "N/A"}
- MACD histogram: ${quant.indicators.macdHistogram?.toFixed(3) ?? "N/A"}
- SMA(20): ${quant.indicators.smaFast?.toFixed(2) ?? "N/A"}
- SMA(50): ${quant.indicators.smaSlow?.toFixed(2) ?? "N/A"}
- Rule-based signal from indicators alone: ${quant.signal}
- Rule-based reasons: ${quant.reasons.join("; ") || "none triggered"}

Recent news headlines (last 7 days):
${newsBlock}

Respond with ONLY a JSON object, no other text, in this exact shape:
{"signal": "BUY" | "SELL" | "HOLD", "confidence": <number 0 to 1>, "reasoning": "<one or two sentences, mention whether news supported or contradicted the technicals>"}

Be conservative — only deviate from the rule-based signal if you have a clear
reason to (either from technicals or news), and reflect any disagreement
honestly in your confidence score. If no news is available, base your
decision on technicals alone.`;

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
    newsConsidered: news.length,
  };
}

function normalizeSignal(value: unknown): Signal {
  if (value === "BUY" || value === "SELL" || value === "HOLD") return value;
  return "HOLD";
}