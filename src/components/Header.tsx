import { Camera, CandlestickChart, CircleHelp, Expand, Maximize2, Minimize2, PanelsTopLeft, Play, X } from 'lucide-react';
import type { DataSource, DataSourceOption, Timeframe } from '../types/market';
import { SYMBOLS, TIME_FRAMES } from '../types/market';
import { formatCurrency, formatPct } from '../utils/tradingCalculations';
import { Tooltip } from './ui';

interface HeaderProps {
  symbol: string;
  timeframe: Timeframe;
  onSymbolChange: (s: string) => void;
  onTimeframeChange: (t: Timeframe) => void;
  balance: number;
  startingBalance: number;
  totalPnl: number;
  currentPrice: number;
  decimals: number;
  source: DataSource | null;
  replayActive: boolean;
  onStartReplay: () => void;
  onExitReplay: () => void;
  canStartReplay: boolean;
  sourceOption: DataSourceOption;
  availableSources: DataSourceOption[];
  onSourceChange: (s: DataSourceOption) => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  chartExpanded: boolean;
  onToggleChartExpanded: () => void;
  onShowHelp: () => void;
  onTakeScreenshot: () => void;
}

export function Header({
  symbol,
  timeframe,
  onSymbolChange,
  onTimeframeChange,
  balance,
  startingBalance,
  totalPnl,
  currentPrice,
  decimals,
  source,
  replayActive,
  onStartReplay,
  onExitReplay,
  canStartReplay,
  sourceOption,
  availableSources,
  onSourceChange,
  fullscreen,
  onToggleFullscreen,
  chartExpanded,
  onToggleChartExpanded,
  onShowHelp,
  onTakeScreenshot,
}: HeaderProps) {
  const pnlPositive = totalPnl >= 0;

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-bg-border bg-bg-panel px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-accent shadow-neo-sm">
          <CandlestickChart size={18} className="text-white" />
        </div>
        <div className="leading-tight">
          <div className="text-[14px] font-bold tracking-tight text-text-primary">ReplayTrade</div>
          <div className="text-[9px] font-medium uppercase tracking-widest text-text-muted">
            Bar Replay · Practice
          </div>
        </div>
        {source === 'demo' && (
          <span className="ml-1 rounded-sm border border-yellow-500/50 bg-yellow-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-yellow-400">
            Demo
          </span>
        )}
        {source === 'binance' && (
          <span className="ml-1 rounded-sm border border-up/50 bg-up-dim px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-up">
            Live Data
          </span>
        )}
        {source === 'oanda' && (
          <span className="ml-1 rounded-sm border border-accent/60 bg-accent-dim px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent">
            OANDA
          </span>
        )}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1.5">
          <label htmlFor="hdr-symbol" className="sr-only">
            Market symbol
          </label>
          <select
            id="hdr-symbol"
            value={symbol}
            onChange={(e) => onSymbolChange(e.target.value)}
            disabled={replayActive}
            className="h-8 cursor-pointer rounded-sm border border-bg-border bg-bg-elevated px-2 font-mono text-[12px] font-semibold text-text-primary outline-none transition-colors hover:border-accent focus:border-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {SYMBOLS.map((s) => (
              <option key={s.symbol} value={s.symbol}>
                {s.symbol}
              </option>
            ))}
          </select>
          <label htmlFor="hdr-tf" className="sr-only">
            Timeframe
          </label>
          <select
            id="hdr-tf"
            value={timeframe}
            onChange={(e) => onTimeframeChange(e.target.value as Timeframe)}
            disabled={replayActive}
            className="h-8 cursor-pointer rounded-sm border border-bg-border bg-bg-elevated px-2 font-mono text-[12px] font-semibold text-text-primary outline-none transition-colors hover:border-accent focus:border-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {TIME_FRAMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {availableSources.length > 1 && (
            <>
              <label htmlFor="hdr-source" className="sr-only">
                Data source
              </label>
              <select
                id="hdr-source"
                value={sourceOption}
                onChange={(e) => onSourceChange(e.target.value as DataSourceOption)}
                disabled={replayActive}
                title={sourceOption === 'oanda' ? 'OANDA v20 (needs API key)' : 'Binance public market data'}
                className="h-8 cursor-pointer rounded-sm border border-bg-border bg-bg-elevated px-2 font-mono text-[12px] font-semibold text-text-primary outline-none transition-colors hover:border-accent focus:border-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                {availableSources.map((s) => (
                  <option key={s} value={s}>
                    {s === 'oanda' ? 'OANDA' : 'Binance'}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        <button
          onClick={replayActive ? onExitReplay : onStartReplay}
          disabled={!replayActive && !canStartReplay}
          className={`flex h-8 items-center gap-1.5 rounded-sm border px-3 text-[12px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            replayActive
              ? 'border-down/60 bg-down-dim text-down hover:bg-down'
              : 'border-accent bg-accent text-white hover:bg-accent-hover'
          }`}
        >
          {replayActive ? <X size={14} /> : <Play size={14} />}
          {replayActive ? 'Exit Replay' : 'Start Replay'}
        </button>

        <Tooltip content={fullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}>
          <button
            onClick={onToggleFullscreen}
            aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="flex h-8 w-8 items-center justify-center rounded-sm border border-bg-border bg-bg-elevated text-text-secondary transition-colors hover:border-accent hover:text-text-primary"
          >
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </Tooltip>

        <Tooltip content={chartExpanded ? 'Exit chart focus (Esc)' : 'Focus chart (hide side panel)'}>
          <button
            onClick={onToggleChartExpanded}
            aria-label={chartExpanded ? 'Exit chart focus' : 'Focus chart'}
            className={`flex h-8 w-8 items-center justify-center rounded-sm border transition-colors hover:border-accent hover:text-text-primary ${
              chartExpanded
                ? 'border-accent bg-accent-dim text-accent'
                : 'border-bg-border bg-bg-elevated text-text-secondary'
            }`}
          >
            {chartExpanded ? <PanelsTopLeft size={14} /> : <Expand size={14} />}
          </button>
        </Tooltip>

        <Tooltip content="Shortcuts (Alt+H)">
          <button
            onClick={onShowHelp}
            aria-label="Keyboard shortcuts"
            className="flex h-8 w-8 items-center justify-center rounded-sm border border-bg-border bg-bg-elevated text-text-secondary transition-colors hover:border-accent hover:text-text-primary"
          >
            <CircleHelp size={14} />
          </button>
        </Tooltip>

        <Tooltip content="Save chart image (PNG)">
          <button
            onClick={onTakeScreenshot}
            aria-label="Save chart image"
            className="flex h-8 w-8 items-center justify-center rounded-sm border border-bg-border bg-bg-elevated text-text-secondary transition-colors hover:border-accent hover:text-text-primary"
          >
            <Camera size={14} />
          </button>
        </Tooltip>

        {replayActive && currentPrice > 0 && (
          <div className="hidden text-right font-mono leading-tight md:block">
            <div className="text-[9px] uppercase tracking-wider text-text-muted">{symbol}</div>
            <div className="text-[13px] font-bold text-text-primary">
              {currentPrice.toLocaleString('en-US', {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
              })}
            </div>
          </div>
        )}

        <div className="text-right font-mono leading-tight">
          <div className="text-[9px] uppercase tracking-wider text-text-muted">Balance</div>
          <div className="text-[13px] font-bold text-text-primary">{formatCurrency(balance)}</div>
        </div>

        <div className="text-right font-mono leading-tight">
          <div className="text-[9px] uppercase tracking-wider text-text-muted">P&L</div>
          <div className={`text-[13px] font-bold ${pnlPositive ? 'text-up' : 'text-down'}`}>
            {formatCurrency(totalPnl)}{' '}
            <span className="text-[10px]">
              ({startingBalance > 0 ? formatPct((totalPnl / startingBalance) * 100) : '0.00%'})
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
