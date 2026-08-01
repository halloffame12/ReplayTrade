import type { Candle } from '../types/market';
import type {
  ClosedTrade,
  Direction,
  OrderDraft,
  OrderPreview,
  Position,
  TradingState,
} from '../types/trading';

export function formatPrice(value: number, decimals?: number): string {
  if (decimals === undefined) {
    decimals = value >= 1000 ? 1 : value >= 100 ? 2 : 4;
  }
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatCurrency(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}$${abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function formatVolume(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
}

export function formatTime(ts: number, timeframe: string): string {
  const d = new Date(ts * 1000);
  if (timeframe === '1d') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function computePnl(direction: Direction, entry: number, current: number, quantity: number): number {
  if (direction === 'long') return (current - entry) * quantity;
  return (entry - current) * quantity;
}

export function returnPct(direction: Direction, entry: number, exit: number): number {
  if (direction === 'long') return ((exit - entry) / entry) * 100;
  return ((entry - exit) / entry) * 100;
}

export function orderPreview(order: OrderDraft): OrderPreview {
  const positionValue = order.entryPrice * order.quantity;
  let estimatedRisk = 0;
  let potentialReward = 0;
  if (order.direction === 'long') {
    if (order.stopLoss) estimatedRisk = (order.entryPrice - order.stopLoss) * order.quantity;
    if (order.takeProfit) potentialReward = (order.takeProfit - order.entryPrice) * order.quantity;
  } else {
    if (order.stopLoss) estimatedRisk = (order.stopLoss - order.entryPrice) * order.quantity;
    if (order.takeProfit) potentialReward = (order.entryPrice - order.takeProfit) * order.quantity;
  }
  const rr = potentialReward > 0 && estimatedRisk > 0 ? potentialReward / estimatedRisk : null;
  return { positionValue, estimatedRisk, potentialReward, riskRewardRatio: rr };
}

export function validateOrder(
  order: OrderDraft,
  availableBalance: number,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!(order.quantity > 0)) errors.push('Quantity must be greater than zero.');
  if (!(order.entryPrice > 0)) errors.push('Entry price must be positive.');

  if (order.direction === 'long') {
    if (order.stopLoss !== null && order.stopLoss !== undefined && order.stopLoss >= order.entryPrice) {
      errors.push('Stop-loss must be below the entry price for a long.');
    }
    if (
      order.takeProfit !== null &&
      order.takeProfit !== undefined &&
      order.takeProfit <= order.entryPrice
    ) {
      errors.push('Take-profit must be above the entry price for a long.');
    }
  } else {
    if (order.stopLoss !== null && order.stopLoss !== undefined && order.stopLoss <= order.entryPrice) {
      errors.push('Stop-loss must be above the entry price for a short.');
    }
    if (
      order.takeProfit !== null &&
      order.takeProfit !== undefined &&
      order.takeProfit >= order.entryPrice
    ) {
      errors.push('Take-profit must be below the entry price for a short.');
    }
  }

  if (order.quantity > 0 && order.entryPrice > 0 && order.quantity * order.entryPrice > availableBalance) {
    errors.push('Position value exceeds available balance.');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Position P&L at a given current price.
 */
export function positionPnl(position: Position, currentPrice: number): number {
  return computePnl(position.direction, position.entryPrice, currentPrice, position.remaining);
}

export function positionValue(position: Position, currentPrice: number): number {
  return position.remaining * currentPrice;
}

/**
 * Risk of a position at its entry (|entry - SL| * remaining).
 * Returns null when the position has no stop-loss.
 */
export function positionRisk(position: Position): number | null {
  if (position.stopLoss === null) return null;
  const risk = Math.abs(position.entryPrice - position.stopLoss) * position.remaining;
  return risk > 0 ? risk : null;
}

/** P&L expressed in units of R (risk multiple), null when there is no measurable risk. */
export function rMultiple(pnl: number, risk: number | null): number | null {
  if (risk === null || risk <= 0) return null;
  return pnl / risk;
}

export function equity(state: TradingState, currentPrice: number): number {
  let unrealized = 0;
  for (const p of state.positions) {
    unrealized += positionPnl(p, currentPrice);
  }
  return state.balance + unrealized;
}

export function availableBalance(state: TradingState): number {
  const used = state.positions.reduce((sum, p) => sum + p.remaining * p.entryPrice, 0);
  return state.balance - used;
}

/**
 * Process one new candle against open positions.
 * Deterministic rule when both SL and TP are hit on the same candle:
 * the stop-loss is always assumed to be triggered first.
 *
 * Returns the list of trades closed during this tick.
 */
export function processCandle(
  state: TradingState,
  candle: Candle,
): { state: TradingState; closedTrades: ClosedTrade[] } {
  let balance = state.balance;
  const remaining: Position[] = [];
  const closedTrades: ClosedTrade[] = [];

  for (const position of state.positions) {
    const hit = evaluatePosition(position, candle);
    if (hit) {
      const trade = closePosition(position, hit.exitPrice, hit.reason, candle.time);
      closedTrades.push(trade);
      balance += trade.pnl;
    } else {
      remaining.push(position);
    }
  }

  const nextState: TradingState = {
    ...state,
    balance,
    realizedPnl: balance - state.startingBalance,
    positions: remaining,
    history: [...state.history, ...closedTrades],
  };

  const equityNow = equity(nextState, candle.close);
  const peak = Math.max(nextState.peakEquity, equityNow);
  const dd = peak > 0 ? ((peak - equityNow) / peak) * 100 : 0;
  nextState.peakEquity = peak;
  nextState.maxDrawdown = Math.max(nextState.maxDrawdown, dd);

  return { state: nextState, closedTrades };
}

interface Hit {
  exitPrice: number;
  reason: 'stop-loss' | 'take-profit';
}

function evaluatePosition(position: Position, candle: Candle): Hit | null {
  if (position.direction === 'long') {
    const sl = position.stopLoss;
    const tp = position.takeProfit;
    // SL first (deterministic rule when both are hit).
    if (sl !== null && candle.low <= sl) return { exitPrice: sl, reason: 'stop-loss' };
    if (tp !== null && candle.high >= tp) return { exitPrice: tp, reason: 'take-profit' };
    return null;
  } else {
    const sl = position.stopLoss;
    const tp = position.takeProfit;
    if (sl !== null && candle.high >= sl) return { exitPrice: sl, reason: 'stop-loss' };
    if (tp !== null && candle.low <= tp) return { exitPrice: tp, reason: 'take-profit' };
    return null;
  }
}

export function closePosition(
  position: Position,
  exitPrice: number,
  reason: ClosedTrade['exitReason'],
  closedAt: number,
): ClosedTrade {
  const qty = position.remaining;
  const pnl = computePnl(position.direction, position.entryPrice, exitPrice, qty);
  const risk = positionRisk(position);
  return {
    id: `${position.id}-c-${closedAt}`,
    symbol: position.symbol,
    direction: position.direction,
    entryPrice: position.entryPrice,
    exitPrice,
    quantity: qty,
    pnl,
    returnPct: returnPct(position.direction, position.entryPrice, exitPrice),
    risk,
    rMultiple: rMultiple(pnl, risk),
    exitReason: reason,
    openedAt: position.openedAt,
    closedAt,
  };
}

export function computePerformance(history: ClosedTrade[]): {
  perf: TradeStats;
  totalPnl: number;
} {
  const wins = history.filter((t) => t.pnl > 0);
  const losses = history.filter((t) => t.pnl < 0);
  const totalPnl = history.reduce((s, t) => s + t.pnl, 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;

  let best = 0;
  let worst = 0;
  if (history.length) {
    best = Math.max(...history.map((t) => t.pnl));
    worst = Math.min(...history.map((t) => t.pnl));
  }

  const rValues = history
    .map((t) => t.rMultiple)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const avgR = rValues.length ? mean(rValues) : null;
  const totalR = rValues.length ? rValues.reduce((a, b) => a + b, 0) : null;

  return {
    perf: {
      totalTrades: history.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: history.length ? (wins.length / history.length) * 100 : 0,
      totalPnl,
      avgWin: wins.length ? grossWin / wins.length : 0,
      avgLoss: losses.length ? -grossLoss / losses.length : 0,
      bestTrade: best,
      worstTrade: worst,
      profitFactor: Number.isFinite(profitFactor) ? profitFactor : 0,
      maxDrawdown: 0,
      avgR,
      totalR,
    },
    totalPnl,
  };
}

export interface TradeStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  profitFactor: number;
  maxDrawdown: number;
  /** average P&L per trade in units of R, null when no trade had a stop-loss */
  avgR: number | null;
  /** sum of R multiples across all trades, null when no trade had a stop-loss */
  totalR: number | null;
}

export function combinePerformance(history: ClosedTrade[], maxDrawdown: number): TradeStats {
  const { perf } = computePerformance(history);
  return { ...perf, maxDrawdown };
}

/** Average of an array. */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
