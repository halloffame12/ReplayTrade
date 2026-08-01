import { BarChart3 } from 'lucide-react';
import type { TradeStats } from '../utils/tradingCalculations';
import { formatCurrency, formatPct } from '../utils/tradingCalculations';

interface StatisticsPanelProps {
  perf: TradeStats;
  equitySeries: number[];
  startingBalance: number;
  realizedPnl: number;
  unrealizedPnl: number;
  currentEquity: number;
}

export function StatisticsPanel({
  perf,
  equitySeries,
  startingBalance,
  realizedPnl,
  unrealizedPnl,
  currentEquity,
}: StatisticsPanelProps) {
  if (perf.totalTrades === 0 && equitySeries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
        <BarChart3 size={22} className="text-bg-border" />
        <p className="text-[12px] text-text-muted">No statistics yet</p>
        <p className="text-[10px] text-text-muted">Close trades to build up your stats.</p>
      </div>
    );
  }

  const netPnl = realizedPnl + unrealizedPnl;
  const returnPct = startingBalance > 0 ? (netPnl / startingBalance) * 100 : 0;

  const fmtR = (v: number | null) => (v !== null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}R` : '—');

  const stat = (label: string, value: string, tone?: 'up' | 'down') => (
    <div className="flex flex-col gap-0.5 rounded-sm border border-bg-border bg-bg-panel px-2.5 py-2">
      <span className="text-[10px] uppercase tracking-wider text-text-muted">{label}</span>
      <span
        className={`font-mono text-[12px] font-bold ${
          tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-text-primary'
        }`}
      >
        {value}
      </span>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stat('Total trades', String(perf.totalTrades))}
        {stat('Win rate', formatPct(perf.winRate))}
        {stat('Net P&L', formatCurrency(netPnl), netPnl >= 0 ? 'up' : 'down')}
        {stat('Return', formatPct(returnPct), returnPct >= 0 ? 'up' : 'down')}
      </div>

      {/* Equity curve */}
      <div className="rounded-sm border border-bg-border bg-bg-panel p-2.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Equity curve
          </span>
          <span className="font-mono text-[11px] text-text-secondary">
            {formatCurrency(currentEquity)}
          </span>
        </div>
        <EquityChart series={equitySeries} />
      </div>

      {/* Detail grid */}
      <div className="grid grid-cols-2 gap-2 font-mono text-[11px] sm:grid-cols-3">
        {stat('Winning trades', String(perf.winningTrades), 'up')}
        {stat('Losing trades', String(perf.losingTrades), 'down')}
        {stat('Average win', formatCurrency(perf.avgWin), 'up')}
        {stat('Average loss', formatCurrency(perf.avgLoss), 'down')}
        {stat('Best trade', formatCurrency(perf.bestTrade), 'up')}
        {stat('Worst trade', formatCurrency(perf.worstTrade), 'down')}
        {stat('Profit factor', perf.profitFactor === Infinity ? '∞' : perf.profitFactor.toFixed(2))}
        {stat('Max drawdown', formatPct(-perf.maxDrawdown), 'down')}
        {stat('Avg R / trade', fmtR(perf.avgR), perf.avgR !== null ? (perf.avgR >= 0 ? 'up' : 'down') : undefined)}
        {stat('Total R', fmtR(perf.totalR), perf.totalR !== null ? (perf.totalR >= 0 ? 'up' : 'down') : undefined)}
        {stat('Realized P&L', formatCurrency(realizedPnl), realizedPnl >= 0 ? 'up' : 'down')}
      </div>
    </div>
  );
}

export function EquityChart({ series }: { series: number[] }) {
  if (series.length < 2) {
    return (
      <div className="flex h-24 items-center justify-center font-mono text-[10px] text-text-muted">
        Not enough data
      </div>
    );
  }
  const width = 100;
  const height = 40;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const pad = 2;

  const points = series
    .map((v, i) => {
      const x = pad + (i / (series.length - 1)) * (width - pad * 2);
      const y = height - pad - ((v - min) / span) * (height - pad * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const lastY = height - pad - ((series[series.length - 1] - min) / span) * (height - pad * 2);
  const positive = series[series.length - 1] >= series[0];
  const color = positive ? '#22c55e' : '#ef4444';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-24 w-full"
      role="img"
      aria-label="Equity curve"
    >
      <defs>
        <linearGradient id="eqgrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon
        points={`${pad},${height} ${points} ${width - pad},${height}`}
        fill="url(#eqgrad)"
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="0.8"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={width - pad} cy={lastY} r="1.4" fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
