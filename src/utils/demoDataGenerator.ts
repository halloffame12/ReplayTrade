import type { Candle, Timeframe } from '../types/market';
import { SYMBOLS, TIME_FRAME_MS } from '../types/market';

/**
 * Deterministic PRNG (mulberry32). Same seed -> same sequence.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

type Regime = 'up' | 'down' | 'range';

function getSymbolInfo(symbol: string) {
  const found = SYMBOLS.find((s) => s.symbol === symbol);
  return (
    found ?? {
      symbol,
      name: symbol,
      binanceSymbol: symbol.replace('/', ''),
      basePrice: 100,
      decimals: 2,
    }
  );
}

function volatilityForTimeframe(timeframe: Timeframe): number {
  const ms = TIME_FRAME_MS[timeframe];
  return 0.0018 * Math.sqrt(ms / 900_000);
}

export interface GeneratedDemoData {
  candles: Candle[];
  seed: number;
}

/**
 * Generate clearly-labelled fake market data for offline practice.
 * Used only when the live market data service is unavailable.
 */
export function generateDemoData(
  symbol: string,
  timeframe: Timeframe,
  candleCount: number,
  seed?: number,
): GeneratedDemoData {
  const info = getSymbolInfo(symbol);
  const effectiveSeed = seed !== undefined && seed !== 0 ? seed : hashString(`${symbol}:${timeframe}`);
  const rand = mulberry32(hashString(`${symbol}:${timeframe}:${effectiveSeed}`));

  const baseVol = volatilityForTimeframe(timeframe);
  const driftScale = 0.00035;
  const interval = TIME_FRAME_MS[timeframe] / 1000;
  const startTime = Math.floor(Date.now() / 1000) - (candleCount - 1) * interval;

  let regime: Regime = 'range';
  let regimeBias = 0;
  let momentum = 0;
  let volMultiplier = 1;
  let regimeCounter = 0;
  let breakoutPending = 0;

  const candles: Candle[] = [];
  let price = info.basePrice * (0.97 + rand() * 0.06);
  const dec = 10 ** Math.min(4, Math.max(1, info.decimals + 1));
  const round = (v: number) => Math.round(v * dec) / dec;

  const pickNewRegime = (): Regime => {
    const r = rand();
    if (r < 0.34) return 'up';
    if (r < 0.68) return 'down';
    return 'range';
  };

  for (let i = 0; i < candleCount; i++) {
    regimeCounter--;
    if (regimeCounter <= 0) {
      const stay = regime === 'range' ? 0.62 : 0.58;
      if (rand() > stay || regimeCounter < -30) {
        regime = pickNewRegime();
        if (regime === 'up') {
          regimeBias = driftScale * (1.2 + rand() * 1.8);
          regimeCounter = 24 + Math.floor(rand() * 60);
        } else if (regime === 'down') {
          regimeBias = -driftScale * (1.2 + rand() * 1.8);
          regimeCounter = 24 + Math.floor(rand() * 60);
        } else {
          regimeBias = 0;
          regimeCounter = 18 + Math.floor(rand() * 50);
        }
        volMultiplier = 0.8 + rand() * 0.6;
      } else {
        regimeCounter = 20 + Math.floor(rand() * 40);
      }
    }

    if (rand() < 0.05) {
      volMultiplier = Math.max(0.4, Math.min(2.4, volMultiplier + (rand() - 0.5) * 0.7));
    }

    let pullbackBias = 0;
    if (regime !== 'range' && rand() < 0.12) {
      pullbackBias = -regimeBias * (0.5 + rand() * 0.8);
    }

    let breakoutPush = 0;
    if (breakoutPending > 0) {
      breakoutPending--;
      if (breakoutPending > 0) {
        breakoutPush = (regime === 'up' ? 1 : -1) * volMultiplier * baseVol * 4;
      }
    } else if (rand() < 0.014) {
      breakoutPending = 2 + Math.floor(rand() * 4);
      breakoutPush = (rand() < 0.6 ? 1 : -1) * volMultiplier * baseVol * 3;
    }

    const vol = baseVol * volMultiplier;
    const drift = regimeBias * (1 + momentum * 0.6) + pullbackBias + breakoutPush;
    momentum = momentum * 0.9 + (rand() - 0.5) * 0.15;

    const open = price;
    const bodyNoise = (rand() * 2 - 1) * vol;
    let close = open * (1 + drift + bodyNoise);
    close = Math.max(close, open * 0.88);

    const wickUp = rand() ** 2 * vol * 2.2 * open;
    const wickDown = rand() ** 2 * vol * 2.2 * open;
    const high = Math.max(open, close) + wickUp;
    const low = Math.min(open, close) - wickDown;

    const rangePct = (high - low) / open;
    const upPress = close >= open;
    const volumeTrend = regime === 'range' ? 0.75 : 1.15;
    const volumeBreakout = breakoutPending > 0 ? 2.4 : 1;
    const volume =
      800 *
      (0.55 + rand() * 1.1) *
      (1 + rangePct / vol) *
      volumeTrend *
      volumeBreakout *
      (upPress ? 1 : 0.92);

    candles.push({
      time: Math.round(startTime + i * interval),
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume: Math.round(volume),
    });
    price = candles[candles.length - 1].close;
  }

  return { candles, seed: effectiveSeed };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
