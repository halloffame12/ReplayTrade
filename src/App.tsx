import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IChartApi } from 'lightweight-charts';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Briefcase,
  CircleHelp,
  History,
  Info,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Radio,
  X,
} from 'lucide-react';
import { Header } from './components/Header';
import { MarketSelector } from './components/MarketSelector';
import { OnboardingOverlay, isOnboarded } from './components/OnboardingOverlay';
import { ShortcutsHelp } from './components/ShortcutsHelp';
import { PositionsPanel } from './components/PositionsPanel';
import { ReplayStartSelector } from './components/ReplayStartSelector';
import { ReplayToolbar } from './components/ReplayToolbar';
import { ReplayCompleteModal } from './components/ReplayCompleteModal';
import { StatisticsPanel } from './components/StatisticsPanel';
import { TradeHistory } from './components/TradeHistory';
import { TradePanel } from './components/TradePanel';
import { TradingChart } from './components/TradingChart';
import { useChartReplay } from './hooks/useChartReplay';
import { useMarketData } from './hooks/useMarketData';
import { BALANCE_PRESETS, DEFAULT_BALANCE, usePaperTrading } from './hooks/usePaperTrading';
import type { DataSource, DataSourceOption, Timeframe } from './types/market';
import { SYMBOLS, TIME_FRAMES, availableSources, marketSourceFor, persistSourceChoice } from './types/market';
import type { OrderDraft } from './types/trading';
import type { ReplayState } from './types/replay';
import { combinePerformance, formatCurrency, formatPrice } from './utils/tradingCalculations';
import { REPLAY_SPEEDS } from './utils/replayEngine';
import type { DataRange } from './hooks/useMarketData';
import type { LoadProgress } from './services/marketDataService';
import { formatShortDate } from './utils/candleUtils';

const STORAGE_SYMBOL = 'replaytrade:symbol';
const STORAGE_TF = 'replaytrade:timeframe';
const OANDA_TOKEN_KEY = 'replaytrade:oanda_token';
const OANDA_ENV_KEY = 'replaytrade:oanda_env';

interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'danger' | 'info';
}

let toastId = 0;
type BottomTab = 'positions' | 'history' | 'stats' | 'session';

function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v as T;
  } catch {
    /* ignore */
  }
  return fallback;
}

function loadStoredSymbol(): string {
  const v = loadPref(STORAGE_SYMBOL, 'XAUUSD');
  return SYMBOLS.some((s) => s.symbol === v) ? v : 'XAUUSD';
}

function loadStoredTimeframe(): Timeframe {
  const v = loadPref(STORAGE_TF, '15m');
  return (TIME_FRAMES as readonly string[]).includes(v) ? (v as Timeframe) : '15m';
}

