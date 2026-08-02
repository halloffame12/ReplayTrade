import {
  ChevronLeft,
  ChevronsRight,
  FastForward,
  Pause,
  Play,
  Rewind,
  RotateCcw,
  SkipBack,
  SkipForward,
  X,
  Zap,
} from 'lucide-react';
import type { ReplayControls } from '../types/replay';
import type { Timeframe } from '../types/market';
import { REPLAY_SPEEDS } from '../utils/replayEngine';
import { formatCandleDate } from '../utils/candleUtils';

interface ReplayToolbarProps {
  controls: ReplayControls;
  timeframe: Timeframe;
  decimals: number;
  autoFollow: boolean;
  onToggleAutoFollow: () => void;
  variant?: 'floating' | 'inline';
}

export function ReplayToolbar({
  controls,
  timeframe,
  autoFollow,
  onToggleAutoFollow,
  variant = 'floating',
}: ReplayToolbarProps) {
  const { state, togglePlay, nextCandle, previousCandle, skipBackward, skipForward, resetReplay, exitReplay, setSpeed, jumpToLive } =
    controls;

  const total = state.candles.length;
  const current = state.candles[state.currentReplayIndex];
  const atEnd = state.currentReplayIndex >= total - 1;
  const atStart = state.currentReplayIndex <= state.visibleStartIndex;
  const atReplayStart = state.currentReplayIndex === (state.replayStartIndex ?? 0);
  const revealedPct = total > 0 ? ((state.currentReplayIndex + 1) / total) * 100 : 0;
  const remaining = Math.max(0, total - state.currentReplayIndex - 1);

  const bar = (
    <div className="flex flex-col gap-2 rounded-md border border-bg-border bg-bg-panel/95 p-2 shadow-neo backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-text-secondary">
        <span className="flex items-center gap-1 rounded-sm border border-accent/60 bg-accent-dim px-1.5 py-0.5 font-semibold uppercase tracking-wider text-accent">
          <Zap size={10} /> Replay Mode
        </span>
        <span>
          Current:{' '}
          <span className="text-text-primary">
            {current ? formatCandleDate(current.time, timeframe) : '—'}
          </span>
        </span>
        <span>
          Candle:{' '}
          <span className="text-text-primary">
            {total > 0 ? state.currentReplayIndex + 1 : 0} / {total.toLocaleString()}
          </span>
        </span>
        <span>
          Revealed: <span className="text-text-primary">{revealedPct.toFixed(1)}%</span>
        </span>
        <span>
          Remaining: <span className="text-text-primary">{remaining.toLocaleString()}</span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <ToolButton label="Exit replay" onClick={exitReplay} tone="danger" title="Exit replay (Esc)">
          <X size={15} />
        </ToolButton>
        <ToolButton label="Reset replay" onClick={resetReplay} disabled={atReplayStart}>
          <RotateCcw size={15} />
        </ToolButton>
        <div className="mx-0.5 h-6 w-px bg-bg-border" aria-hidden="true" />
        <ToolButton label="Skip 10 candles backward" onClick={() => skipBackward(10)} disabled={atStart}>
          <Rewind size={15} />
        </ToolButton>
        <ToolButton label="Skip 5 candles backward" onClick={() => skipBackward(5)} disabled={atStart}>
          <ChevronLeft size={15} />
        </ToolButton>
        <ToolButton label="Previous candle" onClick={previousCandle} disabled={atStart}>
          <SkipBack size={15} />
        </ToolButton>
        <ToolButton label={state.isPlaying ? 'Pause' : 'Play'} onClick={togglePlay} disabled={atEnd} accent>
          {state.isPlaying ? <Pause size={15} /> : <Play size={15} />}
        </ToolButton>
        <ToolButton label="Next candle" onClick={nextCandle} disabled={atEnd}>
          <SkipForward size={15} />
        </ToolButton>
        <div className="mx-0.5 h-6 w-px bg-bg-border" aria-hidden="true" />
        <ToolButton label="Skip 5 candles forward" onClick={() => skipForward(5)} disabled={atEnd}>
          <ChevronsRight size={15} />
        </ToolButton>
        <ToolButton label="Skip 10 candles forward" onClick={() => skipForward(10)} disabled={atEnd}>
          <FastForward size={15} />
        </ToolButton>
        <div className="mx-0.5 h-6 w-px bg-bg-border" aria-hidden="true" />
        <ToolButton label="Go to latest revealed candle" onClick={jumpToLive}>
          <ChevronsRight size={15} />
        </ToolButton>
        <button
          onClick={onToggleAutoFollow}
          aria-pressed={autoFollow}
          className={`rounded-sm border px-2 py-1.5 text-[10px] font-semibold transition-colors ${
            autoFollow
              ? 'border-accent bg-accent-dim text-accent'
              : 'border-bg-border bg-bg-elevated text-text-secondary hover:bg-bg-hover'
          }`}
        >
          Auto Follow
        </button>
        <label className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-text-secondary">
          Speed
          <select
            value={state.speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="h-7 cursor-pointer rounded-sm border border-bg-border bg-bg-elevated px-1.5 font-mono text-[11px] font-semibold text-text-primary outline-none focus:border-accent"
            aria-label="Replay speed"
          >
            {REPLAY_SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}x
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );

  if (variant === 'floating') {
    return (
      <div className="pointer-events-none absolute inset-x-2 top-2 z-20">
        <div className="pointer-events-auto">{bar}</div>
      </div>
    );
  }
  return bar;
}

function ToolButton({
  children,
  onClick,
  label,
  disabled,
  accent = false,
  tone = 'default',
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  accent?: boolean;
  tone?: 'default' | 'danger';
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title ?? label}
      className={`flex h-8 min-w-8 items-center justify-center rounded-sm border px-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        accent
          ? 'border-accent bg-accent text-white hover:bg-accent-hover'
          : tone === 'danger'
            ? 'border-down/60 text-down hover:bg-down-dim'
            : 'border-bg-border bg-bg-elevated text-text-primary hover:bg-bg-hover'
      }`}
    >
      {children}
    </button>
  );
}
