import { Check, X } from 'lucide-react';
import type { Candle } from '../types/market';
import type { Timeframe } from '../types/market';
import { formatCandleDate } from '../utils/candleUtils';
import { formatPrice } from '../utils/tradingCalculations';

interface ReplayStartSelectorProps {
  candles: Candle[];
  selectedIndex: number | null;
  timeframe: Timeframe;
  decimals: number;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Shown while the user is choosing where to start the replay.
 * Displays the currently selected candle and lets the user confirm.
 */
export function ReplayStartSelector({
  candles,
  selectedIndex,
  timeframe,
  decimals,
  onCancel,
  onConfirm,
}: ReplayStartSelectorProps) {
  const selected =
    selectedIndex !== null && selectedIndex >= 0 && selectedIndex < candles.length
      ? candles[selectedIndex]
      : null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-14 z-20 flex justify-center">
      <div className="pointer-events-auto w-full max-w-sm rounded-md border border-bg-border bg-bg-panel/95 p-3 shadow-neo backdrop-blur-sm animate-fade-in">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-sm border border-accent/60 bg-accent-dim px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
            Replay begins here
          </span>
          {!selected && (
            <span className="text-[11px] text-text-secondary">
              Hover a candle and click to choose the start point.
            </span>
          )}
        </div>

        {selected ? (
          <>
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="text-text-muted">Date</span>
              <span className="text-text-primary">{formatCandleDate(selected.time, timeframe)}</span>
            </div>
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="text-text-muted">Price</span>
              <span className="text-text-primary">{formatPrice(selected.close, decimals)}</span>
            </div>
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="text-text-muted">Candle</span>
              <span className="text-text-primary">
                {selectedIndex !== null ? selectedIndex + 1 : 0} / {candles.length.toLocaleString()}
              </span>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={onCancel}
                className="flex flex-1 items-center justify-center gap-1 rounded-sm border border-bg-border px-3 py-2 text-[12px] font-semibold text-text-secondary hover:bg-bg-hover"
              >
                <X size={14} /> Cancel
              </button>
              <button
                onClick={onConfirm}
                autoFocus
                className="flex flex-1 items-center justify-center gap-1 rounded-sm bg-accent px-3 py-2 text-[12px] font-bold text-white hover:bg-accent-hover"
              >
                <Check size={14} /> Start Replay
              </button>
            </div>
          </>
        ) : (
          <div className="rounded-sm border border-bg-border bg-bg-elevated px-3 py-2 text-center font-mono text-[11px] text-text-secondary">
            Click any candle on the chart to begin selection
          </div>
        )}
      </div>
    </div>
  );
}
