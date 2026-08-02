import { History } from 'lucide-react';
import type { ClosedTrade } from '../types/trading';
import { formatCurrency, formatDateTime, formatPrice } from '../utils/tradingCalculations';

interface TradeHistoryProps {
  history: ClosedTrade[];
  decimals: number;
  maxRows?: number;
}

const REASON_LABEL: Record<ClosedTrade['exitReason'], string> = {
  manual: 'Manual',
  'stop-loss': 'Stop-loss',
  'take-profit': 'Take-profit',
  'replay-ended': 'Replay ended',
};

export function TradeHistory({ history, decimals, maxRows = 50 }: TradeHistoryProps) {
  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
        <History size={22} className="text-bg-border" />
        <p className="text-[12px] text-text-muted">No closed trades yet</p>
      </div>
    );
  }

  const rows = history.slice(-maxRows).reverse();

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse font-mono text-[11px]">
        <thead>
          <tr className="border-b border-bg-border text-left text-[10px] uppercase tracking-wider text-text-muted">
            <Th>#</Th>
            <Th>Symbol</Th>
            <Th>Dir</Th>
            <Th className="text-right">Entry</Th>
            <Th className="text-right">Exit</Th>
            <Th className="text-right">Qty</Th>
            <Th className="text-right">P&L</Th>
            <Th className="text-right">Ret</Th>
            <Th className="text-right">R</Th>
            <Th>Reason</Th>
            <Th>Closed</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => {
            const win = t.pnl >= 0;
            return (
              <tr key={t.id} className="border-b border-bg-border/50 transition-colors hover:bg-bg-hover/40">
                <Td className="text-text-muted">{history.length - i}</Td>
                <Td className="text-text-primary">{t.symbol}</Td>
                <Td>
                  <span
                    className={`rounded-sm px-1 py-px text-[10px] font-bold ${
                      t.direction === 'long' ? 'bg-up-dim text-up' : 'bg-down-dim text-down'
                    }`}
                  >
                    {t.direction === 'long' ? 'L' : 'S'}
                  </span>
                </Td>
                <Td className="text-right text-text-primary">{formatPrice(t.entryPrice, decimals)}</Td>
                <Td className="text-right text-text-primary">{formatPrice(t.exitPrice, decimals)}</Td>
                <Td className="text-right text-text-secondary">{t.quantity}</Td>
                <Td className={`text-right font-bold ${win ? 'text-up' : 'text-down'}`}>
                  {formatCurrency(t.pnl)}
                </Td>
                <Td className={`text-right ${win ? 'text-up' : 'text-down'}`}>
                  {t.returnPct >= 0 ? '+' : ''}
                  {t.returnPct.toFixed(2)}%
                </Td>
                <Td className={`text-right ${win ? 'text-up' : 'text-down'}`}>
                  {t.rMultiple !== null ? `${t.rMultiple >= 0 ? '+' : ''}${t.rMultiple.toFixed(2)}R` : '—'}
                </Td>
                <Td className="text-text-secondary">
                  <span className="rounded-sm border border-bg-border px-1 py-px text-[10px]">
                    {REASON_LABEL[t.exitReason]}
                  </span>
                </Td>
                <Td className="text-text-muted">{formatDateTime(t.closedAt)}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <th className={`px-2.5 py-2 font-semibold ${className}`}>{children}</th>;
}

function Td({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-2.5 py-2 ${className}`}>{children}</td>;
}
