import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  LineWidth,
  TickMarkType,
  createChart,
  createSeriesMarkers,
} from 'lightweight-charts';
import type {
  CandlestickData,
  HistogramData,
  IChartApi,
  IPriceLine,
  IPriceScaleApi,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  LineData,
  LogicalRange,
  MouseEventHandler,
  SeriesMarker,
  Time,
} from 'lightweight-charts';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Candle, Timeframe } from '../types/market';
import { TIME_FRAME_MS } from '../types/market';
import type { ClosedTrade, Position } from '../types/trading';
import type { MagnetMode, ToolId as DrawingTool } from '../drawing';
import { DRAWING_COLORS, DrawingEngine, makeStorageKey } from '../drawing';
import { ema, sma } from '../utils/indicators';
import { nearestIndexByTime, formatCandleDate } from '../utils/candleUtils';
import { formatPrice, formatVolume } from '../utils/tradingCalculations';
import { DrawingToolbar } from './chart/DrawingToolbar';
import { Tooltip } from './ui';
import { ArrowRightToLine, ScanSearch } from 'lucide-react';

interface TradingChartProps {
  candles: Candle[];
  timeframe: Timeframe;
  symbol: string;
  decimals: number;
  currentPrice: number;
  positions: Position[];
  closedTrades?: ClosedTrade[];
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
  showVolume?: boolean;
  onChartReady?: (chart: IChartApi | null) => void;
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

/**
 * Manually fit a price scale so that `slice` fills its visible range (with a
 * small pad for wicks). Used instead of the library autoscale, because
 * `autoScale: true` disables TradingView-style vertical drag-panning.
 */
function fitPriceScaleToCandles(ps: IPriceScaleApi, slice: Candle[]): void {
  if (slice.length === 0) return;
  let min = Infinity;
  let max = -Infinity;
  for (const c of slice) {
    if (c.low < min) min = c.low;
    if (c.high > max) max = c.high;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return;
  let span = max - min;
  if (span <= 0) span = 1;
  const pad = span * 0.02;
  ps.setVisibleRange({ from: min - pad, to: max + pad });
}

/** TradingView-style tick-mark labels (e.g. `14:35`, `Aug`, `'26`). */
function tickMarkFormatter(time: Time, tickMarkType: TickMarkType): string {
  const ts =
    typeof time === 'number'
      ? time
      : (time as { timestamp?: number; year?: number; month?: number; day?: number }).timestamp ??
        ((time as { year?: number; month?: number; day?: number }).year ?? 0);
  const d = new Date(ts * 1000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  switch (tickMarkType) {
    case TickMarkType.Year:
      return `'${String(d.getFullYear()).slice(2)}`;
    case TickMarkType.Month:
      return d.toLocaleDateString('en-US', { month: 'short' });
    case TickMarkType.DayOfMonth:
      return String(d.getDate());
    case TickMarkType.Time:
      return `${hh}:${mm}`;
    case TickMarkType.TimeWithSeconds:
      return `${hh}:${mm}:${ss}`;
    default:
      return '';
  }
}

export function TradingChart({
  candles,
  timeframe,
  symbol,
  decimals,
  currentPrice,
  positions,
  closedTrades,
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
  showVolume = true,
  onChartReady,
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
  const lastDataKeyRef = useRef<string>('');
  const lastWindowStartRef = useRef<number | null>(null);
  const visibleLenRef = useRef(0);
  const atRightEdgeRef = useRef(true);
  // TradingView-style price-scale ownership: once the user drags/zooms the
  // price scale, the replay auto-refit backs off until the dataset changes or
  // the view window is recentered (so vertical panning is never yanked back).
  const priceScaleManualRef = useRef(false);
  const [priceScaleManual, setPriceScaleManual] = useState(false);
  const panStartRef = useRef<[number, number] | null>(null);

  const [hover, setHover] = useState<Candle | null>(null);
  const [tool, setTool] = useState<DrawingTool>('select');
  const [magnetMode, setMagnetMode] = useState<MagnetMode>('weak');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [drawingsCount, setDrawingsCount] = useState(0);
  const [, setDrawTick] = useState(0);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [awayFromEdge, setAwayFromEdge] = useState(false);
  const drawingEngineRef = useRef<DrawingEngine | null>(null);
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

  visibleLenRef.current = visible.length;

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
        borderVisible: true,
        // autoScale must stay OFF: with it on, lightweight-charts snaps the
        // price scale back on mouse drag, so vertical panning never works.
        // We refit the range manually at the right moments instead.
        autoScale: false,
        scaleMargins: { top: 0.08, bottom: 0.25 },
      },
      timeScale: {
        borderColor: '#232c3f',
        borderVisible: true,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 6,
        minBarSpacing: 1,
        tickMarkFormatter,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        // TradingView parity: dragging on the price axis zooms vertically.
        axisPressedMouseMove: true,
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
    onChartReady?.(chart);

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

    const drawingEngine = new DrawingEngine(makeStorageKey(symbol, timeframe));
    drawingEngineRef.current = drawingEngine;
    candleSeries.attachPrimitive(drawingEngine);
    drawingEngine.setOptions({
      onChange: () => {
        setDrawTick((v) => v + 1);
        setDrawingsCount(drawingEngine.getDrawings().length);
      },
      onCursor: (cursor) => {
        if (container.style.cursor !== cursor) container.style.cursor = cursor;
      },
      onSelectionChange: (id) => {
        setSelectedDrawingId(id);
      },
      onHistoryChange: (undoable, redoable) => {
        setCanUndo(undoable);
        setCanRedo(redoable);
      },
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
      drawingEngineRef.current = null;
      container.style.cursor = '';
      if (candleSeriesRef.current) {
        priceLineRefs.current.forEach((lines) =>
          lines.forEach((l) => candleSeriesRef.current?.removePriceLine(l)),
        );
      }
      priceLineRefs.current.clear();
      chart.remove();
      chartRef.current = null;
      onChartReady?.(null);
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

  // Track whether the user has scrolled away from the right edge, so auto-follow
  // pauses while they study history (TradingView behaviour) and resumes at the edge.
  useEffect(() => {
    const ts = chartRef.current?.timeScale();
    if (!ts) return;
    const onRange = (range: LogicalRange | null) => {
      if (!range) return;
      atRightEdgeRef.current = range.to >= visibleLenRef.current + 2;
      setAwayFromEdge(!atRightEdgeRef.current);
    };
    ts.subscribeVisibleLogicalRangeChange(onRange);
    return () => ts.unsubscribeVisibleLogicalRangeChange(onRange);
  }, []);

  // Keep price precision (axis + price lines) in sync when the symbol changes.
  useEffect(() => {
    chartRef.current?.applyOptions({
      localization: { priceFormatter: (p: number) => formatPrice(p, decimals) },
    });
    candleSeriesRef.current?.applyOptions({
      priceFormat: { type: 'price', precision: decimals, minMove: 1 / 10 ** decimals },
    });
  }, [decimals]);

  // Volume pane visibility toggle (TradingView parity).
  useEffect(() => {
    volumeSeriesRef.current?.applyOptions({ visible: showVolume });
  }, [showVolume]);

  // Data sync: only the visible (revealed) slice ever reaches the series.
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current || !volumeSeriesRef.current) return;

    const prevCount = lastCountRef.current;
    lastCountRef.current = visible.length;
    const dataKey = `${symbol}|${timeframe}|${candles.length}|${candles[candles.length - 1]?.time ?? ''}`;
    const dataChanged = lastDataKeyRef.current !== dataKey;
    lastDataKeyRef.current = dataKey;
    const c = candleSeriesRef.current;
    const v = volumeSeriesRef.current;
    const isAppend = prevCount > 0 && visible.length === prevCount + 1;
    // A "window jump": the visible slice's left edge moved (replay start, reset,
    // or a new start point). This must recenter + refit the price scale,
    // otherwise the price scale stays fitted to the old (full) window and the
    // graph appears squished off to the side.
    const windowStart = replayActive ? visibleStartIndex : 0;
    const windowJumped =
      lastWindowStartRef.current !== null && windowStart !== lastWindowStartRef.current;
    lastWindowStartRef.current = windowStart;

    if (isAppend && visible.length > 0) {
      const last = visible[visible.length - 1];
      if (!last) return;
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
      // Replay autoscale: when the newly revealed candle breaks out of the
      // current price range, refit so it stays in view (like TradingView).
      // Backs off once the user has manually panned/zoomed the price scale.
      const ps = c.priceScale();
      const cur = ps.getVisibleRange();
      if (cur && !priceScaleManualRef.current && (last.high > cur.to || last.low < cur.from)) {
        const lr = chartRef.current.timeScale().getVisibleLogicalRange();
        if (lr) {
          fitPriceScaleToCandles(ps, visible.slice(Math.max(0, Math.floor(lr.from))));
        }
      }
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
      if (dataChanged) {
        // New dataset / timeframe / symbol: land on the latest bars like TradingView.
        // Fresh data re-engages price auto-fit (TradingView resets the scale).
        priceScaleManualRef.current = false;
        setPriceScaleManual(false);
        const rangeFrom = Math.max(0, visible.length - 160);
        chartRef.current.timeScale().setVisibleLogicalRange({ from: rangeFrom, to: visible.length + 4 });
        fitPriceScaleToCandles(c.priceScale(), visible.slice(rangeFrom));
        atRightEdgeRef.current = true;
      } else if (windowJumped) {
        // Replay just started / reset / start point changed: the visible window
        // moved to a different region of history, so land on the start candle
        // and refit the price scale to this window (TradingView parity). This
        // is what keeps the graph centered instead of squished to one side.
        priceScaleManualRef.current = false;
        setPriceScaleManual(false);
        const rangeFrom = Math.max(0, visible.length - 160);
        chartRef.current.timeScale().setVisibleLogicalRange({ from: rangeFrom, to: visible.length + 4 });
        fitPriceScaleToCandles(c.priceScale(), visible.slice(rangeFrom));
        atRightEdgeRef.current = true;
      } else {
        // Replay window moved: preserve the user's view, only clamp if it fell out of range.
        const r = chartRef.current.timeScale().getVisibleLogicalRange();
        if (r && (r.to > visible.length + 8 || r.from < 0)) {
          const rangeFrom = Math.max(0, visible.length - 160);
          chartRef.current.timeScale().setVisibleLogicalRange({
            from: rangeFrom,
            to: visible.length + 4,
          });
          // Recentering the window also re-engages price auto-fit so the new
          // window is shown coherently (covers replay reset / large skips).
          priceScaleManualRef.current = false;
          setPriceScaleManual(false);
          fitPriceScaleToCandles(c.priceScale(), visible.slice(rangeFrom));
          atRightEdgeRef.current = true;
        }
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
        if (isAppend) {
          // Replay tick: only the newest bar is added, so just compute the
          // latest SMA/EMA over a bounded tail instead of the whole slice
          // (SMA20 is exact over its 20-bar window; EMA50 is indistinguishable
          // from the full-series value after a 200-bar warm-up).
          const lastVisible = visible[visible.length - 1];
          if (!lastVisible) return;
          const tail = visible.slice(-200);
          const tS = sma(tail, 20);
          const tE = ema(tail, 50);
          const sl = tS[tS.length - 1];
          const el = tE[tE.length - 1];
          if (sl !== null) smaSeries.update({ time: toChartTime(lastVisible.time), value: sl });
          if (el !== null) emaSeries.update({ time: toChartTime(lastVisible.time), value: el });
        } else {
          const s = sma(visible, 20);
          const e = ema(visible, 50);
          smaSeries.setData(
            s
              .map((val, i) => (val === null || !visible[i] ? null : { time: toChartTime(visible[i].time), value: val }))
              .filter(Boolean) as LineData[],
          );
          emaSeries.setData(
            e
              .map((val, i) => (val === null || !visible[i] ? null : { time: toChartTime(visible[i].time), value: val }))
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
    drawingEngineRef.current?.setContext(symbol, timeframe);
  }, [symbol, timeframe]);

  useEffect(() => {
    const engine = drawingEngineRef.current;
    if (!engine) return;
    const tfSec = TIME_FRAME_MS[timeframe] / 1000;
    const revealTime = replayActive ? (candles[currentReplayIndex]?.time ?? null) : null;
    engine.setData(candles, tfSec, revealTime, replayActive);
    engine.setDecimals(decimals);
  }, [candles, timeframe, decimals, currentReplayIndex, replayActive]);

  // Drawing shortcuts: Ctrl/Cmd+Z undo, Escape cancels an in-progress drawing,
  // Delete/Backspace deletes the selection, Arrow keys nudge selected drawing.
  useEffect(() => {
    const isTyping = (e: KeyboardEvent): boolean => {
      const target = e.target as HTMLElement;
      return !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
    };
    const onKey = (e: KeyboardEvent) => {
      const engine = drawingEngineRef.current;
      if (!engine) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (isTyping(e)) return;
        e.preventDefault();
        e.stopPropagation();
        engine.undo();
        return;
      }
      if (e.key === 'Escape' && engine.cancel()) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && engine.getSelectedId()) {
        if (isTyping(e)) return;
        e.preventDefault();
        e.stopPropagation();
        engine.deleteSelected();
        return;
      }
      if (engine.getSelectedId()) {
        if (isTyping(e)) return;
        const step = e.shiftKey ? 5 : 1;
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          engine.nudgeSelected(0, -step);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          engine.nudgeSelected(0, step);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          engine.nudgeSelected(-step, 0);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          engine.nudgeSelected(step, 0);
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Drawing interactions (click-drag to draw, drag to move, double-click to finish).
  useEffect(() => {
    const container = containerRef.current;
    const engine = drawingEngineRef.current;
    if (!container || !engine) return;

    const getPos = (e: PointerEvent): [number, number] => {
      const rect = container.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top];
    };
    const onDown = (e: PointerEvent): void => {
      if (e.button !== 0) return;
      const [x, y] = getPos(e);
      panStartRef.current = [x, y];
      engine.onPointerDown(x, y);
      if (drawingActiveRef.current || engine.isDragging()) {
        if (!container.hasPointerCapture(e.pointerId)) {
          container.setPointerCapture(e.pointerId);
        }
      }
    };
    const onMove = (e: PointerEvent): void => {
      const [x, y] = getPos(e);
      const start = panStartRef.current;
      if (start) {
        const dx = x - start[0];
        const dy = y - start[1];
        if (Math.abs(dy) > 4 && !drawingActiveRef.current && !engine.isDragging()) {
          priceScaleManualRef.current = true;
          setPriceScaleManual(true);
        }
        if (dx * dx + dy * dy > 12) panStartRef.current = null;
      }
      engine.onPointerMove(x, y);
    };
    const onUp = (): void => {
      panStartRef.current = null;
      engine.onPointerUp();
    };
    const onCancel = (): void => {
      panStartRef.current = null;
      engine.onPointerCancel();
    };
    const onDblClick = (): void => {
      engine.onDblClick();
    };

    container.addEventListener('pointerdown', onDown);
    container.addEventListener('pointermove', onMove);
    container.addEventListener('dblclick', onDblClick);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      container.removeEventListener('pointerdown', onDown);
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('dblclick', onDblClick);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToolChange = (next: DrawingTool): void => {
    setTool(next);
    drawingEngineRef.current?.setTool(next);
  };

  const handleMagnetChange = (next: MagnetMode): void => {
    setMagnetMode(next);
    drawingEngineRef.current?.setMagnetMode(next);
  };

  // When entering replay-start selection, force the select tool back on
  useEffect(() => {
    if (!isSelecting) return;
    setTool('select');
    drawingEngineRef.current?.setTool('select');
  }, [isSelecting]);

  // While a drawing tool is active, take over touch gestures so drags draw
  // instead of scrolling/panning the page.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.style.touchAction = tool !== 'select' ? 'none' : 'auto';
  }, [tool]);

  // Auto-follow: keep the newest revealed candle centered (TradingView-style
  // playback). Uses the current visible span so zoom level is preserved, and
  // only refits toward the newest candle as the replay advances.
  useEffect(() => {
    const ts = chartRef.current?.timeScale();
    if (!ts) return;
    const r = ts.getVisibleLogicalRange();
    const span = r && r.to > r.from ? r.to - r.from : 160;
    const last = Math.max(0, visible.length - 1);
    ts.setVisibleLogicalRange({
      from: Math.max(0, last - span / 2),
      to: last + span / 2,
    });
    atRightEdgeRef.current = true;
  }, [followSignal]);

  useEffect(() => {
    if (!autoFollowRef.current || !isPlayingRef.current) return;
    if (!atRightEdgeRef.current) return;
    const ts = chartRef.current?.timeScale();
    if (!ts) return;
    const r = ts.getVisibleLogicalRange();
    const span = r && r.to > r.from ? r.to - r.from : 160;
    const last = Math.max(0, visible.length - 1);
    ts.setVisibleLogicalRange({
      from: Math.max(0, last - span / 2),
      to: last + span / 2,
    });
  }, [visible.length]);

  // When picking a replay start, bring that candle into view so the marker is visible.
  useEffect(() => {
    if (!isSelecting || selectedIndex === null) return;
    const ts = chartRef.current?.timeScale();
    if (!ts) return;
    atRightEdgeRef.current = false;
    ts.setVisibleLogicalRange({
      from: Math.max(0, selectedIndex - 120),
      to: Math.min(candles.length - 1, selectedIndex + 80),
    });
  }, [isSelecting, selectedIndex, candles]);

  // Replay start / selection markers + trade entry/exit markers.
  useEffect(() => {
    const plugin = markersRef.current;
    if (!plugin) return;
    const markers: SeriesMarker<Time>[] = [];
    if (isSelecting && selectedIndex !== null && selectedIndex < candles.length) {
      const sel = candles[selectedIndex];
      if (!sel) return;
      markers.push({
        time: toChartTime(sel.time),
        position: 'belowBar',
        color: COLORS.accent,
        shape: 'circle',
        text: 'Replay starts here',
        size: 1,
      });
    }
    if (replayActive && replayStartIndex !== null && replayStartIndex < candles.length) {
      const start = candles[replayStartIndex];
      if (!start) return;
      markers.push({
        time: toChartTime(start.time),
        position: 'belowBar',
        color: COLORS.accent,
        shape: 'circle',
        text: 'Replay Starts Here',
        size: 1,
      });
    }
    if (!isSelecting) {
      // Entry/exit markers, only for bars currently in the revealed series.
      const visibleTimes = new Set(visible.map((c) => c.time));
      for (const p of positions) {
        if (!visibleTimes.has(p.openedAt)) continue;
        markers.push({
          time: toChartTime(p.openedAt),
          position: p.direction === 'long' ? 'belowBar' : 'aboveBar',
          color: p.direction === 'long' ? COLORS.up : COLORS.down,
          shape: p.direction === 'long' ? 'arrowUp' : 'arrowDown',
          text: p.direction === 'long' ? 'L' : 'S',
          size: 1,
        });
      }
      for (const t of closedTrades ?? []) {
        if (!visibleTimes.has(t.closedAt)) continue;
        markers.push({
          time: toChartTime(t.closedAt),
          position: t.direction === 'long' ? 'aboveBar' : 'belowBar',
          color: COLORS.text,
          shape: 'square',
          text: 'X',
          size: 1,
        });
      }
    }
    plugin.setMarkers(markers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelecting, selectedIndex, replayActive, replayStartIndex, candles, visible, positions, closedTrades]);

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
  const prev = visible[visible.length - 2];
  const prevClose = prev ? prev.close : hovered?.open ?? 0;
  const change = hovered && prevClose ? ((hovered.close - prevClose) / prevClose) * 100 : 0;

  // Indicator values at the hovered bar (TradingView legend parity). The SMA/EMA
  // arrays are recomputed only when the revealed slice changes (not on every
  // crosshair hover), then indexed by the hovered bar.
  const indicatorArrays = useMemo(() => {
    if (!showIndicators || visible.length < 2) return null;
    return { sma: sma(visible, 20), ema: ema(visible, 50) };
  }, [visible, showIndicators]);

  const indicatorValues = useMemo(() => {
    if (!indicatorArrays || !hovered) return null;
    const idx = visible.findIndex((c) => c.time === hovered.time);
    if (idx < 0) return null;
    return { sma: indicatorArrays.sma[idx], ema: indicatorArrays.ema[idx] };
  }, [indicatorArrays, hovered, visible]);

  return (
    <div className="relative h-full w-full min-h-0">
      <div ref={containerRef} className="h-full w-full" aria-label="Price chart" />
      <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
        <span className="select-none font-mono text-[56px] font-black uppercase leading-none tracking-widest text-white/[0.04]">
          {candles.length === 0 ? 'No Data' : replayActive ? 'Replay' : symbol}
        </span>
      </div>
      <div className="absolute bottom-2 left-1/2 z-20 flex max-w-[calc(100%-16px)] -translate-x-1/2 items-start gap-2 md:left-2 md:translate-x-0">
        <DrawingToolbar
          tool={tool}
          onToolChange={handleToolChange}
          magnetMode={magnetMode}
          onMagnetChange={handleMagnetChange}
          canUndo={canUndo}
          canRedo={canRedo}
          hasSelection={selectedDrawingId != null}
          hasDrawings={drawingsCount > 0}
          onUndo={() => drawingEngineRef.current?.undo()}
          onRedo={() => drawingEngineRef.current?.redo()}
          onDelete={() => drawingEngineRef.current?.deleteSelected()}
          onClear={() => drawingEngineRef.current?.clearAll()}
        />
        {selectedDrawingId != null && (
          <div
            className="flex flex-col gap-1.5 rounded-md border border-bg-border bg-bg-panel/95 p-2 shadow-neo backdrop-blur-sm"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span className="px-0.5 text-[9px] font-semibold uppercase tracking-wider text-text-muted">Color</span>
            <div className="grid grid-cols-4 gap-1">
              {DRAWING_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  aria-label={`Set drawing color ${c}`}
                  onClick={() => drawingEngineRef.current?.setColor(selectedDrawingId, c)}
                  className="h-6 w-6 rounded-sm border border-black/30 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    boxShadow:
                      (drawingEngineRef.current?.getSelected()?.style.strokeColor ?? null) === c
                        ? '0 0 0 2px rgba(255,255,255,0.85), 0 0 0 4px rgba(0,0,0,0.35)'
                        : undefined,
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      {/* Back-to-latest: shown while scrolled away from the newest bar (TradingView parity). */}
      {awayFromEdge && visible.length > 0 && (
        <Tooltip content="Back to latest bar">
          <button
            onClick={() => {
              const ts = chartRef.current?.timeScale();
              if (!ts) return;
              const r = ts.getVisibleLogicalRange();
              const span = r && r.to > r.from ? r.to - r.from : 160;
              const last = Math.max(0, visible.length - 1);
              atRightEdgeRef.current = true;
              ts.setVisibleLogicalRange({
                from: Math.max(0, last - span / 2),
                to: last + span / 2,
              });
            }}
            aria-label="Scroll to the latest bar"
            className="absolute bottom-10 right-2 z-20 flex h-7 w-7 items-center justify-center rounded-sm border border-bg-border bg-bg-panel/95 text-text-secondary shadow-neo-sm transition-colors hover:border-accent hover:text-text-primary"
          >
            <ArrowRightToLine size={14} />
          </button>
        </Tooltip>
      )}
      {/* Price-scale reset: shown while the user has manually panned/zoomed the
          price axis, so replay autoscale can be re-engaged (TradingView parity). */}
      {priceScaleManual && visible.length > 0 && (
        <Tooltip content="Reset price scale">
          <button
            onClick={() => {
              const cs = candleSeriesRef.current;
              if (!cs) return;
              const ps = cs.priceScale();
              const lr = chartRef.current?.timeScale().getVisibleLogicalRange();
              priceScaleManualRef.current = false;
              setPriceScaleManual(false);
              if (lr) fitPriceScaleToCandles(ps, visible.slice(Math.max(0, Math.floor(lr.from))));
            }}
            aria-label="Reset price scale to auto-fit"
            className="absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-sm border border-bg-border bg-bg-panel/95 text-text-secondary shadow-neo-sm transition-colors hover:border-accent hover:text-text-primary"
          >
            <ScanSearch size={14} />
          </button>
        </Tooltip>
      )}
      {/* Legend overlay */}
      <div
        className={`pointer-events-none absolute left-2 z-10 font-mono text-[11px] leading-relaxed text-text-secondary ${
          replayActive ? 'top-2 lg:top-[140px]' : 'top-2'
        }`}
      >
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
            {indicatorValues && (
              <>
                {indicatorValues.sma !== null && indicatorValues.sma !== undefined && (
                  <span>
                    <span className="text-text-muted">SMA20</span>{' '}
                    <span className="text-[#4f8cff]">{formatPrice(indicatorValues.sma, decimals)}</span>
                  </span>
                )}
                {indicatorValues.ema !== null && indicatorValues.ema !== undefined && (
                  <span>
                    <span className="text-text-muted">EMA50</span>{' '}
                    <span className="text-[#eab308]">{formatPrice(indicatorValues.ema, decimals)}</span>
                  </span>
                )}
              </>
            )}
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
