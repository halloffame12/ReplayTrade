import type { Candle } from '../types/market';

/** Simple moving average of close prices. Returns array aligned with input (null where not enough data). */
export function sma(candles: Candle[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
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
    if (prev === null) {
      prev = candles[i].close;
    } else {
      prev = candles[i].close * k + prev * (1 - k);
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
    for (let j = i - period + 1; j <= i; j++) h = Math.max(h, candles[j].high);
    out[i] = h;
  }
  return out;
}

/** Rolling lowest low over period. */
export function rollingLow(candles: Candle[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = period - 1; i < candles.length; i++) {
    let l = Infinity;
    for (let j = i - period + 1; j <= i; j++) l = Math.min(l, candles[j].low);
    out[i] = l;
  }
  return out;
}
