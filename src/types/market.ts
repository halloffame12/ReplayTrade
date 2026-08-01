export interface Candle {
  /** Unix timestamp in seconds */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

export interface MarketSymbol {
  symbol: string;
  /** Symbol as used by the Binance public market-data endpoint */
  binanceSymbol: string;
  name: string;
  /** OANDA v20 instrument name (e.g. XAU_USD). Present ⇒ this market is loaded from OANDA. */
  oandaInstrument?: string;
  /** Reference price used only for demo-data fallback generation */
  basePrice: number;
  decimals: number;
}

export type DataSource = 'binance' | 'oanda' | 'demo';
export type DataSourceOption = Exclude<DataSource, 'demo'>;

export const SYMBOLS: MarketSymbol[] = [
  {
    symbol: 'XAUUSD',
    binanceSymbol: 'PAXGUSDT',
    oandaInstrument: 'XAU_USD',
    name: 'Gold Spot / U.S. Dollar',
    basePrice: 4_000,
    decimals: 2,
  },
  { symbol: 'XAU/USD', binanceSymbol: 'PAXGUSDT', name: 'Gold (PAXG)', basePrice: 4_000, decimals: 2 },
  { symbol: 'BTC/USDT', binanceSymbol: 'BTCUSDT', name: 'Bitcoin', basePrice: 67_000, decimals: 1 },
  { symbol: 'ETH/USDT', binanceSymbol: 'ETHUSDT', name: 'Ethereum', basePrice: 3_300, decimals: 2 },
  { symbol: 'SOL/USDT', binanceSymbol: 'SOLUSDT', name: 'Solana', basePrice: 168, decimals: 3 },
];

/**
 * The symbol as the Binance public API expects it (no '/').
 * XAU/USD maps to PAXGUSDT — a 1:1 gold-backed token that tracks spot gold,
 * because Binance does not list a raw XAUUSD pair.
 */
export function binanceSymbolFor(symbol: string): string {
  return SYMBOLS.find((s) => s.symbol === symbol)?.binanceSymbol ?? symbol.replace('/', '');
}

/** Which providers a market symbol can be loaded from. */
export function availableSources(symbol: string): DataSourceOption[] {
  const sources: DataSourceOption[] = ['binance'];
  if (SYMBOLS.find((s) => s.symbol === symbol)?.oandaInstrument) sources.push('oanda');
  return sources;
}

const SOURCE_STORAGE_PREFIX = 'replaytrade:source:';

/** The per-symbol provider the user last chose (defaults to Binance). */
export function storedSourceFor(symbol: string): DataSourceOption {
  const sources = availableSources(symbol);
  try {
    const stored = localStorage.getItem(`${SOURCE_STORAGE_PREFIX}${symbol}`) as DataSourceOption | null;
    if (stored && sources.includes(stored)) return stored;
  } catch {
    /* ignore */
  }
  return 'binance';
}

export function persistSourceChoice(symbol: string, source: DataSourceOption): void {
  try {
    localStorage.setItem(`${SOURCE_STORAGE_PREFIX}${symbol}`, source);
  } catch {
    /* ignore */
  }
}

/** Which provider a market symbol is loaded from (respects the stored per-symbol choice). */
export function marketSourceFor(symbol: string): DataSourceOption {
  return storedSourceFor(symbol);
}

/** OANDA v20 instrument name for a symbol, if it is an OANDA market. */
export function oandaInstrumentFor(symbol: string): string {
  return SYMBOLS.find((s) => s.symbol === symbol)?.oandaInstrument ?? '';
}

export const TIME_FRAMES: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

export const TIME_FRAME_MS: Record<Timeframe, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

export const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

/** Days spanned by the loaded history (for the UI status display). */
export function timeframeLabel(tf: Timeframe): string {
  return tf;
}
