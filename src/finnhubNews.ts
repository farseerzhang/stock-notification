import type { NewsHeadline } from "./types";

/**
 * Fetches recent company news headlines from Finnhub's free tier.
 * https://finnhub.io/docs/api/company-news
 *
 * Free tier: 60 calls/minute, no separate cost per call (unlike Gemini's
 * Google Search grounding, which is billed per search beyond its own quota).
 */
export async function fetchCompanyNews(
  ticker: string,
  apiKey: string,
  daysBack = 7
): Promise<NewsHeadline[]> {
  const to = new Date();
  const from = new Date(to.getTime() - daysBack * 24 * 60 * 60 * 1000);

  const fmt = (d: Date) => d.toISOString().split("T")[0]; // YYYY-MM-DD

  const url = `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${fmt(
    from
  )}&to=${fmt(to)}&token=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Finnhub news request failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json<
    Array<{
      headline: string;
      summary: string;
      source: string;
      url: string;
      datetime: number;
    }>
  >();

  if (!Array.isArray(data)) {
    throw new Error("Finnhub news response was not an array — check API key/ticker");
  }

  // Keep it tight: most recent 8 headlines, deduplicated by headline text
  const seen = new Set<string>();
  const headlines: NewsHeadline[] = [];
  for (const item of data.sort((a, b) => b.datetime - a.datetime)) {
    if (seen.has(item.headline)) continue;
    seen.add(item.headline);
    headlines.push({
      headline: item.headline,
      summary: item.summary,
      source: item.source,
      url: item.url,
      datetime: item.datetime,
    });
    if (headlines.length >= 8) break;
  }

  return headlines;
}
