import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  LineWidth,
  createChart,
  createSeriesMarkers,
} from 'lightweight-charts';
import type {
  CandlestickData,
  HistogramData,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  LineData,
  MouseEventHandler,
  SeriesMarker,
  Time,
} from 'lightweight-charts';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Candle, Timeframe } from '../types/market';
import { TIME_FRAME_MS } from '../types/market';
import type { Position } from '../types/trading';
import type { DrawingTool } from '../types/drawings';
import { DrawingManager } from '../utils/drawingManager';
import { ema, sma } from '../utils/indicators';
import { nearestIndexByTime, formatCandleDate } from '../utils/candleUtils';
import { formatPrice, formatVolume } from '../utils/tradingCalculations';
import { DrawingToolbar } from './DrawingToolbar';

interface TradingChartProps {
  candles: Candle[];
  timeframe: Timeframe;
  symbol: string;
  decimals: number;
  currentPrice: number;
  positions: Position[];
  replayActive: boolean;
  visibleStartIndex: number;
  currentReplayIndex: number;
  isSelecting: boolean;
  selectedIndex: number | null;
  replayStartIndex: number | null;
  onSelectCandle: (index: number) => void;
  isPlaying: boolean;
  autoFollow: boolean;
  followSignal: number;
  showIndicators?: boolean;
}

const COLORS = {
  up: '#22c55e',
  down: '#ef4444',
  text: '#9aa6bd',
  grid: 'rgba(148, 163, 184, 0.08)',
  volumeUp: 'rgba(34, 197, 94, 0.35)',
  volumeDown: 'rgba(239, 68, 68, 0.35)',
  ema: '#eab308',
  sma: '#4f8cff',
  accent: '#4f8cff',
};

function toChartTime(time: number): Time {
  return time as Time;
}

