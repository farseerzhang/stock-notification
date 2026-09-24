import type { Fundamentals } from "./types";

/**
 * Fetches key fundamental metrics from Finnhub's Basic Financials endpoint
 * (same free tier as company news — no extra API key needed).
 * https://finnhub.io/docs/api/company-basic-financials
 *
 * Finnhub's field names are inconsistent across companies/exchanges (some
 * report peBasicExclExtraTTM, others peExclExtraTTM, etc.), so this reads
 * defensively with fallbacks and returns null for anything genuinely absent
 * rather than guessing.
 */
export async function fetchFundamentals(
  ticker: string,
  apiKey: string
): Promise<Fundamentals> {
  const url = `https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Finnhub fundamentals request failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json<{ metric?: Record<string, number | undefined> }>();
  const m = data.metric ?? {};

  const pick = (...keys: string[]): number | null => {
    for (const key of keys) {
      const val = m[key];
      if (typeof val === "number" && !Number.isNaN(val)) return val;
    }
    return null;
  };

  return {
    peRatio: pick("peBasicExclExtraTTM", "peExclExtraTTM", "peNormalizedAnnual"),
    epsTTM: pick("epsBasicExclExtraItemsTTM", "epsExclExtraItemsTTM", "epsInclExtraItemsTTM"),
    revenuePerShareTTM: pick("revenuePerShareTTM"),
    revenueGrowthYoY: pick("revenueGrowthTTMYoy", "revenueGrowth3Y", "revenueGrowth5Y"),
    debtToEquity: pick("totalDebt/totalEquityQuarterly", "totalDebt/totalEquityAnnual"),
    marketCapitalization: pick("marketCapitalization"),
  };
}
