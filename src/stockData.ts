import type { Candle } from "./types";

/**
 * Fetches daily candles from Twelve Data (free tier: 800 requests/day, 8/min).
 * Swap this out if you prefer Finnhub or another provider —
 * just keep the Candle[] shape consistent for the rest of the app.
 */
export async function fetchDailyCandles(
    ticker: string,
    apiKey: string,
    outputSize = 100
): Promise<Candle[]> {
    const url = `https://api.twelvedata.com/time_series?symbol=${ticker}&interval=1day&outputsize=${outputSize}&apikey=${apiKey}`;

    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Stock API request failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json<{
        values?: Array<{
            datetime: string;
            open: string;
            high: string;
            low: string;
            close: string;
            volume: string;
        }>;
        status?: string;
        message?: string;
    }>();

    if (data.status === "error" || !data.values) {
        throw new Error(`Stock API error: ${data.message ?? "unknown error"}`);
    }

    // Twelve Data returns newest-first; reverse to chronological order
    return data.values
        .map((v) => ({
            timestamp: new Date(v.datetime).getTime(),
            open: parseFloat(v.open),
            high: parseFloat(v.high),
            low: parseFloat(v.low),
            close: parseFloat(v.close),
            volume: parseFloat(v.volume),
        }))
        .reverse();
}