export default function App() {
  const [symbol, setSymbol] = useState<string>(() => loadStoredSymbol());
  const [timeframe, setTimeframe] = useState<Timeframe>(() => loadStoredTimeframe());
  const [selectedSource, setSelectedSource] = useState<DataSourceOption>(() =>
    marketSourceFor(symbol),
  );
  const [balanceSetting, setBalanceSetting] = useState(DEFAULT_BALANCE);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<BottomTab>('positions');
  const [orderSheetOpen, setOrderSheetOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [equitySeries, setEquitySeries] = useState<number[]>([]);
  const [showIndicators, setShowIndicators] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [onboarded, setOnboarded] = useState<boolean>(() => isOnboarded());
  const [showHelp, setShowHelp] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [chartExpanded, setChartExpanded] = useState(false);
  const [oandaToken, setOandaToken] = useState<string>(() => {
    try {
      return localStorage.getItem(OANDA_TOKEN_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [oandaEnv, setOandaEnv] = useState<'practice' | 'live'>(() => {
    try {
      return localStorage.getItem(OANDA_ENV_KEY) === 'live' ? 'live' : 'practice';
    } catch {
      return 'practice';
    }
  });

  const market = useMarketData();
  const replay = useChartReplay();
  const paper = usePaperTrading(symbol);

  const lastProcessedRef = useRef(-1);
  const completionHandledRef = useRef(false);
  const chartApiRef = useRef<IChartApi | null>(null);
  const onboardedRef = useRef(onboarded);
  onboardedRef.current = onboarded;
  const showHelpRef = useRef(showHelp);
  showHelpRef.current = showHelp;
  const chartExpandedRef = useRef(chartExpanded);
  chartExpandedRef.current = chartExpanded;
  const orderSheetOpenRef = useRef(orderSheetOpen);
  orderSheetOpenRef.current = orderSheetOpen;

  const decimals = SYMBOLS.find((s) => s.symbol === symbol)?.decimals ?? 2;
  const replayActive =
    replay.state.mode === 'ready' ||
    replay.state.mode === 'playing' ||
    replay.state.mode === 'paused' ||
    replay.state.mode === 'completed';
  // Order placement only makes sense while the tape can still move. The replay
  // is over in 'completed' mode, so block new orders there (a position placed
  // after the final candle could never be evaluated).
  const tradingEnabled =
    replay.state.mode === 'ready' ||
    replay.state.mode === 'playing' ||
    replay.state.mode === 'paused';
  const tradingDisabled = !tradingEnabled || market.loading || market.candles.length === 0;

  const notify = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = ++toastId;
    setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const handleChartReady = useCallback((chart: IChartApi | null) => {
    chartApiRef.current = chart;
  }, []);

  const handleTakeScreenshot = useCallback(() => {
    const chart = chartApiRef.current;
    if (!chart) return;
    const canvas = chart.takeScreenshot(true, false);
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `replaytrade-${symbol}-${timeframe}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [symbol, timeframe]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen()?.catch(() => {});
    } else {
      document.documentElement.requestFullscreen()?.catch(() => {});
    }
  }, []);

  const toggleChartExpanded = useCallback(() => {
    setChartExpanded((v) => !v);
  }, []);

  useEffect(() => {
    const onFsChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const persistPrefs = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_SYMBOL, symbol);
      localStorage.setItem(STORAGE_TF, timeframe);
    } catch {
      /* ignore */
    }
  }, [symbol, timeframe]);

  // Load data whenever symbol/timeframe changes.
  useEffect(() => {
    persistPrefs();
    void market.load(symbol, timeframe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe]);

  // Keep the selected data source in sync with the active market.
  useEffect(() => {
    setSelectedSource(marketSourceFor(symbol));
  }, [symbol]);

  // New dataset arrives: reset replay + paper trading.
  useEffect(() => {
    if (market.candles.length === 0) return;
    replay.setCandles(market.candles);
    paper.startSession(balanceSetting);
    lastProcessedRef.current = -1;
    completionHandledRef.current = false;
    setSelectedIndex(null);
    setEquitySeries([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market.candles, market.source]);

  // Sample the equity curve.
  useEffect(() => {
    if (market.candles.length === 0) return;
    setEquitySeries((prev) => {
      const last = prev[prev.length - 1];
      if (last !== undefined && Math.abs(last - paper.equity) < 1e-9) return prev;
      return [...prev.slice(-1500), paper.equity];
    });
  }, [paper.equity, market.candles.length]);

  const beginReplayRun = useCallback(
    (index: number) => {
      const candle = replay.state.candles[index];
      replay.confirmStart(index);
      paper.startSession(balanceSetting);
      setEquitySeries([]);
      setSelectedIndex(null);
      lastProcessedRef.current = index;
      completionHandledRef.current = false;
      paper.updatePrice(candle?.close ?? 0);
    },
    [replay.confirmStart, replay.state.candles, paper.startSession, paper.updatePrice, balanceSetting],
  );

  const handleSelectCandle = useCallback(
    (index: number) => {
      if (replay.state.mode !== 'selecting') return;
      setSelectedIndex(index);
    },
    [replay.state.mode],
  );

  const handleStartReplay = useCallback(() => {
    if (replay.state.candles.length === 0) return;
    setSelectedIndex(null);
    replay.enterReplayMode();
  }, [replay]);

  const handleSourceChange = useCallback(
    (source: DataSourceOption) => {
      setSelectedSource(source);
      persistSourceChoice(symbol, source);
      void market.load(symbol, timeframe, { source });
    },
    [symbol, timeframe, market],
  );

  const handleOandaTokenChange = useCallback(
    (token: string) => {
      setOandaToken(token);
      try {
        localStorage.setItem(OANDA_TOKEN_KEY, token);
      } catch {
        /* ignore */
      }
      if (symbol === 'XAUUSD') void market.load(symbol, timeframe);
    },
    [symbol, timeframe, market],
  );

  const handleOandaEnvChange = useCallback(
    (env: 'practice' | 'live') => {
      setOandaEnv(env);
      try {
        localStorage.setItem(OANDA_ENV_KEY, env);
      } catch {
        /* ignore */
      }
      if (symbol === 'XAUUSD') void market.load(symbol, timeframe);
    },
    [symbol, timeframe, market],
  );

  // Advance the paper-trading account as replay reveals candles.
  useEffect(() => {
    const candles = replay.state.candles;
    if (candles.length === 0) return;
    const index = replay.state.currentReplayIndex;
    const from = lastProcessedRef.current;

    // While idle/selecting the whole history is visible, so the mark price is
    // the latest close and no candles are "revealed" yet.
    const active =
      replay.state.mode === 'ready' ||
      replay.state.mode === 'playing' ||
      replay.state.mode === 'paused' ||
      replay.state.mode === 'completed';
    if (!active) {
      const last = candles[candles.length - 1];
      if (last) paper.updatePrice(last.close);
      lastProcessedRef.current = candles.length - 1;
      return;
    }

    if (index > from) {
      for (let i = from + 1; i <= index; i++) {
        const c = candles[i];
        if (!c) continue;
        const { closedTrades } = paper.processTick(c);
        closedTrades.forEach((t) =>
          notify(
            `${t.symbol} ${t.direction === 'long' ? 'long' : 'short'} closed @ ${formatPrice(
              t.exitPrice,
              decimals,
            )} — ${t.exitReason === 'stop-loss' ? 'stop-loss hit' : 'take-profit hit'} (${formatCurrency(
              t.pnl,
            )})`,
            t.pnl >= 0 ? 'success' : 'danger',
          ),
        );
      }
    } else if (index < from) {
      const c = candles[index];
      if (c) paper.updatePrice(c.close);
    }
    lastProcessedRef.current = index;
  }, [
    replay.state.currentReplayIndex,
    replay.state.candles,
    replay.state.mode,
    paper.processTick,
    paper.updatePrice,
    notify,
    decimals,
  ]);

  // Replay complete: close open positions at the final price.
  useEffect(() => {
    if (replay.state.mode === 'completed' && !completionHandledRef.current) {
      completionHandledRef.current = true;
      const candles = replay.state.candles;
      const price = candles[candles.length - 1]?.close ?? 0;
      if (price > 0) {
        const lastCandle = candles[candles.length - 1];
        const closedAt = lastCandle ? lastCandle.time : undefined;
        const trades = paper.closeAllAtPrice(price, 'replay-ended', closedAt);
        trades.forEach((t) =>
          notify(
            `${t.symbol} ${t.direction === 'long' ? 'long' : 'short'} closed at replay end (${formatCurrency(
              t.pnl,
            )})`,
            t.pnl >= 0 ? 'success' : 'danger',
          ),
        );
      }
    }
  }, [replay.state.mode, replay.state.candles, paper.closeAllAtPrice, notify]);

  const handlePlaceOrder = useCallback(
    (draft: OrderDraft) => {
      const currentCandle = replay.state.candles[replay.state.currentReplayIndex];
      const openedAt = currentCandle ? currentCandle.time : undefined;
      const result = paper.openPosition(draft, openedAt);
      if (result.ok) {
        notify(
          `${draft.direction === 'long' ? 'Buy' : 'Sell'} ${draft.quantity} ${symbol} @ ${formatPrice(
            draft.entryPrice,
            decimals,
          )} — simulated`,
          'success',
        );
        setOrderSheetOpen(false);
      } else {
        result.errors.forEach((e) => notify(e, 'danger'));
      }
      return result;
    },
    [paper.openPosition, replay.state.candles, replay.state.currentReplayIndex, symbol, decimals, notify],
  );

  const handleClosePosition = useCallback(
    (id: string) => {
      const currentCandle = replay.state.candles[replay.state.currentReplayIndex];
      const closedAt = currentCandle ? currentCandle.time : undefined;
      const t = paper.closePositionById(id, closedAt);
      if (t) {
        notify(
          `Closed ${t.symbol} ${t.direction === 'long' ? 'long' : 'short'} @ ${formatPrice(
            t.exitPrice,
            decimals,
          )} (${formatCurrency(t.pnl)})`,
          t.pnl >= 0 ? 'success' : 'danger',
        );
      }
    },
    [paper.closePositionById, replay.state.candles, replay.state.currentReplayIndex, decimals, notify],
  );

  const handleCloseHalf = useCallback(
    (id: string) => {
      const currentCandle = replay.state.candles[replay.state.currentReplayIndex];
      const closedAt = currentCandle ? currentCandle.time : undefined;
      const t = paper.closeHalf(id, closedAt);
      if (t) {
        notify(
          `Closed 50% of ${t.symbol} @ ${formatPrice(t.exitPrice, decimals)} (${formatCurrency(t.pnl)})`,
          t.pnl >= 0 ? 'success' : 'danger',
        );
      }
    },
    [paper.closeHalf, replay.state.candles, replay.state.currentReplayIndex, decimals, notify],
  );

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      // Let Space activate a focused button (native behaviour) instead of hijacking it.
      if (e.key === ' ' && target?.tagName === 'BUTTON') return;
      // While an overlay, dialog or the order sheet is open, let it own the keys
      // (e.g. Escape must close help without also exiting an active replay).
      if (!onboardedRef.current || showHelpRef.current || orderSheetOpenRef.current) return;
      // Global: fullscreen + shortcuts help.
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      // Chart-expanded mode owns Escape: exit it before anything else.
      if (chartExpandedRef.current) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setChartExpanded(false);
        }
        return;
      }
      if (e.altKey && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        setShowHelp((v) => !v);
        return;
      }
      if (replay.state.mode === 'selecting') {
        if (e.key === 'Escape') replay.cancelSelecting();
        return;
      }
      if (replay.state.mode === 'idle') {
        const tfIndex = Number(e.key) - 1;
        const tf = TIME_FRAMES[tfIndex];
        if (tf && tfIndex >= 0 && tfIndex < TIME_FRAMES.length) setTimeframe(tf);
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        replay.togglePlay();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) replay.skipForward(5);
        else replay.nextCandle();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) replay.skipBackward(5);
        else replay.previousCandle();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        const speeds: readonly number[] = REPLAY_SPEEDS;
        const idx = speeds.indexOf(replay.state.speed);
        replay.setSpeed(REPLAY_SPEEDS[Math.min(REPLAY_SPEEDS.length - 1, idx + 1)]!);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        const speeds: readonly number[] = REPLAY_SPEEDS;
        const idx = speeds.indexOf(replay.state.speed);
        replay.setSpeed(REPLAY_SPEEDS[Math.max(0, idx - 1)]!);
      } else if (e.key === 'Escape') {
        replay.exitReplay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    replay.state.mode,
    replay.togglePlay,
    replay.nextCandle,
    replay.previousCandle,
    replay.skipForward,
    replay.skipBackward,
    replay.setSpeed,
    replay.cancelSelecting,
    replay.exitReplay,
    toggleFullscreen,
  ]);

  const perf = useMemo(
    () => combinePerformance(paper.state.history, paper.state.maxDrawdown),
    [paper.state.history, paper.state.maxDrawdown],
  );

  const canStartReplay =
    !market.loading &&
    market.candles.length > 100 &&
    !replayActive;

  const availableSourcesForSymbol = availableSources(symbol);

  const renderChart = () => (
    <div className="relative h-full w-full">
      <TradingChart
        candles={market.candles}
        timeframe={timeframe}
        symbol={symbol}
        decimals={decimals}
        currentPrice={paper.currentPrice}
        positions={paper.state.positions}
        closedTrades={paper.state.history}
        replayActive={replayActive}
        visibleStartIndex={replay.state.visibleStartIndex}
        currentReplayIndex={replay.state.currentReplayIndex}
        isSelecting={replay.state.mode === 'selecting'}
        selectedIndex={selectedIndex}
        replayStartIndex={replay.state.replayStartIndex}
        onSelectCandle={handleSelectCandle}
        isPlaying={replay.state.isPlaying}
        autoFollow={replay.autoFollow}
        followSignal={replay.followSignal}
        showIndicators={showIndicators}
        showVolume={showVolume}
        onChartReady={handleChartReady}
      />
      {market.loading && <LoadingOverlay progress={market.progress} />}
      {replay.state.mode === 'selecting' && (
        <ReplayStartSelector
          candles={replay.state.candles}
          selectedIndex={selectedIndex}
          timeframe={timeframe}
          decimals={decimals}
          onCancel={replay.cancelSelecting}
          onConfirm={() => {
            if (selectedIndex !== null) beginReplayRun(selectedIndex);
          }}
        />
      )}
      {(replay.state.mode === 'ready' ||
        replay.state.mode === 'playing' ||
        replay.state.mode === 'paused') && (
        <div className={chartExpanded ? 'block' : 'hidden lg:block'}>
          <ReplayToolbar
            controls={replay}
            timeframe={timeframe}
            decimals={decimals}
            autoFollow={replay.autoFollow}
            onToggleAutoFollow={() => replay.setAutoFollow(!replay.autoFollow)}
            variant="floating"
          />
        </div>
      )}
    </div>
  );

  const chartNode = renderChart();

  const tabButtons: { id: BottomTab; label: string; icon: React.ReactNode }[] = [
    { id: 'positions', label: 'Positions', icon: <Briefcase size={13} /> },
    { id: 'history', label: 'Trade History', icon: <History size={13} /> },
    { id: 'stats', label: 'Statistics', icon: <BarChart3 size={13} /> },
    { id: 'session', label: 'Session', icon: <Info size={13} /> },
  ];

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-bg-base text-text-primary">
      <Header
        symbol={symbol}
        timeframe={timeframe}
        onSymbolChange={(s) => {
          setSymbol(s);
          setActiveTab('positions');
        }}
        onTimeframeChange={(t) => {
          setTimeframe(t);
          setActiveTab('positions');
        }}
        balance={paper.state.balance}
        startingBalance={paper.state.startingBalance}
        totalPnl={paper.totalPnl}
        currentPrice={paper.currentPrice}
        decimals={decimals}
        source={market.source}
        replayActive={replayActive}
        canStartReplay={canStartReplay}
        onStartReplay={handleStartReplay}
        onExitReplay={() => {
          replay.exitReplay();
          setSelectedIndex(null);
        }}
        sourceOption={selectedSource}
        availableSources={availableSourcesForSymbol}
        onSourceChange={handleSourceChange}
        fullscreen={fullscreen}
        onToggleFullscreen={toggleFullscreen}
        chartExpanded={chartExpanded}
        onToggleChartExpanded={toggleChartExpanded}
        onShowHelp={() => setShowHelp(true)}
        onTakeScreenshot={handleTakeScreenshot}
      />

      <div className="flex flex-1 min-h-0 flex-col md:flex-row">
        {/* Left tools panel (desktop) */}
        <aside
          className={`hidden shrink-0 overflow-y-auto border-r border-bg-border bg-bg-panel/40 lg:block ${
            chartExpanded ? '!hidden' : ''
          } ${leftCollapsed ? 'w-[34px] p-1' : 'w-[240px] p-3'}`}
        >
          {leftCollapsed ? (
            <button
              onClick={() => setLeftCollapsed(false)}
              aria-label="Expand left panel"
              title="Expand left panel"
              className="mx-auto flex h-8 w-full items-center justify-center rounded-sm text-text-muted hover:bg-bg-hover hover:text-text-primary"
            >
              <PanelLeftOpen size={15} />
            </button>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  Markets
                </span>
                <button
                  onClick={() => setLeftCollapsed(true)}
                  aria-label="Collapse left panel"
                  title="Collapse left panel"
                  className="rounded-sm p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary"
                >
                  <PanelLeftClose size={14} />
                </button>
              </div>
              <MarketSelector
                symbol={symbol}
                timeframe={timeframe}
                onSymbolChange={setSymbol}
                onTimeframeChange={setTimeframe}
                loading={market.loading}
                progress={market.progress}
                error={market.error}
                source={market.source}
                range={market.range}
                candleCount={market.candles.length}
                canStartReplay={canStartReplay}
                replayActive={replayActive}
                onStartReplay={handleStartReplay}
                onRetry={() => void market.load(symbol, timeframe)}
                onUseDemo={() => market.useDemoData(symbol, timeframe)}
                sourceOption={selectedSource}
                availableSources={availableSourcesForSymbol}
                onSourceChange={handleSourceChange}
              />
              <SessionMiniCard
                balance={paper.state.balance}
                equity={paper.equity}
                available={paper.available}
                unrealized={paper.unrealizedPnl}
                positions={paper.state.positions.length}
              />
            </>
          )}
        </aside>

        {/* Chart column */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-[240px] min-w-0 flex-1">{chartNode}</div>

          {/* Phones/tablets: compact data status or inline replay toolbar below chart */}
          <div className={`shrink-0 border-t border-bg-border p-2 lg:hidden ${chartExpanded ? '!hidden' : ''}`}>
            {replayActive ? (
              <ReplayToolbar
                controls={replay}
                timeframe={timeframe}
                decimals={decimals}
                autoFollow={replay.autoFollow}
                onToggleAutoFollow={() => replay.setAutoFollow(!replay.autoFollow)}
                variant="inline"
              />
            ) : (
              <MobileStatusStrip
                loading={market.loading}
                progress={market.progress}
                error={market.error}
                source={market.source}
                range={market.range}
                candleCount={market.candles.length}
                canStartReplay={canStartReplay}
                onStartReplay={handleStartReplay}
                onRetry={() => void market.load(symbol, timeframe)}
                onUseDemo={() => market.useDemoData(symbol, timeframe)}
              />
            )}
          </div>
        </main>

        {/* Right trade panel (tablet & desktop) */}
        <aside
          className={`hidden shrink-0 overflow-y-auto border-l border-bg-border bg-bg-panel/40 md:block ${
            rightCollapsed ? 'w-[34px] p-1 lg:w-[40px]' : 'w-[260px] p-3 lg:w-[300px]'
          }`}
        >
          {rightCollapsed ? (
            <button
              onClick={() => setRightCollapsed(false)}
              aria-label="Expand right panel"
              title="Expand right panel"
              className="mx-auto flex h-8 w-full items-center justify-center rounded-sm text-text-muted hover:bg-bg-hover hover:text-text-primary"
            >
              <PanelRightOpen size={15} />
            </button>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Activity size={14} className="text-accent" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    Trade Panel
                  </span>
                </div>
                <button
                  onClick={() => setRightCollapsed(true)}
                  aria-label="Collapse right panel"
                  title="Collapse right panel"
                  className="rounded-sm p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary"
                >
                  <PanelRightClose size={14} />
                </button>
              </div>
              <TradePanel
                symbol={symbol}
                currentPrice={paper.currentPrice}
                availableBalance={paper.available}
                decimals={decimals}
                disabled={tradingDisabled}
                onPlaceOrder={handlePlaceOrder}
              />
              <div className="mt-3 rounded-sm border border-bg-border bg-bg-panel p-2.5 font-mono text-[11px]">
                <AccountRow label="Equity" value={formatCurrency(paper.equity)} />
                <AccountRow label="Available" value={formatCurrency(paper.available)} />
                <AccountRow label="Open value" value={formatCurrency(paper.openValue)} />
                <AccountRow
                  label="Unrealized"
                  value={formatCurrency(paper.unrealizedPnl)}
                  tone={paper.unrealizedPnl >= 0 ? 'up' : 'down'}
                />
              </div>
            </>
          )}
        </aside>
      </div>

      {/* Bottom panel */}
      <div
        className={`shrink-0 border-t border-bg-border bg-bg-panel pb-[env(safe-area-inset-bottom)] ${
          chartExpanded ? '!hidden' : ''
        }`}
      >
        <div
          className="flex items-center gap-1 overflow-x-auto border-b border-bg-border px-2 pt-1.5"
          role="tablist"
          aria-label="Trading panels"
        >
          {tabButtons.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-t-sm border-b-2 px-3 py-2 text-[11px] font-semibold transition-colors ${
                activeTab === t.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {t.icon} {t.label}
              {t.id === 'positions' && paper.state.positions.length > 0 && (
                <span className="ml-0.5 rounded-sm bg-accent px-1 text-[9px] font-bold text-white">
                  {paper.state.positions.length}
                </span>
              )}
            </button>
          ))}
          <button
            onClick={() => setOrderSheetOpen(true)}
            disabled={tradingDisabled}
            title={replayActive ? 'Place order' : 'Start a replay to trade'}
            className="ml-auto flex items-center gap-1.5 rounded-sm bg-accent px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40 lg:hidden"
          >
            Trade
          </button>
          <button
            onClick={() => setShowHelp(true)}
            aria-label="Keyboard shortcuts and help"
            title="Shortcuts (Alt+H)"
            className="ml-auto hidden items-center gap-1 rounded-sm border border-bg-border bg-bg-elevated px-2 py-1.5 text-[11px] font-semibold text-text-secondary transition-colors hover:border-accent hover:text-text-primary lg:flex"
          >
            <CircleHelp size={13} /> Shortcuts
          </button>
        </div>
        <div className="max-h-[220px] overflow-y-auto lg:max-h-[240px]">
          {activeTab === 'positions' && (
            <PositionsPanel
              positions={paper.state.positions}
              currentPrice={paper.currentPrice}
              decimals={decimals}
              onClose={handleClosePosition}
              onCloseHalf={handleCloseHalf}
              onMoveStop={paper.moveStopToEntry}
            />
          )}
          {activeTab === 'history' && (
            <TradeHistory history={paper.state.history} decimals={decimals} />
          )}
          {activeTab === 'stats' && (
            <StatisticsPanel
              perf={perf}
              equitySeries={equitySeries}
              startingBalance={paper.state.startingBalance}
              realizedPnl={paper.state.realizedPnl}
              unrealizedPnl={paper.unrealizedPnl}
              currentEquity={paper.equity}
            />
          )}
          {activeTab === 'session' && (
            <SessionDetails
              symbol={symbol}
              timeframe={timeframe}
              source={market.source}
              range={market.range}
              candleCount={market.candles.length}
              replay={replay.state}
              balanceSetting={balanceSetting}
              onBalanceChange={setBalanceSetting}
              showIndicators={showIndicators}
              onToggleIndicators={() => setShowIndicators((v) => !v)}
              showVolume={showVolume}
              onToggleVolume={() => setShowVolume((v) => !v)}
              oandaToken={oandaToken}
              oandaEnv={oandaEnv}
              onOandaTokenChange={handleOandaTokenChange}
              onOandaEnvChange={handleOandaEnvChange}
            />
          )}
        </div>
      </div>

      {/* Disclaimer */}
      <div
        className={`shrink-0 border-t border-bg-border bg-bg-base px-3 py-1 text-center font-mono text-[9px] text-text-muted ${
          chartExpanded ? '!hidden' : ''
        }`}
      >
        Simulated trading environment. Market data may be delayed or unavailable. Educational use
        only. Not financial advice.
      </div>

      {/* Mobile order bottom sheet */}
      {orderSheetOpen && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOrderSheetOpen(false)} aria-hidden="true" />
          <div
            className="relative max-h-[82%] overflow-y-auto rounded-t-md border-t border-bg-border bg-bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-neo animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-label="Place order"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Activity size={14} className="text-accent" />
                <span className="text-[12px] font-bold text-text-primary">Place Order</span>
                <span className="font-mono text-[10px] text-text-muted">{symbol}</span>
              </div>
              <button
                onClick={() => setOrderSheetOpen(false)}
                aria-label="Close order panel"
                className="text-text-muted hover:text-text-primary"
              >
                <X size={16} />
              </button>
            </div>
            <TradePanel
              symbol={symbol}
              currentPrice={paper.currentPrice}
              availableBalance={paper.available}
              decimals={decimals}
              disabled={tradingDisabled}
              onPlaceOrder={handlePlaceOrder}
            />
          </div>
        </div>
      )}

      {/* First-run onboarding + shortcuts help */}
      <OnboardingOverlay open={!onboarded} onClose={() => setOnboarded(true)} />
      {showHelp && <ShortcutsHelp onClose={() => setShowHelp(false)} />}

      {/* Replay complete modal */}
      {replay.state.mode === 'completed' && (
        <ReplayCompleteModal
          perf={perf}
          startingBalance={paper.state.startingBalance}
          finalBalance={paper.state.balance}
          totalPnl={paper.totalPnl}
          trades={paper.state.history.length}
          onReplayAgain={() => {
            if (replay.state.replayStartIndex !== null) {
              beginReplayRun(replay.state.replayStartIndex);
            }
          }}
          onChooseAnotherStart={() => {
            completionHandledRef.current = false;
            setSelectedIndex(null);
            replay.enterReplayMode();
          }}
          onCreateNewSession={() => {
            void market.load(symbol, timeframe);
          }}
          onClose={() => replay.exitReplay()}
        />
      )}

      {/* Toasts */}
      <div className="pointer-events-none fixed right-3 top-14 z-50 flex w-[min(300px,calc(100vw-24px))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-none flex items-start gap-2 rounded-sm border px-3 py-2 font-mono text-[11px] shadow-neo-sm animate-fade-in ${
              t.tone === 'success'
                ? 'border-up/50 bg-up-dim text-up'
                : t.tone === 'danger'
                  ? 'border-down/50 bg-down-dim text-down'
                  : 'border-accent/50 bg-bg-panel text-accent'
            }`}
          >
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              aria-label="Dismiss"
              className="pointer-events-auto opacity-60 hover:opacity-100"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'up' | 'down';
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-text-muted">{label}</span>
      <span className={tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-text-primary'}>
        {value}
      </span>
    </div>
  );
}

function SessionMiniCard({
  balance,
  equity,
  available,
  unrealized,
  positions,
}: {
  balance: number;
  equity: number;
  available: number;
  unrealized: number;
  positions: number;
}) {
  return (
    <div className="mt-3 rounded-sm border border-bg-border bg-bg-panel p-2.5 font-mono text-[11px]">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        Account
      </div>
      <AccountRow label="Balance" value={formatCurrency(balance)} />
      <AccountRow label="Equity" value={formatCurrency(equity)} />
      <AccountRow label="Available" value={formatCurrency(available)} />
      <AccountRow
        label="Unrealized"
        value={formatCurrency(unrealized)}
        tone={unrealized >= 0 ? 'up' : 'down'}
      />
      <AccountRow label="Open positions" value={String(positions)} />
    </div>
  );
}

function MobileStatusStrip({
  loading,
  progress,
  error,
  source,
  range,
  candleCount,
  canStartReplay,
  onStartReplay,
  onRetry,
  onUseDemo,
}: {
  loading: boolean;
  progress: LoadProgress | null;
  error: string | null;
  source: DataSource | null;
  range: DataRange | null;
  candleCount: number;
  canStartReplay: boolean;
  onStartReplay: () => void;
  onRetry: () => void;
  onUseDemo: () => void;
}) {
  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-sm border border-down/50 bg-down-dim px-2 py-2">
        <AlertTriangle size={14} className="shrink-0 text-down" />
        <span className="min-w-0 flex-1 break-words font-mono text-[10px] leading-snug text-down/90">
          {error}
        </span>
        <div className="flex shrink-0 gap-1.5">
          <button
            onClick={onRetry}
            className="rounded-sm border border-bg-border bg-bg-elevated px-2 py-1 text-[10px] font-semibold text-text-primary hover:bg-bg-hover"
          >
            Retry
          </button>
          <button
            onClick={onUseDemo}
            className="rounded-sm border border-yellow-500/60 bg-yellow-500/10 px-2 py-1 text-[10px] font-semibold text-yellow-400 hover:bg-yellow-500/20"
          >
            Use Demo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {loading ? (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div
            className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-bg-hover"
            role="progressbar"
            aria-valuenow={progress?.pct ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Historical data loading progress"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-150"
              style={{ width: `${progress?.pct ?? 0}%` }}
            />
          </div>
          <span className="font-mono text-[10px] font-bold text-accent">
            {progress ? `${progress.pct}%` : '0%'}
          </span>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-text-secondary">
          {source === 'binance' && (
            <span className="flex items-center gap-1 rounded-sm border border-up/50 bg-up-dim px-1.5 py-px text-[9px] font-semibold uppercase text-up">
              <Radio size={9} /> Binance
            </span>
          )}
          {source === 'oanda' && (
            <span className="flex items-center gap-1 rounded-sm border border-accent/60 bg-accent-dim px-1.5 py-px text-[9px] font-semibold uppercase text-accent">
              <Radio size={9} /> OANDA
            </span>
          )}
          {source === 'demo' && (
            <span className="rounded-sm border border-yellow-500/50 bg-yellow-500/10 px-1.5 py-px text-[9px] font-semibold uppercase text-yellow-400">
              Demo
            </span>
          )}
          <span>
            <span className="text-text-muted">Candles:</span>{' '}
            <span className="text-text-primary">{candleCount.toLocaleString()}</span>
          </span>
          {range && (
            <span>
              <span className="text-text-muted">Range:</span>{' '}
              <span className="text-text-primary">
                {formatShortDate(range.from)} → {formatShortDate(range.to)}
              </span>
            </span>
          )}
        </div>
      )}

      <button
        onClick={onStartReplay}
        disabled={!canStartReplay}
        className="ml-auto flex shrink-0 items-center gap-1.5 rounded-sm border border-accent bg-accent px-3 py-2 text-[12px] font-bold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Play size={14} /> Start Replay
      </button>
    </div>
  );
}

function LoadingOverlay({ progress }: { progress: { pct: number } | null }) {
  const pct = progress?.pct ?? 0;
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg-base/80 backdrop-blur-[1px]">
      <div className="w-[min(320px,calc(100vw-24px))] rounded-md border border-bg-border bg-bg-panel p-4 shadow-neo">
        <div className="mb-2 flex items-center justify-between font-mono text-[11px]">
          <span className="text-text-secondary">Loading historical data</span>
          <span className="font-bold text-accent">{pct}%</span>
        </div>
        <div
          className="h-2.5 overflow-hidden rounded-full bg-bg-hover"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Historical data loading progress"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 font-mono text-[10px] text-text-muted">
          Fetching ~6 months of historical candles from the public market data service…
        </p>
      </div>
    </div>
  );
}

function SessionDetails({
  symbol,
  timeframe,
  source,
  range,
  candleCount,
  replay,
  balanceSetting,
  onBalanceChange,
  showIndicators,
  onToggleIndicators,
  showVolume,
  onToggleVolume,
  oandaToken,
  oandaEnv,
  onOandaTokenChange,
  onOandaEnvChange,
}: {
  symbol: string;
  timeframe: Timeframe;
  source: string | null;
  range: { from: number; to: number } | null;
  candleCount: number;
  replay: ReplayState;
  balanceSetting: number;
  onBalanceChange: (v: number) => void;
  showIndicators: boolean;
  onToggleIndicators: () => void;
  showVolume: boolean;
  onToggleVolume: () => void;
  oandaToken: string;
  oandaEnv: 'practice' | 'live';
  onOandaTokenChange: (v: string) => void;
  onOandaEnvChange: (v: 'practice' | 'live') => void;
}) {
  const revealedPct =
    replay.candles.length > 0 ? ((replay.currentReplayIndex + 1) / replay.candles.length) * 100 : 0;

  const rows: [string, string][] = [
    ['Market', symbol],
    ['Timeframe', timeframe],
    ['Data source', source === 'binance' ? 'Binance (live)' : source === 'oanda' ? 'OANDA (live)' : source === 'demo' ? 'Demo (local)' : '—'],
    ['Candles loaded', candleCount.toLocaleString()],
    [
      'Covered period',
      range
        ? `${new Date(range.from * 1000).toLocaleDateString()} → ${new Date(range.to * 1000).toLocaleDateString()}`
        : '—',
    ],
    ['Replay mode', replay.mode],
    ['Replay start', replay.replayStartIndex !== null ? `candle #${replay.replayStartIndex + 1}` : '—'],
    ['Revealed', `${replay.currentReplayIndex + 1} / ${replay.candles.length} (${revealedPct.toFixed(1)}%)`],
    ['Speed', `${replay.speed}x`],
  ];

  return (
    <div className="flex flex-wrap gap-4 p-3">
      <dl className="grid flex-1 grid-cols-1 gap-x-8 gap-y-1 font-mono text-[11px] sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4 border-b border-bg-border/40 py-1">
            <dt className="text-text-muted">{k}</dt>
            <dd className="text-text-primary">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex w-full flex-col gap-3 lg:w-auto">
        <div className="rounded-sm border border-bg-border bg-bg-elevated p-2.5">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Paper trading balance
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {BALANCE_PRESETS.map((b) => (
              <button
                key={b}
                onClick={() => onBalanceChange(b)}
                aria-pressed={balanceSetting === b}
                className={`rounded-sm border px-2 py-1 font-mono text-[10px] transition-colors ${
                  balanceSetting === b
                    ? 'border-accent bg-accent-dim text-accent'
                    : 'border-bg-border bg-bg-panel text-text-secondary hover:bg-bg-hover'
                }`}
              >
                ${b.toLocaleString()}
              </button>
            ))}
            <input
              type="number"
              min={100}
              value={balanceSetting}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v > 0) onBalanceChange(v);
              }}
              aria-label="Custom starting balance"
              className="h-7 w-24 rounded-sm border border-bg-border bg-bg-panel px-2 font-mono text-[11px] text-text-primary outline-none focus:border-accent"
            />
          </div>
          <p className="mt-1.5 text-[10px] text-text-muted">
            Applied when you start the next replay run.
          </p>
        </div>
        <div className="rounded-sm border border-bg-border bg-bg-elevated p-2.5">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            OANDA · XAUUSD Gold Spot
          </div>
          <input
            type="text"
            value={oandaToken}
            onChange={(e) => onOandaTokenChange(e.target.value)}
            placeholder="Paste your OANDA v20 access token"
            autoComplete="off"
            spellCheck={false}
            className="h-8 w-full rounded-sm border border-bg-border bg-bg-panel px-2 font-mono text-[11px] text-text-primary outline-none focus:border-accent"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-text-muted">Account</span>
            <div className="flex gap-1">
              {(['practice', 'live'] as const).map((env) => (
                <button
                  key={env}
                  onClick={() => onOandaEnvChange(env)}
                  aria-pressed={oandaEnv === env}
                  className={`rounded-sm border px-2 py-1 font-mono text-[10px] transition-colors ${
                    oandaEnv === env
                      ? 'border-accent bg-accent-dim text-accent'
                      : 'border-bg-border bg-bg-panel text-text-secondary hover:bg-bg-hover'
                  }`}
                >
                  {env === 'practice' ? 'Practice' : 'Live'}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-text-muted">
            Token is stored only in your browser. Saving reloads the chart when XAU/USD is selected.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onToggleIndicators}
            aria-pressed={showIndicators}
            className="rounded-sm border border-bg-border bg-bg-elevated px-3 py-1.5 text-[11px] font-semibold text-text-primary transition-colors hover:border-accent"
          >
            {showIndicators ? 'Hide SMA / EMA overlay' : 'Show SMA / EMA overlay'}
          </button>
          <button
            onClick={onToggleVolume}
            aria-pressed={showVolume}
            className="rounded-sm border border-bg-border bg-bg-elevated px-3 py-1.5 text-[11px] font-semibold text-text-primary transition-colors hover:border-accent"
          >
            {showVolume ? 'Hide Volume' : 'Show Volume'}
          </button>
        </div>
      </div>
    </div>
  );
}
