import type { Env } from "./types";

const WATCHLIST_KEY = "watchlist";

// Used only to seed KV the very first time the Worker runs and no
// watchlist exists yet. After that, KV is the single source of truth —
// editing this array does nothing once a watchlist key already exists.
const DEFAULT_WATCHLIST = ["AAPL", "MSFT", "NVDA"];

export async function getWatchlist(env: Env): Promise<string[]> {
  const raw = await env.STOCK_KV.get(WATCHLIST_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((t) => typeof t === "string")) {
        return parsed;
      }
    } catch {
      // fall through to reseed if the stored value is somehow corrupt
    }
  }

  // First run, or corrupt data: seed with the default list
  await env.STOCK_KV.put(WATCHLIST_KEY, JSON.stringify(DEFAULT_WATCHLIST));
  return DEFAULT_WATCHLIST;
}

export async function addTicker(env: Env, ticker: string): Promise<string[]> {
  const upper = ticker.toUpperCase().trim();
  const current = await getWatchlist(env);

  if (current.includes(upper)) {
    return current; // no-op, already present
  }

  const updated = [...current, upper];
  await env.STOCK_KV.put(WATCHLIST_KEY, JSON.stringify(updated));
  return updated;
}

export async function removeTicker(env: Env, ticker: string): Promise<string[]> {
  const upper = ticker.toUpperCase().trim();
  const current = await getWatchlist(env);
  const updated = current.filter((t) => t !== upper);

  if (updated.length === current.length) {
    return current; // no-op, wasn't present
  }

  await env.STOCK_KV.put(WATCHLIST_KEY, JSON.stringify(updated));
  return updated;
}
