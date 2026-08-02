import { Crosshair } from 'lucide-react';
import type { Position } from '../types/trading';
import {
  formatCurrency,
  formatPrice,
  positionPnl,
  positionRisk,
  positionValue,
  rMultiple,
} from '../utils/tradingCalculations';

interface PositionsPanelProps {
  positions: Position[];
  currentPrice: number;
  decimals: number;
  onClose: (id: string) => void;
  onCloseHalf: (id: string) => void;
  onMoveStop: (id: string) => void;
}

export function PositionsPanel({
  positions,
  currentPrice,
  decimals,
  onClose,
  onCloseHalf,
  onMoveStop,
}: PositionsPanelProps) {
  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
        <Crosshair size={22} className="text-bg-border" />
        <p className="text-[12px] text-text-muted">No open positions</p>
        <p className="text-[10px] text-text-muted">Place a simulated trade from the order panel.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-bg-border">
      {positions.map((p) => {
        const pnl = positionPnl(p, currentPrice);
        const value = positionValue(p, currentPrice);
        const pnlPct = ((pnl / (p.entryPrice * p.remaining)) * 100) || 0;
        const risk = positionRisk(p);
        const r = rMultiple(pnl, risk);
        return (
          <div key={p.id} className="px-3 py-2.5 font-mono text-[11px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-text-secondary">{p.symbol}</span>
                <span
                  className={`rounded-sm px-1.5 py-px text-[10px] font-bold ${
                    p.direction === 'long' ? 'bg-up-dim text-up' : 'bg-down-dim text-down'
                  }`}
                >
                  {p.direction === 'long' ? 'LONG' : 'SHORT'}
                </span>
                {p.quantity !== p.remaining && (
                  <span className="text-[10px] text-text-muted">{p.remaining} left</span>
                )}
              </div>
              <div className={pnl >= 0 ? 'text-up' : 'text-down'}>
                <span className="font-bold">{formatCurrency(pnl)}</span>{' '}
                <span className="text-[10px]">({pnlPct >= 0 ? '+' : ''}
                  {pnlPct.toFixed(2)}%)</span>
              </div>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
              <Meta label="Entry" value={formatPrice(p.entryPrice, decimals)} />
              <Meta label="Mark" value={formatPrice(currentPrice, decimals)} />
              <Meta label="Qty" value={String(p.remaining)} />
              <Meta label="Value" value={formatCurrency(value)} />
              <Meta
                label="Stop"
                value={p.stopLoss !== null ? formatPrice(p.stopLoss, decimals) : '—'}
              />
              <Meta
                label="Take-profit"
                value={p.takeProfit !== null ? formatPrice(p.takeProfit, decimals) : '—'}
              />
              <Meta label="Risk" value={risk !== null ? formatCurrency(risk) : '—'} />
              <Meta
                label="R"
                value={r !== null ? `${r >= 0 ? '+' : ''}${r.toFixed(2)}R` : '—'}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <ActionBtn onClick={() => onClose(p.id)} tone="danger">
                Close Position
              </ActionBtn>
              <ActionBtn onClick={() => onCloseHalf(p.id)}>Close 50%</ActionBtn>
              <ActionBtn onClick={() => onMoveStop(p.id)}>Move SL → Entry</ActionBtn>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-text-muted">{label}</span>
      <span className="text-text-primary">{value}</span>
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: 'danger' | 'default';
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-sm border px-2 py-1 text-[10px] font-semibold transition-colors ${
        tone === 'danger'
          ? 'border-down/60 text-down hover:bg-down-dim'
          : 'border-bg-border text-text-secondary hover:bg-bg-hover hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}
