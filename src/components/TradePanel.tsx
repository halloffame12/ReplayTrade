import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Direction } from '../types/trading';
import type { OrderDraft } from '../types/trading';
import { formatCurrency, formatPrice, orderPreview, validateOrder } from '../utils/tradingCalculations';

interface TradePanelProps {
  symbol: string;
  currentPrice: number;
  availableBalance: number;
  decimals: number;
  disabled?: boolean;
  onPlaceOrder: (draft: OrderDraft) => { ok: boolean; errors: string[] };
}

function parseNum(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export function TradePanel({
  symbol,
  currentPrice,
  availableBalance,
  decimals,
  disabled = false,
  onPlaceOrder,
}: TradePanelProps) {
  const [direction, setDirection] = useState<Direction>('long');
  const [quantityStr, setQuantityStr] = useState('1');
  const [entryStr, setEntryStr] = useState('');
  const [slStr, setSlStr] = useState('');
  const [tpStr, setTpStr] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Once the user edits the entry price, stop auto-following the live price so
  // replay ticks never overwrite what they typed.
  const entryTouched = useRef(false);
  useEffect(() => {
    entryTouched.current = false;
  }, [symbol]);

  useEffect(() => {
    if (entryTouched.current) return;
    if (currentPrice > 0) {
      setEntryStr(currentPrice.toFixed(decimals));
    }
  }, [currentPrice, decimals]);

  const draft: OrderDraft = useMemo(() => {
    const quantity = parseNum(quantityStr);
    const entry = parseNum(entryStr);
    const sl = parseNum(slStr);
    const tp = parseNum(tpStr);
    return {
      direction,
      quantity: quantity === null || Number.isNaN(quantity) ? 0 : quantity,
      entryPrice: entry === null || Number.isNaN(entry) ? 0 : entry,
      stopLoss: sl === null || Number.isNaN(sl) ? null : sl,
      takeProfit: tp === null || Number.isNaN(tp) ? null : tp,
    };
  }, [direction, quantityStr, entryStr, slStr, tpStr]);

  const preview = useMemo(() => orderPreview(draft), [draft]);
  const validation = useMemo(() => validateOrder(draft, availableBalance), [draft, availableBalance]);

  const submit = () => {
    setSubmitted(true);
    if (!validation.valid) return;
    setConfirmOpen(true);
  };

  const confirmPlace = () => {
    const result = onPlaceOrder(draft);
    if (result.ok) {
      setConfirmOpen(false);
      setSubmitted(false);
    }
  };

  const canSubmit = draft.quantity > 0 && draft.entryPrice > 0;

  const applySlPct = (pct: number) => {
    const e = parseNum(entryStr);
    if (e === null || Number.isNaN(e) || e <= 0) return;
    const sl = direction === 'long' ? e * (1 - pct) : e * (1 + pct);
    setSlStr(sl.toFixed(decimals));
  };

  const applyTpPct = (pct: number) => {
    const e = parseNum(entryStr);
    if (e === null || Number.isNaN(e) || e <= 0) return;
    const tp = direction === 'long' ? e * (1 + pct) : e * (1 - pct);
    setTpStr(tp.toFixed(decimals));
  };

  const applyTpRatio = (ratio: number) => {
    const e = parseNum(entryStr);
    const s = parseNum(slStr);
    if (e === null || Number.isNaN(e) || e <= 0) return;
    if (s === null || Number.isNaN(s) || s <= 0) return;
    const dist = Math.abs(e - s);
    if (dist <= 0) return;
    const tp = direction === 'long' ? e + dist * ratio : e - dist * ratio;
    setTpStr(tp.toFixed(decimals));
  };

  const applyRiskQty = (riskPct: number) => {
    const e = parseNum(entryStr);
    const s = parseNum(slStr);
    if (e === null || Number.isNaN(e) || e <= 0) return;
    if (s === null || Number.isNaN(s) || s <= 0) return;
    const dist = Math.abs(e - s);
    if (dist <= 0) return;
    const qty = (availableBalance * (riskPct / 100)) / dist;
    setQuantityStr(qty.toFixed(4));
  };

  const inputCls = (invalid: boolean) =>
    `w-full rounded-sm border bg-bg-panel px-2.5 py-1.5 font-mono text-[12px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent ${
      invalid ? 'border-down/60' : 'border-bg-border'
    }`;

  const labelCls = 'mb-1 block text-[10px] font-semibold uppercase tracking-wider text-text-muted';

  const slInvalid =
    submitted &&
    ((direction === 'long' && draft.stopLoss !== null && draft.stopLoss >= draft.entryPrice) ||
      (direction === 'short' && draft.stopLoss !== null && draft.stopLoss <= draft.entryPrice));
  const tpInvalid =
    submitted &&
    ((direction === 'long' && draft.takeProfit !== null && draft.takeProfit <= draft.entryPrice) ||
      (direction === 'short' && draft.takeProfit !== null && draft.takeProfit >= draft.entryPrice));

  return (
    <div className="flex flex-col gap-3">
      <div
        className="grid grid-cols-2 gap-1 rounded-sm border border-bg-border bg-bg-panel p-1"
        role="tablist"
        aria-label="Order direction"
      >
        <button
          role="tab"
          aria-selected={direction === 'long'}
          onClick={() => setDirection('long')}
          className={`rounded-sm px-3 py-2 text-[12px] font-bold transition-colors ${
            direction === 'long' ? 'bg-up text-white' : 'text-text-secondary hover:bg-bg-hover'
          }`}
        >
          Buy / Long
        </button>
        <button
          role="tab"
          aria-selected={direction === 'short'}
          onClick={() => setDirection('short')}
          className={`rounded-sm px-3 py-2 text-[12px] font-bold transition-colors ${
            direction === 'short' ? 'bg-down text-white' : 'text-text-secondary hover:bg-bg-hover'
          }`}
        >
          Sell / Short
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        <div>
          <label htmlFor="tp-qty" className={labelCls}>
            Quantity
          </label>
          <input
            id="tp-qty"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={quantityStr}
            onChange={(e) => setQuantityStr(e.target.value)}
            className={inputCls(submitted && draft.quantity <= 0)}
            placeholder="0.0"
            aria-label="Quantity"
          />
        </div>
        <div>
          <label htmlFor="tp-entry" className={labelCls}>
            Entry price
          </label>
          <input
            id="tp-entry"
            type="number"
            inputMode="decimal"
            step="any"
            value={entryStr}
            onChange={(e) => {
              entryTouched.current = true;
              setEntryStr(e.target.value);
            }}
            className={inputCls(submitted && draft.entryPrice <= 0)}
            aria-label="Entry price"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="tp-sl" className={labelCls}>
              Stop-loss
            </label>
            <input
              id="tp-sl"
              type="number"
              inputMode="decimal"
              step="any"
              value={slStr}
              onChange={(e) => setSlStr(e.target.value)}
              className={inputCls(slInvalid)}
              placeholder="Optional"
              aria-label="Stop loss"
            />
          </div>
          <div>
            <label htmlFor="tp-tp" className={labelCls}>
              Take-profit
            </label>
            <input
              id="tp-tp"
              type="number"
              inputMode="decimal"
              step="any"
              value={tpStr}
              onChange={(e) => setTpStr(e.target.value)}
              className={inputCls(tpInvalid)}
              placeholder="Optional"
              aria-label="Take profit"
            />
          </div>
        </div>

        <div>
          <div className={labelCls}>Risk tools</div>
          <div className="flex flex-wrap gap-1">
            <QuickBtn onClick={() => applySlPct(0.01)} disabled={disabled}>
              SL 1%
            </QuickBtn>
            <QuickBtn onClick={() => applyTpPct(0.02)} disabled={disabled}>
              TP 2%
            </QuickBtn>
            <QuickBtn onClick={() => applyTpPct(0.03)} disabled={disabled}>
              TP 3%
            </QuickBtn>
            <QuickBtn onClick={() => applyTpRatio(2)} disabled={disabled || draft.stopLoss === null}>
              1 : 2
            </QuickBtn>
            <QuickBtn onClick={() => applyTpRatio(3)} disabled={disabled || draft.stopLoss === null}>
              1 : 3
            </QuickBtn>
            <QuickBtn onClick={() => applyRiskQty(1)} disabled={disabled || draft.stopLoss === null}>
              Qty = 1% risk
            </QuickBtn>
          </div>
        </div>
      </div>

      <div className="rounded-sm border border-bg-border bg-bg-panel p-2.5 font-mono text-[11px]">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Order preview
        </div>
        <dl className="space-y-1">
          <Row label="Position value" value={formatCurrency(preview.positionValue)} />
          <Row
            label="Est. risk"
            value={formatCurrency(preview.estimatedRisk)}
            tone={preview.estimatedRisk > 0 ? 'down' : undefined}
          />
          <Row
            label="Potential reward"
            value={formatCurrency(preview.potentialReward)}
            tone={preview.potentialReward > 0 ? 'up' : undefined}
          />
          <Row
            label="Risk : Reward"
            value={preview.riskRewardRatio !== null ? `1 : ${preview.riskRewardRatio.toFixed(2)}` : '—'}
          />
          <Row
            label="Risk of balance"
            value={
              availableBalance > 0 && preview.estimatedRisk > 0
                ? `${((preview.estimatedRisk / availableBalance) * 100).toFixed(2)}%`
                : '—'
            }
          />
        </dl>
      </div>

      {submitted && !validation.valid && (
        <ul className="rounded-sm border border-down/50 bg-down-dim px-2.5 py-2 text-[11px] text-down">
          {validation.errors.map((e) => (
            <li key={e}>• {e}</li>
          ))}
        </ul>
      )}

      <button
        onClick={submit}
        disabled={disabled || !canSubmit}
        className={`rounded-sm px-3 py-2.5 text-[12px] font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          direction === 'long' ? 'bg-up hover:bg-emerald-600' : 'bg-down hover:bg-red-600'
        }`}
      >
        {direction === 'long' ? 'Place Buy Order' : 'Place Sell Order'}
      </button>

      <p className="text-center text-[10px] text-text-muted">
        Available: {formatCurrency(availableBalance)}
      </p>

      {confirmOpen && (
        <ConfirmModal
          symbol={symbol}
          draft={draft}
          decimals={decimals}
          onConfirm={confirmPlace}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}

function QuickBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-sm border border-bg-border px-1.5 py-1 text-[10px] font-semibold text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-text-muted">{label}</dt>
      <dd className={tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-text-primary'}>
        {value}
      </dd>
    </div>
  );
}

function ConfirmModal({
  symbol,
  draft,
  decimals,
  onConfirm,
  onCancel,
}: {
  symbol: string;
  draft: OrderDraft;
  decimals: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const preview = orderPreview(draft);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-order-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded-md border border-bg-border bg-bg-panel shadow-neo animate-fade-in">
        <div className="flex items-center justify-between border-b border-bg-border px-4 py-3">
          <h2 id="confirm-order-title" className="text-[13px] font-bold text-text-primary">
            Confirm {draft.direction === 'long' ? 'Buy' : 'Sell'} Order
          </h2>
          <button onClick={onCancel} aria-label="Close" className="text-text-muted hover:text-text-primary">
            <X size={16} />
          </button>
        </div>
        <div className="px-4 py-3 font-mono text-[12px]">
          <div className="flex items-center justify-between rounded-sm bg-bg-elevated px-3 py-2">
            <span className="text-text-secondary">{symbol}</span>
            <span className={`font-bold ${draft.direction === 'long' ? 'text-up' : 'text-down'}`}>
              {draft.direction === 'long' ? 'BUY / LONG' : 'SELL / SHORT'}
            </span>
          </div>
          <dl className="mt-3 space-y-1.5">
            <ConfirmRow label="Quantity" value={String(draft.quantity)} />
            <ConfirmRow label="Entry price" value={formatPrice(draft.entryPrice, decimals)} />
            <ConfirmRow
              label="Stop-loss"
              value={draft.stopLoss !== null ? formatPrice(draft.stopLoss, decimals) : '—'}
            />
            <ConfirmRow
              label="Take-profit"
              value={draft.takeProfit !== null ? formatPrice(draft.takeProfit, decimals) : '—'}
            />
            <ConfirmRow label="Position value" value={formatCurrency(preview.positionValue)} />
            <ConfirmRow label="Est. risk" value={formatCurrency(preview.estimatedRisk)} />
            <ConfirmRow
              label="Risk : Reward"
              value={preview.riskRewardRatio !== null ? `1 : ${preview.riskRewardRatio.toFixed(2)}` : '—'}
            />
          </dl>
          <p className="mt-3 text-[10px] text-text-muted">
            Simulated order only. No real money involved.
          </p>
        </div>
        <div className="flex gap-2 border-t border-bg-border px-4 py-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-sm border border-bg-border px-3 py-2 text-[12px] font-semibold text-text-secondary hover:bg-bg-hover"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className={`flex-1 rounded-sm px-3 py-2 text-[12px] font-bold text-white ${
              draft.direction === 'long' ? 'bg-up hover:bg-emerald-600' : 'bg-down hover:bg-red-600'
            }`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-text-primary">{value}</dd>
    </div>
  );
}
