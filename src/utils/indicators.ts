import type { Candle } from '../types/market';

/** Simple moving average of close prices. Returns array aligned with input (null where not enough data). */
export function sma(candles: Candle[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (!c) break;
    sum += c.close;
    if (i >= period) {
      const oldest = candles[i - period];
      if (oldest) sum -= oldest.close;
    }
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential moving average of close prices. */
export function ema(candles: Candle[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (!c) break;
    if (prev === null) {
      prev = c.close;
    } else {
      prev = c.close * k + prev * (1 - k);
    }
    if (i >= period - 1) out[i] = prev;
  }
  return out;
}

/** Rolling highest high over period. */
export function rollingHigh(candles: Candle[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = period - 1; i < candles.length; i++) {
    let h = -Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      const c = candles[j];
      if (c) h = Math.max(h, c.high);
    }
    out[i] = h;
  }
  return out;
}

/** Rolling lowest low over period. */
export function rollingLow(candles: Candle[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = period - 1; i < candles.length; i++) {
    let l = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      const c = candles[j];
      if (c) l = Math.min(l, c.low);
    }
    out[i] = l;
  }
  return out;
}
