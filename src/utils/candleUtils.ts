import type { Candle } from '../types/market';

/** Remove duplicate timestamps, sort ascending, drop invalid candles. */
export function normalizeCandles(candles: Candle[]): Candle[] {
  const seen = new Set<number>();
  const out: Candle[] = [];
  for (const c of [...candles].sort((a, b) => a.time - b.time)) {
    if (seen.has(c.time)) continue;
    seen.add(c.time);
    if (Number.isFinite(c.time) && c.open > 0 && c.high >= c.low) out.push(c);
  }
  return out;
}

/** Binary search for the index of the candle closest to the given timestamp. */
export function nearestIndexByTime(candles: Candle[], time: number): number {
  if (candles.length === 0) return -1;
  let lo = 0;
  let hi = candles.length - 1;
  if (time <= candles[0].time) return 0;
  if (time >= candles[hi].time) return hi;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].time < time) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  const left = lo > 0 ? candles[lo - 1].time : candles[lo].time;
  const right = candles[lo].time;
  return Math.abs(time - left) <= Math.abs(right - time) ? Math.max(0, lo - 1) : lo;
}

export function formatCandleDate(time: number, timeframe: string): string {
  const d = new Date(time * 1000);
  if (timeframe === '1d') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatShortDate(time: number): string {
  return new Date(time * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
