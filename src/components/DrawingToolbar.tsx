import { Eraser, Minus, MousePointer2, Percent, SeparatorVertical, Slash, Square, Trash2, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DrawingTool } from '../types/drawings';

interface DrawingToolbarProps {
  tool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
  onDeleteSelected: () => void;
  onClearAll: () => void;
  hasSelection: boolean;
  hasDrawings: boolean;
}

const DRAW_TOOLS: { tool: DrawingTool; icon: LucideIcon; label: string }[] = [
  { tool: 'select', icon: MousePointer2, label: 'Select / move' },
  { tool: 'trendLine', icon: Slash, label: 'Trend line' },
  { tool: 'ray', icon: TrendingUp, label: 'Ray' },
  { tool: 'horzLine', icon: Minus, label: 'Horizontal line' },
  { tool: 'vertLine', icon: SeparatorVertical, label: 'Vertical line' },
  { tool: 'rectangle', icon: Square, label: 'Rectangle' },
  { tool: 'fibRetracement', icon: Percent, label: 'Fibonacci retracement' },
];

export function DrawingToolbar({
  tool,
  onToolChange,
  onDeleteSelected,
  onClearAll,
  hasSelection,
  hasDrawings,
}: DrawingToolbarProps) {
  return (
    <div
      className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-md border border-bg-border bg-bg-panel/95 px-1 py-0.5 shadow-neo"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {DRAW_TOOLS.map(({ tool: t, icon: Icon, label }) => {
        const active = tool === t;
        return (
          <button
            key={t}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={active}
            onClick={() => onToolChange(t)}
            className={`flex h-9 w-9 md:h-7 md:w-7 items-center justify-center rounded-sm transition-colors ${
              active
                ? 'bg-accent/20 text-accent'
                : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
            }`}
          >
            <Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
          </button>
        );
      })}

      <span className="mx-1 h-4 w-px bg-bg-border" />

      <button
        type="button"
        title="Delete selected drawing"
        aria-label="Delete selected drawing"
        onClick={onDeleteSelected}
        disabled={!hasSelection}
        className={`flex h-9 w-9 md:h-7 md:w-7 items-center justify-center rounded-sm transition-colors ${
          tool === 'delete'
            ? 'bg-accent/20 text-accent'
            : hasSelection
              ? 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
              : 'cursor-not-allowed text-text-muted/50'
        }`}
      >
        <Eraser size={15} />
      </button>

      <button
        type="button"
        title="Clear all drawings"
        aria-label="Clear all drawings"
        onClick={onClearAll}
        disabled={!hasDrawings}
        className={`flex h-9 w-9 md:h-7 md:w-7 items-center justify-center rounded-sm transition-colors ${
          hasDrawings
            ? 'text-text-secondary hover:bg-bg-hover hover:text-down'
            : 'cursor-not-allowed text-text-muted/50'
        }`}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
