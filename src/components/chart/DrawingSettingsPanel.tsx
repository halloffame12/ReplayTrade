import { BringToFront, Copy, Eye, EyeOff, Layers, Lock, LockOpen, SendToBack, Trash2, X } from 'lucide-react';
import { PALETTE, STYLE_PRESETS, TOOL_LABELS } from '../../drawing';
import type { Drawing, DrawingStyle, PresetId } from '../../drawing';
import { formatPrice } from '../../utils/tradingCalculations';

const FILLABLE_TYPES = new Set(['rectangle', 'circle', 'ellipse', 'triangle', 'polygon', 'longPosition', 'shortPosition', 'riskReward']);

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  'h-7 w-full rounded-sm border border-bg-border bg-bg-elevated px-2 text-[11px] text-text-primary outline-none focus:border-accent';

function ActionBtn({
  title,
  danger = false,
  disabled,
  onClick,
  className = '',
  children,
}: {
  title: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-7 items-center justify-center gap-1 rounded-sm border px-2 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${className} ${
        danger
          ? 'border-down/60 bg-down-dim text-down hover:bg-down hover:text-white'
          : 'border-bg-border bg-bg-elevated text-text-secondary hover:bg-bg-hover hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}

export interface DrawingSettingsPanelProps {
  drawing: Drawing;
  decimals: number;
  onUpdateStyle: (partial: Partial<DrawingStyle>) => void;
  onApplyPreset: (p: PresetId) => void;
  onSetText: (text: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onLock: () => void;
  onHide: () => void;
  onLayer: (dir: 'front' | 'back' | 'forward' | 'backward') => void;
  onClose: () => void;
}

export function DrawingSettingsPanel({
  drawing,
  decimals,
  onUpdateStyle,
  onApplyPreset,
  onSetText,
  onDuplicate,
  onDelete,
  onLock,
  onHide,
  onLayer,
  onClose,
}: DrawingSettingsPanelProps) {
  const s = drawing.style;
  const isText = drawing.type === 'text';
  const isFillable = FILLABLE_TYPES.has(drawing.type);
  const anchor = drawing.points[0];

  return (
    <div
      className="flex w-56 flex-col gap-2.5 rounded-md border border-bg-border bg-bg-panel/95 p-3 shadow-neo backdrop-blur-sm"
      onPointerDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-label={`${TOOL_LABELS[drawing.type]} settings`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-text-primary">
          {TOOL_LABELS[drawing.type]}
        </span>
        <button type="button" onClick={onClose} aria-label="Close settings" className="text-text-muted hover:text-text-primary">
          <X size={14} />
        </button>
      </div>

      {/* Style presets */}
      <div className="flex flex-wrap gap-1">
        {(Object.keys(STYLE_PRESETS) as PresetId[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onApplyPreset(p)}
            title={`Preset: ${p}`}
            aria-label={`Apply ${p} preset`}
            className="flex h-5 items-center rounded-sm border border-bg-border bg-bg-elevated px-1.5 text-[9px] uppercase tracking-wide text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            style={{ borderLeftWidth: 3, borderLeftColor: STYLE_PRESETS[p].strokeColor }}
          >
            {p}
          </button>
        ))}
      </div>

      {isText && (
        <Field label="Text">
          <textarea
            value={drawing.text ?? ''}
            onChange={(e) => onSetText(e.target.value)}
            rows={2}
            className={`${inputCls} h-auto py-1`}
            placeholder="Type annotation…"
          />
        </Field>
      )}

      {/* Colors */}
      <Field label="Color">
        <div className="flex items-center gap-1">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              aria-label={`Color ${c}`}
              onClick={() => onUpdateStyle({ strokeColor: c, fillColor: c })}
              className="h-5 w-5 rounded-sm border border-black/40 transition-transform hover:scale-110"
              style={{
                backgroundColor: c,
                boxShadow:
                  s.strokeColor === c ? '0 0 0 2px rgba(255,255,255,0.85), 0 0 0 4px rgba(0,0,0,0.4)' : undefined,
              }}
            />
          ))}
          <input
            type="color"
            title="Custom color"
            aria-label="Custom color"
            value={s.strokeColor}
            onChange={(e) => onUpdateStyle({ strokeColor: e.target.value, fillColor: e.target.value })}
            className="h-5 w-6 cursor-pointer rounded-sm border border-bg-border bg-transparent p-0"
          />
        </div>
      </Field>

      {!isText && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Width">
              <input
                type="number"
                min={1}
                max={6}
                step={0.5}
                value={s.strokeWidth}
                onChange={(e) => onUpdateStyle({ strokeWidth: Math.max(1, Math.min(6, Number(e.target.value) || 1)) })}
                className={inputCls}
              />
            </Field>
            <Field label="Line">
              <select
                value={s.strokeStyle}
                onChange={(e) => onUpdateStyle({ strokeStyle: e.target.value as DrawingStyle['strokeStyle'] })}
                className={inputCls}
              >
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </Field>
          </div>
          {isFillable && (
            <Field label={`Fill opacity — ${Math.round(s.fillOpacity * 100)}%`}>
              <input
                type="range"
                min={0}
                max={50}
                step={1}
                value={Math.round(s.fillOpacity * 100)}
                onChange={(e) => onUpdateStyle({ fillOpacity: Number(e.target.value) / 100 })}
                className="h-2 w-full accent-[#4f8cff]"
              />
            </Field>
          )}
        </>
      )}

      {isText && (
        <Field label="Font size">
          <input
            type="number"
            min={10}
            max={40}
            value={s.fontSize}
            onChange={(e) => onUpdateStyle({ fontSize: Math.max(10, Math.min(40, Number(e.target.value) || 11)) })}
            className={inputCls}
          />
        </Field>
      )}

      {/* Coordinates */}
      {anchor && (
        <div className="rounded-sm border border-bg-border bg-bg-elevated px-2 py-1.5 font-mono text-[10px] text-text-secondary">
          <div className="flex justify-between">
            <span className="text-text-muted">Price</span>
            <span className="text-text-primary">{formatPrice(anchor.price, decimals)}</span>
          </div>
          <div className="mt-0.5 flex justify-between">
            <span className="text-text-muted">Time</span>
            <span className="text-text-primary">{new Date(anchor.time * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-1.5">
        <ActionBtn title="Duplicate drawing" onClick={onDuplicate}>
          <Copy size={12} /> Duplicate
        </ActionBtn>
        <ActionBtn title={drawing.locked ? 'Unlock drawing' : 'Lock drawing'} onClick={onLock}>
          {drawing.locked ? <LockOpen size={12} /> : <Lock size={12} />} {drawing.locked ? 'Unlock' : 'Lock'}
        </ActionBtn>
        <ActionBtn title={drawing.visible ? 'Hide drawing' : 'Show drawing'} onClick={onHide}>
          {drawing.visible ? <EyeOff size={12} /> : <Eye size={12} />} {drawing.visible ? 'Hide' : 'Show'}
        </ActionBtn>
        <ActionBtn title="Bring to front" onClick={() => onLayer('front')}>
          <BringToFront size={12} /> Front
        </ActionBtn>
        <ActionBtn title="Send to back" onClick={() => onLayer('back')}>
          <SendToBack size={12} /> Back
        </ActionBtn>
        <ActionBtn title="Move up / down one layer" onClick={() => onLayer('forward')}>
          <Layers size={12} /> Layer
        </ActionBtn>
        <ActionBtn title="Delete drawing" danger onClick={onDelete} className="col-span-2">
          <Trash2 size={12} /> Delete
        </ActionBtn>
      </div>
    </div>
  );
}
