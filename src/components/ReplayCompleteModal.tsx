import { X } from 'lucide-react';
import type { TradeStats } from '../utils/tradingCalculations';
import { formatCurrency, formatPct } from '../utils/tradingCalculations';

interface ReplayCompleteModalProps {
  perf: TradeStats;
  startingBalance: number;
  finalBalance: number;
  totalPnl: number;
  trades: number;
  onReplayAgain: () => void;
  onChooseAnotherStart: () => void;
  onCreateNewSession: () => void;
  onClose: () => void;
}

export function ReplayCompleteModal({
  perf,
  startingBalance,
  finalBalance,
  totalPnl,
  trades,
  onReplayAgain,
  onChooseAnotherStart,
  onCreateNewSession,
  onClose,
}: ReplayCompleteModalProps) {
  const returnPct = startingBalance > 0 ? (totalPnl / startingBalance) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="replay-complete-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="my-6 w-full max-w-md rounded-md border border-bg-border bg-bg-panel shadow-neo animate-fade-in">
        <div className="flex items-center justify-between border-b border-bg-border px-4 py-3">
          <div>
            <h2 id="replay-complete-title" className="text-[14px] font-bold text-text-primary">
              Replay Complete
            </h2>
            <p className="text-[10px] text-text-muted">End of the revealed candle history.</p>
          </div>
          <button onClick={onClose} aria-label="Close dialog" className="text-text-muted hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-4">
          <div className="flex items-center justify-between rounded-sm bg-bg-elevated px-4 py-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted">Total P&L</div>
              <div className={`font-mono text-[22px] font-bold ${totalPnl >= 0 ? 'text-up' : 'text-down'}`}>
                {formatCurrency(totalPnl)}
              </div>
              <div className={`font-mono text-[11px] ${totalPnl >= 0 ? 'text-up' : 'text-down'}`}>
                {formatPct(returnPct)} return
              </div>
            </div>
            <div className="text-right font-mono text-[12px] text-text-secondary">
              <div>
                Final balance: <span className="text-text-primary">{formatCurrency(finalBalance)}</span>
              </div>
              <div>
                Starting: <span className="text-text-primary">{formatCurrency(startingBalance)}</span>
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[11px]">
            <MiniStat label="Trades" value={String(trades)} />
            <MiniStat label="Win rate" value={formatPct(perf.winRate)} />
            <MiniStat label="Profit factor" value={perf.profitFactor === Infinity ? '∞' : perf.profitFactor.toFixed(2)} />
            <MiniStat label="Avg win" value={formatCurrency(perf.avgWin)} />
            <MiniStat label="Avg loss" value={formatCurrency(perf.avgLoss)} />
            <MiniStat label="Max drawdown" value={formatPct(-perf.maxDrawdown)} />
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-bg-border px-4 py-3">
          <button
            onClick={onReplayAgain}
            autoFocus
            className="rounded-sm bg-accent px-3 py-2 text-[12px] font-bold text-white transition-colors hover:bg-accent-hover"
          >
            Replay Again
          </button>
          <div className="flex gap-2">
            <button
              onClick={onChooseAnotherStart}
              className="flex-1 rounded-sm border border-bg-border px-3 py-2 text-[12px] font-semibold text-text-secondary hover:bg-bg-hover"
            >
              Choose Another Start
            </button>
            <button
              onClick={onCreateNewSession}
              className="flex-1 rounded-sm border border-bg-border px-3 py-2 text-[12px] font-semibold text-text-secondary hover:bg-bg-hover"
            >
              Create New Session
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-bg-border bg-bg-elevated px-2 py-1.5 text-center">
      <div className="text-[9px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className="text-[12px] font-bold text-text-primary">{value}</div>
    </div>
  );
}
