import { useCallback, useEffect, useRef, useState } from 'react';
import type { Candle, DataSource, DataSourceOption, Timeframe } from '../types/market';
import { SIX_MONTHS_MS, TIME_FRAME_MS, binanceSymbolFor, marketSourceFor, oandaInstrumentFor } from '../types/market';
import { fetchHistoricalCandles, fetchOandaCandles } from '../services/marketDataService';
import type { LoadProgress } from '../services/marketDataService';
import { generateDemoData } from '../utils/demoDataGenerator';

export interface DataRange {
  from: number;
  to: number;
}

interface UseMarketDataResult {
  candles: Candle[];
  source: DataSource | null;
  loading: boolean;
  progress: LoadProgress | null;
  error: string | null;
  range: DataRange | null;
  totalBatches: number;
  load: (symbol: string, timeframe: Timeframe, opts?: { demo?: boolean; source?: DataSourceOption }) => Promise<void>;
  useDemoData: (symbol: string, timeframe: Timeframe) => void;
  clearError: () => void;
}

/** Number of candles needed to cover ~6 months at the given timeframe. */
export function candlesNeededForSixMonths(timeframe: Timeframe): number {
  return Math.ceil(SIX_MONTHS_MS / TIME_FRAME_MS[timeframe]);
}

export function sixMonthRange(): DataRange {
  const endTime = Date.now();
  const startTime = endTime - SIX_MONTHS_MS;
  return { from: startTime, to: endTime };
}

export function useMarketData(): UseMarketDataResult {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [source, setSource] = useState<DataSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<DataRange | null>(null);
  const [totalBatches, setTotalBatches] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const load = useCallback(
    async (symbol: string, timeframe: Timeframe, opts?: { demo?: boolean; source?: DataSourceOption }) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);
      setProgress(null);
      setTotalBatches(0);
      setRange(null);

      const { from, to } = sixMonthRange();

      if (opts?.demo) {
        const needed = candlesNeededForSixMonths(timeframe);
        const { candles: demoCandles } = generateDemoData(symbol, timeframe, needed);
        if (!controller.signal.aborted) {
          setCandles(demoCandles);
          setSource('demo');
          setRange({
            from: demoCandles[0]?.time ?? from / 1000,
            to: demoCandles[demoCandles.length - 1]?.time ?? to / 1000,
          });
          setLoading(false);
        }
        return;
      }

      try {
        let lastBatches = 0;
        const onProgress = (p: LoadProgress) => {
          lastBatches = p.totalBatches;
          if (!controller.signal.aborted) {
            setProgress(p);
            setTotalBatches(p.totalBatches);
          }
        };
        const source = opts?.source ?? marketSourceFor(symbol);
        const result =
          source === 'oanda'
            ? await fetchOandaCandles({
                instrument: oandaInstrumentFor(symbol),
                timeframe,
                startTime: from,
                endTime: to,
                signal: controller.signal,
                onProgress,
              })
            : await fetchHistoricalCandles({
                symbol: binanceSymbolFor(symbol),
                interval: timeframe,
                startTime: from,
                endTime: to,
                signal: controller.signal,
                onProgress,
              });
        if (controller.signal.aborted) return;
        if (result.length === 0) {
          setError('The market data service returned no candles for this range.');
          setCandles([]);
          setSource(null);
          return;
        }
        setCandles(result);
        setSource(source);
        setRange({ from: result[0].time, to: result[result.length - 1].time });
        setProgress({ loadedBatches: lastBatches, totalBatches: lastBatches, pct: 100 });
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : 'Failed to load market data.';
        setError(message);
        setSource(null);
        setCandles([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [],
  );

  const useDemoData = useCallback((symbol: string, timeframe: Timeframe) => {
    void load(symbol, timeframe, { demo: true });
  }, [load]);

  const clearError = useCallback(() => setError(null), []);

  return {
    candles,
    source,
    loading,
    progress,
    error,
    range,
    totalBatches,
    load,
    useDemoData,
    clearError,
  };
}
