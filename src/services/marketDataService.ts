import type { Candle, Timeframe } from '../types/market';
import { TIME_FRAME_MS } from '../types/market';

/** Public Binance market-data endpoint. No API key required. */
const BINANCE_KLINES_URL = 'https://data-api.binance.vision/api/v3/klines';

const MAX_LIMIT = 1000;
const MAX_CONCURRENCY = 4;

/** OANDA v20 requires a personal access token, stored locally by the user. */
const OANDA_TOKEN_KEY = 'replaytrade:oanda_token';
const OANDA_ENV_KEY = 'replaytrade:oanda_env';
const OANDA_MAX = 5000;
const OANDA_CONCURRENCY = 2;

const OANDA_GRANULARITY: Record<Timeframe, string> = {
  '1m': 'M1',
  '5m': 'M5',
  '15m': 'M15',
  '30m': 'M30',
  '1h': 'H1',
  '4h': 'H4',
  '1d': 'D',
};

export interface FetchOptions {
  symbol: string;
  interval: string;
  startTime: number;
  endTime: number;
  signal?: AbortSignal;
  onProgress?: (progress: LoadProgress) => void;
}

export interface LoadProgress {
  /** number of fetched batches so far */
  loadedBatches: number;
  totalBatches: number;
  /** 0..100 */
  pct: number;
}

interface KlineRaw {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
}

interface BinanceKlineResponse extends Array<unknown> {
  [index: number]: unknown;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchKlines(
  symbol: string,
  interval: string,
  startTime: number,
  endTime: number,
  signal?: AbortSignal,
): Promise<KlineRaw[]> {
  const params = new URLSearchParams({
    symbol,
    interval,
    startTime: String(startTime),
    endTime: String(endTime),
    limit: String(MAX_LIMIT),
  });
  const res = await fetch(`${BINANCE_KLINES_URL}?${params.toString()}`, { signal });
  if (!res.ok) {
    if (res.status === 418 || res.status === 429) {
      throw new Error('Rate limit reached. Waiting and retrying…');
    }
    if (res.status === 451) {
      throw new Error('Market data is not available from your region.');
    }
    if (res.status === 400) {
      throw new Error(`Invalid market data request (${symbol}/${interval}).`);
    }
    throw new Error(`Market data request failed (HTTP ${res.status}).`);
  }
  const data: BinanceKlineResponse[] = await res.json();
  return data.map((row) => ({
    openTime: Number(row[0]),
    open: String(row[1]),
    high: String(row[2]),
    low: String(row[3]),
    close: String(row[4]),
    volume: String(row[5]),
    closeTime: Number(row[6]),
  }));
}

function rawToCandle(raw: KlineRaw): Candle {
  return {
    time: Math.round(raw.openTime / 1000),
    open: Number(raw.open),
    high: Number(raw.high),
    low: Number(raw.low),
    close: Number(raw.close),
    volume: Number(raw.volume),
  };
}

export function isValidCandle(c: Candle): boolean {
  if (!Number.isFinite(c.open) || !Number.isFinite(c.high) || !Number.isFinite(c.low)) return false;
  if (!Number.isFinite(c.close) || !Number.isFinite(c.volume)) return false;
  if (c.high < c.open || c.high < c.close || c.high < c.low) return false;
  if (c.low > c.open || c.low > c.close || c.low > c.high) return false;
  if (c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0) return false;
  return true;
}

interface Batch {
  startTime: number;
  endTime: number;
}

function buildBatches(startTime: number, endTime: number, intervalMs: number): Batch[] {
  const batches: Batch[] = [];
  const step = intervalMs * MAX_LIMIT;
  for (let t = startTime; t < endTime; t += step) {
    batches.push({ startTime: t, endTime: Math.min(endTime, t + step) });
  }
  return batches;
}

/**
 * Load ~6 months of historical candles from the public Binance endpoint.
 *
 * - Paginates in batches of up to 1000 candles, with limited concurrency.
 * - Deduplicates and sorts the result.
 * - Validates and drops malformed candles.
 * - Stops safely when the API stops returning data.
 * - Supports cancellation via AbortController.
 */
export async function fetchHistoricalCandles({
  symbol,
  interval,
  startTime,
  endTime,
  signal,
  onProgress,
}: FetchOptions): Promise<Candle[]> {
  const intervalMs = TIME_FRAME_MS[interval as keyof typeof TIME_FRAME_MS] ?? 900_000;
  const batches = buildBatches(startTime, endTime, intervalMs);
  if (batches.length === 0) return [];

  const collected: Candle[] = [];
  let fetched = 0;
  let retries = 0;

  for (let i = 0; i < batches.length; i += MAX_CONCURRENCY) {
    const slice = batches.slice(i, i + MAX_CONCURRENCY);
    const results = await Promise.all(
      slice.map(async (batch) => {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          try {
            const raws = await fetchKlines(symbol, interval, batch.startTime, batch.endTime, signal);
            retries = 0;
            return raws.map(rawToCandle);
          } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') throw err;
            if (err instanceof TypeError) {
              throw new Error(
                'Network error — could not reach the market data service. Check your connection.',
              );
            }
            retries += 1;
            if (retries > 3) throw err;
            await sleep(600 * retries);
          }
        }
      }),
    );

    for (const candles of results) {
      fetched += 1;
      collected.push(...candles);
      onProgress?.({
        loadedBatches: fetched,
        totalBatches: batches.length,
        pct: Math.min(100, Math.round((fetched / batches.length) * 100)),
      });
    }

