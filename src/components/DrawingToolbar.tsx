import { Eraser, Minus, MousePointer2, Percent, SeparatorVertical, Slash, Square, Trash2, TrendingUp, Undo2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DrawingTool } from '../types/drawings';

interface DrawingToolbarProps {
  tool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
  onDeleteSelected: () => void;
  onClearAll: () => void;
  onUndo: () => void;
  hasSelection: boolean;
  hasDrawings: boolean;
}

const DRAW_TOOLS: { tool: DrawingTool; icon: LucideIcon; label: string }[] = [
  { tool: 'select', icon: MousePointer2, label: 'Select / move (V)' },
  { tool: 'trendLine', icon: Slash, label: 'Trend line' },
  { tool: 'ray', icon: TrendingUp, label: 'Ray' },
  { tool: 'horzLine', icon: Minus, label: 'Horizontal line' },
  { tool: 'vertLine', icon: SeparatorVertical, label: 'Vertical line' },
  { tool: 'rectangle', icon: Square, label: 'Rectangle' },
  { tool: 'fibRetracement', icon: Percent, label: 'Fibonacci retracement' },
];

function ToolBtn({
  title,
  active = false,
  danger = false,
  disabled = false,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`relative flex h-9 w-9 items-center justify-center rounded-sm transition-colors md:h-7 md:w-7 ${
        active
          ? 'bg-accent/25 text-accent'
          : danger
            ? disabled
              ? 'cursor-not-allowed text-text-muted/40'
              : 'text-text-secondary hover:bg-down-dim hover:text-down'
            : disabled
              ? 'cursor-not-allowed text-text-muted/40'
              : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
      }`}
    >
      {active && <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent" />}
      {children}
    </button>
  );
}

export function DrawingToolbar({
  tool,
  onToolChange,
  onDeleteSelected,
  onClearAll,
  onUndo,
  hasSelection,
  hasDrawings,
}: DrawingToolbarProps) {
  return (
    <div
      className="flex flex-col items-center gap-0.5 rounded-md border border-bg-border bg-bg-panel/95 p-1 shadow-neo backdrop-blur-sm"
      onPointerDown={(e) => e.stopPropagation()}
      role="toolbar"
      aria-label="Drawing tools"
    >
      {DRAW_TOOLS.map(({ tool: t, icon: Icon, label }) => (
        <ToolBtn key={t} title={label} active={tool === t} onClick={() => onToolChange(t)}>
          <Icon size={16} strokeWidth={tool === t ? 2.2 : 1.8} />
        </ToolBtn>
      ))}

      <span className="my-1 h-px w-5 bg-bg-border" aria-hidden="true" />

      <ToolBtn
        title={hasSelection ? 'Delete selected drawing (Del)' : 'Delete selected drawing (no selection)'}
        danger
        disabled={!hasSelection}
        onClick={onDeleteSelected}
      >
        <Eraser size={16} />
      </ToolBtn>
      <ToolBtn title="Undo last drawing (Ctrl+Z)" disabled={!hasDrawings} onClick={onUndo}>
        <Undo2 size={16} />
      </ToolBtn>
      <ToolBtn title="Clear all drawings" danger disabled={!hasDrawings} onClick={onClearAll}>
        <Trash2 size={16} />
      </ToolBtn>
    </div>
  );
}