export function TradingChart({
  candles,
  timeframe,
  symbol,
  decimals,
  currentPrice,
  positions,
  replayActive,
  visibleStartIndex,
  currentReplayIndex,
  isSelecting,
  selectedIndex,
  replayStartIndex,
  onSelectCandle,
  isPlaying,
  autoFollow,
  followSignal,
  showIndicators = true,
}: TradingChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const smaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const currentPriceLineRef = useRef<IPriceLine | null>(null);
  const priceLineRefs = useRef<Map<string, IPriceLine[]>>(new Map());
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const lastCountRef = useRef<number>(0);

  const [hover, setHover] = useState<Candle | null>(null);
  const [tool, setTool] = useState<DrawingTool>('select');
  const [, setDrawTick] = useState(0);
  const drawingManagerRef = useRef<DrawingManager | null>(null);
  const drawingActiveRef = useRef(false);
  drawingActiveRef.current = tool !== 'select';

  // Refs for latest props, so the click subscription never needs re-creating.
  const selectingRef = useRef(isSelecting);
  selectingRef.current = isSelecting;
  const onSelectCandleRef = useRef(onSelectCandle);
  onSelectCandleRef.current = onSelectCandle;
  const candlesRef = useRef(candles);
  candlesRef.current = candles;
  const autoFollowRef = useRef(autoFollow);
  autoFollowRef.current = autoFollow;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const visible = useMemo(() => {
    if (!replayActive) return candles;
    const end = Math.min(candles.length - 1, currentReplayIndex);
    const start = Math.max(0, visibleStartIndex);
    return start <= end ? candles.slice(start, end + 1) : [];
  }, [candles, replayActive, visibleStartIndex, currentReplayIndex]);

  // Create the chart exactly once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#0b0f19' },
        textColor: COLORS.text,
        fontSize: 11,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: COLORS.grid },
        horzLines: { color: COLORS.grid },
      },
      rightPriceScale: {
        borderColor: '#232c3f',
        scaleMargins: { top: 0.08, bottom: 0.25 },
      },
      timeScale: {
        borderColor: '#232c3f',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 6,
        minBarSpacing: 0.5,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(148,163,184,0.35)',
          width: 1 as LineWidth,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1a2233',
        },
        horzLine: {
          color: 'rgba(148,163,184,0.35)',
          width: 1 as LineWidth,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1a2233',
        },
      },
      localization: {
        priceFormatter: (p: number) => formatPrice(p, decimals),
      },
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.up,
      downColor: COLORS.down,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
      borderVisible: false,
      priceLineVisible: false,
      priceFormat: { type: 'price', precision: decimals, minMove: 1 / 10 ** decimals },
    });
    candleSeriesRef.current = candleSeries;
    markersRef.current = createSeriesMarkers(candleSeries, []);

    const drawingManager = new DrawingManager('');
    drawingManagerRef.current = drawingManager;
    candleSeries.attachPrimitive(drawingManager);
    drawingManager.setOnChange(() => setDrawTick((v) => v + 1));
    drawingManager.setOnCursor((cursor) => {
      if (container.style.cursor !== cursor) container.style.cursor = cursor;
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
      visible: false,
    });
    volumeSeriesRef.current = volumeSeries;

    const smaSeries = chart.addSeries(LineSeries, {
      color: COLORS.sma,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    const emaSeries = chart.addSeries(LineSeries, {
      color: COLORS.ema,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    smaSeriesRef.current = smaSeries;
    emaSeriesRef.current = emaSeries;

    const priceLine = candleSeries.createPriceLine({
      price: 0,
      color: 'rgba(255,255,255,0.6)',
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: true,
      title: '',
    });
    currentPriceLineRef.current = priceLine;

    const onResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    const crosshairHandler: MouseEventHandler<Time> = (param) => {
      if (param.time === undefined) {
        setHover(null);
        return;
      }
      const idx = param.logical;
      if (idx === undefined || idx < 0) return;
      const seriesData = param.seriesData.get(candleSeries);
      if (seriesData) {
        const d = seriesData as CandlestickData;
        const candle: Candle = {
          time: d.time as number,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          volume: 0,
        };
        const volData = volumeSeries.dataByIndex(idx);
        if (volData) candle.volume = (volData as HistogramData).value ?? 0;
        setHover(candle);
      }
    };
    chart.subscribeCrosshairMove(crosshairHandler);

    const clickHandler: MouseEventHandler<Time> = (param) => {
      if (!selectingRef.current) return;
      if (drawingActiveRef.current) return;
      if (param.time === undefined) return;
      const idx = nearestIndexByTime(candlesRef.current, param.time as number);
      if (idx >= 0) onSelectCandleRef.current(idx);
    };
    chart.subscribeClick(clickHandler);

    return () => {
      ro.disconnect();
      chart.unsubscribeCrosshairMove(crosshairHandler);
      chart.unsubscribeClick(clickHandler);
      drawingManagerRef.current = null;
      container.style.cursor = '';
      if (candleSeriesRef.current) {
        priceLineRefs.current.forEach((lines) =>
          lines.forEach((l) => candleSeriesRef.current?.removePriceLine(l)),
        );
      }
      priceLineRefs.current.clear();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      smaSeriesRef.current = null;
      emaSeriesRef.current = null;
      currentPriceLineRef.current = null;
      markersRef.current = null;
      lastCountRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Data sync: only the visible (revealed) slice ever reaches the series.
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current || !volumeSeriesRef.current) return;

    const prevCount = lastCountRef.current;
    lastCountRef.current = visible.length;
    const c = candleSeriesRef.current;
    const v = volumeSeriesRef.current;
    const isAppend = prevCount > 0 && visible.length === prevCount + 1;

    if (isAppend && visible.length > 0) {
      const last = visible[visible.length - 1];
      c.update({
        time: toChartTime(last.time),
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close,
      } as CandlestickData);
      v.update({
        time: toChartTime(last.time),
        value: last.volume,
        color: last.close >= last.open ? COLORS.volumeUp : COLORS.volumeDown,
      } as HistogramData);
    } else if (visible.length > 0) {
      c.setData(
        visible.map((k) => ({
          time: toChartTime(k.time),
          open: k.open,
          high: k.high,
          low: k.low,
          close: k.close,
        })) as CandlestickData[],
      );
      v.setData(
        visible.map((k) => ({
          time: toChartTime(k.time),
          value: k.volume,
          color: k.close >= k.open ? COLORS.volumeUp : COLORS.volumeDown,
        })) as HistogramData[],
      );
      if (prevCount === 0 || visible.length < prevCount) {
        chartRef.current.timeScale().setVisibleLogicalRange({
          from: Math.max(0, visible.length - 160),
          to: visible.length + 4,
        });
      }
    } else {
      c.setData([]);
      v.setData([]);
    }

    // Indicators
    const smaSeries = smaSeriesRef.current;
    const emaSeries = emaSeriesRef.current;
    if (smaSeries && emaSeries) {
      if (showIndicators && visible.length > 20) {
        const s = sma(visible, 20);
        const e = ema(visible, 50);
        if (isAppend) {
          const sl = s[s.length - 1];
          const el = e[e.length - 1];
          if (sl !== null) smaSeries.update({ time: toChartTime(visible[visible.length - 1].time), value: sl });
          if (el !== null) emaSeries.update({ time: toChartTime(visible[visible.length - 1].time), value: el });
        } else {
          smaSeries.setData(
            s
              .map((val, i) => (val === null ? null : { time: toChartTime(visible[i].time), value: val }))
              .filter(Boolean) as LineData[],
          );
          emaSeries.setData(
            e
              .map((val, i) => (val === null ? null : { time: toChartTime(visible[i].time), value: val }))
              .filter(Boolean) as LineData[],
          );
        }
      } else if (!isAppend) {
        smaSeries.setData([]);
        emaSeries.setData([]);
      }
    }
  }, [visible, showIndicators]);

  // Drawing context: per-symbol storage + reveal-window for coordinate math.
  useEffect(() => {
    drawingManagerRef.current?.setContext(symbol, timeframe);
  }, [symbol, timeframe]);

  useEffect(() => {
    const dm = drawingManagerRef.current;
    if (!dm) return;
    dm.setTimeframe(TIME_FRAME_MS[timeframe] / 1000);
    dm.setDataTimes(candles.map((c) => c.time));
    dm.setCandles(candles);
    dm.setDecimals(decimals);
  }, [candles, timeframe, decimals]);

  // Ctrl/Cmd+Z undoes the last drawing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      e.preventDefault();
      drawingManagerRef.current?.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Drawing interactions (click-drag to draw, drag to move, etc).
  useEffect(() => {
    const container = containerRef.current;
    const dm = drawingManagerRef.current;
    if (!container || !dm) return;

    const getPos = (e: PointerEvent): [number, number] => {
      const rect = container.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top];
    };
    const onDown = (e: PointerEvent): void => {
      if (e.button !== 0) return;
      if (!container.hasPointerCapture(e.pointerId)) {
        container.setPointerCapture(e.pointerId);
      }
      const [x, y] = getPos(e);
      dm.onPointerDown(x, y);
    };
    const onMove = (e: PointerEvent): void => {
      const [x, y] = getPos(e);
      dm.onPointerMove(x, y);
    };
    const onUp = (): void => dm.onPointerUp();
    const onCancel = (): void => dm.onPointerCancel();

    container.addEventListener('pointerdown', onDown);
    container.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      container.removeEventListener('pointerdown', onDown);
      container.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToolChange = (next: DrawingTool): void => {
    setTool(next);
    drawingManagerRef.current?.setTool(next);
  };

  // While a drawing tool is active, take over touch gestures so drags draw
  // instead of scrolling/panning the page.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.style.touchAction = tool !== 'select' ? 'none' : 'auto';
  }, [tool]);

  // Auto-follow: keep the newest revealed candle at the right edge.
  useEffect(() => {
    const ts = chartRef.current?.timeScale();
    if (!ts) return;
    ts.scrollToPosition(0, false);
  }, [followSignal]);

  useEffect(() => {
    if (!autoFollowRef.current || !isPlayingRef.current) return;
    const ts = chartRef.current?.timeScale();
    if (!ts) return;
    ts.scrollToPosition(0, false);
  }, [visible.length]);

  // Replay start / selection markers.
  useEffect(() => {
    const plugin = markersRef.current;
    if (!plugin) return;
    const markers: SeriesMarker<Time>[] = [];
    if (isSelecting && selectedIndex !== null && selectedIndex < candles.length) {
      markers.push({
        time: toChartTime(candles[selectedIndex].time),
        position: 'belowBar',
        color: COLORS.accent,
        shape: 'circle',
        text: 'Replay starts here',
        size: 1,
      });
    } else if (replayActive && replayStartIndex !== null && replayStartIndex < candles.length) {
      markers.push({
        time: toChartTime(candles[replayStartIndex].time),
        position: 'belowBar',
        color: COLORS.accent,
        shape: 'circle',
        text: 'Replay Starts Here',
        size: 1,
      });
    }
    plugin.setMarkers(markers);
  }, [isSelecting, selectedIndex, replayActive, replayStartIndex, candles]);

  // Current price line + open-position SL/TP/entry price lines.
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    const cs = candleSeriesRef.current;
    currentPriceLineRef.current?.applyOptions({
      price: currentPrice,
      title: formatPrice(currentPrice, decimals),
    });

    const currentIds = new Set(positions.map((p) => p.id));
    priceLineRefs.current.forEach((lines, id) => {
      if (!currentIds.has(id)) {
        lines.forEach((l) => cs.removePriceLine(l));
        priceLineRefs.current.delete(id);
      }
    });
    for (const p of positions) {
      const lines = priceLineRefs.current.get(p.id);
      const expected = [p.entryPrice, p.stopLoss, p.takeProfit].filter(
        (v): v is number => typeof v === 'number' && v > 0,
      ).length;
      if (!lines || lines.length !== expected) {
        priceLineRefs.current.get(p.id)?.forEach((l) => cs.removePriceLine(l));
        const newLines: IPriceLine[] = [];
        newLines.push(
          cs.createPriceLine({
            price: p.entryPrice,
            color: p.direction === 'long' ? '#93c5fd' : '#f9a8d4',
            lineWidth: 1,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: 'Entry',
          }),
        );
        if (p.stopLoss) {
          newLines.push(
            cs.createPriceLine({
              price: p.stopLoss,
              color: COLORS.down,
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: 'SL',
            }),
          );
        }
        if (p.takeProfit) {
          newLines.push(
            cs.createPriceLine({
              price: p.takeProfit,
              color: COLORS.up,
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: 'TP',
            }),
          );
        }
        priceLineRefs.current.set(p.id, newLines);
      }
    }
  }, [currentPrice, positions, decimals]);

  const hovered = hover ?? visible[visible.length - 1];
  const prevClose = visible.length > 1 ? visible[visible.length - 2].close : hovered?.open ?? 0;
  const change = hovered && prevClose ? ((hovered.close - prevClose) / prevClose) * 100 : 0;

  return (
    <div className="relative h-full w-full min-h-0">
      <div ref={containerRef} className="h-full w-full" aria-label="Price chart" />
      <div className="absolute bottom-2 left-1/2 z-20 -translate-x-1/2 max-w-[calc(100%-16px)]">
        <DrawingToolbar
          tool={tool}
          onToolChange={handleToolChange}
          onDeleteSelected={() => drawingManagerRef.current?.deleteSelected()}
          onClearAll={() => drawingManagerRef.current?.clearAll()}
          hasSelection={drawingManagerRef.current?.getSelectedId() != null}
          hasDrawings={drawingManagerRef.current?.hasDrawings() ?? false}
        />
      </div>
      {/* Legend overlay */}
      <div className="pointer-events-none absolute left-2 top-2 z-10 font-mono text-[11px] leading-relaxed text-text-secondary">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-text-primary">{symbol}</span>
          <span className="rounded-sm bg-bg-elevated px-1.5 py-px text-[10px] text-text-secondary">
            {timeframe}
          </span>
        </div>
        {hovered && (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            <span>
              <span className="text-text-muted">O</span>{' '}
              <span className="text-text-primary">{formatPrice(hovered.open, decimals)}</span>
            </span>
            <span>
              <span className="text-text-muted">H</span>{' '}
              <span className="text-text-primary">{formatPrice(hovered.high, decimals)}</span>
            </span>
            <span>
              <span className="text-text-muted">L</span>{' '}
              <span className="text-text-primary">{formatPrice(hovered.low, decimals)}</span>
            </span>
            <span>
              <span className="text-text-muted">C</span>{' '}
              <span
                className={
                  hovered.close >= prevClose ? 'text-up' : 'text-down'
                }
              >
                {formatPrice(hovered.close, decimals)}
              </span>
            </span>
            <span>
              <span className="text-text-muted">VOL</span>{' '}
              <span className="text-text-primary">{formatVolume(hovered.volume)}</span>
            </span>
            <span className="text-text-muted">{formatCandleDate(hovered.time, timeframe)}</span>
            {change !== 0 && prevClose > 0 && (
              <span className={change >= 0 ? 'text-up' : 'text-down'}>
                {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