    // If the exchange has no more history (every chunk in this slice empty),
    // stop asking for the remaining future chunks.
    if (i > 0 && results.every((c) => c.length === 0)) {
      onProgress?.({ loadedBatches: batches.length, totalBatches: batches.length, pct: 100 });
      break;
    }
  }

  // Deduplicate (Binance may return a boundary candle twice) and sort.
  const seen = new Set<number>();
  const deduped: Candle[] = [];
  const sorted = [...collected].sort((a, b) => a.time - b.time);
  for (const c of sorted) {
    if (seen.has(c.time)) continue;
    seen.add(c.time);
    if (isValidCandle(c)) deduped.push(c);
  }

  return deduped;
}

export interface FetchOandaOptions {
  instrument: string;
  timeframe: Timeframe;
  startTime: number;
  endTime: number;
  signal?: AbortSignal;
  onProgress?: (progress: LoadProgress) => void;
}

interface OandaCandleRaw {
  time: string;
  mid: { o: string; h: string; l: string; c: string };
  volume: number;
}

export function getOandaToken(): string {
  try {
    return localStorage.getItem(OANDA_TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function getOandaEnv(): 'practice' | 'live' {
  try {
    return localStorage.getItem(OANDA_ENV_KEY) === 'live' ? 'live' : 'practice';
  } catch {
    return 'practice';
  }
}

function oandaTimeToSeconds(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

async function fetchOandaBatch(
  instrument: string,
  granularity: string,
  from: number,
  to: number,
  token: string,
  env: 'practice' | 'live',
  signal?: AbortSignal,
): Promise<OandaCandleRaw[]> {
  const base = env === 'live' ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com';
  const params = new URLSearchParams({
    granularity,
    price: 'M',
    includeIncomplete: 'false',
    count: String(OANDA_MAX),
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
  });
  const res = await fetch(`${base}/v3/instruments/${instrument}/candles?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (res.status === 401) {
    throw new Error('Invalid OANDA API key. Set it under Session → OANDA API key.');
  }
  if (res.status === 403 || res.status === 429) {
    throw new Error('OANDA rate limit reached. Try again in a moment.');
  }
  if (!res.ok) {
    throw new Error(`OANDA market data request failed (HTTP ${res.status}).`);
  }
  const data = (await res.json()) as { candles?: OandaCandleRaw[] };
  return data.candles ?? [];
}

function oandaRawToCandle(raw: OandaCandleRaw): Candle {
  return {
    time: oandaTimeToSeconds(raw.time),
    open: Number(raw.mid.o),
    high: Number(raw.mid.h),
    low: Number(raw.mid.l),
    close: Number(raw.mid.c),
    volume: Number(raw.volume),
  };
}

/**
 * Load ~6 months of historical candles from the OANDA v20 REST API (XAU_USD and
 * other FX spot instruments). Requires a personal access token stored in
 * localStorage (`replaytrade:oanda_token`); see Session → OANDA API key.
 *
 * - Paginates in aligned batches of up to 5000 candles with low concurrency.
 * - Deduplicates, sorts, and validates candles like the Binance path.
 */
export async function fetchOandaCandles({
  instrument,
  timeframe,
  startTime,
  endTime,
  signal,
  onProgress,
}: FetchOandaOptions): Promise<Candle[]> {
  const token = getOandaToken();
  if (!token) {
    throw new Error('OANDA API key not set. Add it under Session → OANDA API key to load XAU/USD.');
  }
  const env = getOandaEnv();
  const granularity = OANDA_GRANULARITY[timeframe] ?? 'M15';
  const intervalMs = TIME_FRAME_MS[timeframe] ?? 900_000;
  const step = intervalMs * OANDA_MAX;

  const batches: Batch[] = [];
  for (let t = startTime; t < endTime; t += step) {
    batches.push({ startTime: t, endTime: Math.min(endTime, t + step - 1) });
  }
  if (batches.length === 0) return [];

  const collected: Candle[] = [];
  let fetched = 0;
  let retries = 0;

  for (let i = 0; i < batches.length; i += OANDA_CONCURRENCY) {
    const slice = batches.slice(i, i + OANDA_CONCURRENCY);
    const results = await Promise.all(
      slice.map(async (batch) => {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          try {
            const raws = await fetchOandaBatch(
              instrument,
              granularity,
              batch.startTime,
              batch.endTime,
              token,
              env,
              signal,
            );
            retries = 0;
            return raws.map(oandaRawToCandle);
          } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') throw err;
            if (err instanceof TypeError) {
              throw new Error(
                'Network error — could not reach OANDA. Check your connection.',
              );
            }
            retries += 1;
            if (retries > 3) throw err;
            await sleep(600 * retries);
          }
        }
      }),
    );

    for (const candles of results) {
      fetched += 1;
      collected.push(...candles);
      onProgress?.({
        loadedBatches: fetched,
        totalBatches: batches.length,
        pct: Math.min(100, Math.round((fetched / batches.length) * 100)),
      });
    }
  }

  const seen = new Set<number>();
  const deduped: Candle[] = [];
  const sorted = [...collected].sort((a, b) => a.time - b.time);
  for (const c of sorted) {
    if (seen.has(c.time)) continue;
    seen.add(c.time);
    if (isValidCandle(c)) deduped.push(c);
  }

  return deduped;
}
