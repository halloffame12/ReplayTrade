import {
  ArrowDownRight,
  ArrowRightLeft,
  ArrowUpRight,
  Circle as CircleIcon,
  ChevronDown,
  Eraser,
  Hexagon,
  Magnet,
  Minus,
  MousePointer2,
  Pencil,
  PenTool,
  Percent,
  Redo2,
  Ruler,
  Scale,
  SeparatorVertical,
  Slash,
  Square,
  Triangle,
  Trash2,
  TrendingUp,
  Type,
  Undo2,
} from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { MagnetMode, ToolId } from '../../drawing';
import { TOOL_LABELS } from '../../drawing';

interface ToolbarItem {
  id: ToolId;
  icon: ReactNode;
  label: string;
  shortcut?: string;
}

interface ToolbarGroup {
  id: string;
  label: string;
  icon: ReactNode;
  items: ToolbarItem[];
}

const GROUPS: ToolbarGroup[] = [
  {
    id: 'lines',
    label: 'Line tools',
    icon: <Slash size={16} />,
    items: [
      { id: 'trendLine', icon: <Slash size={14} />, label: 'Trend Line', shortcut: 'T' },
      { id: 'ray', icon: <TrendingUp size={14} />, label: 'Ray' },
      { id: 'extendedLine', icon: <ArrowRightLeft size={14} />, label: 'Extended Line' },
      { id: 'horizontalLine', icon: <Minus size={14} />, label: 'Horizontal Line', shortcut: 'H' },
      { id: 'verticalLine', icon: <SeparatorVertical size={14} />, label: 'Vertical Line', shortcut: 'L' },
    ],
  },
  {
    id: 'shapes',
    label: 'Shape tools',
    icon: <Square size={16} />,
    items: [
      { id: 'rectangle', icon: <Square size={14} />, label: 'Rectangle', shortcut: 'R' },
      { id: 'circle', icon: <CircleIcon size={14} />, label: 'Circle' },
      { id: 'ellipse', icon: <CircleIcon size={14} className="scale-y-75" />, label: 'Ellipse' },
      { id: 'triangle', icon: <Triangle size={14} />, label: 'Triangle' },
      { id: 'polygon', icon: <Hexagon size={14} />, label: 'Polygon' },
      { id: 'path', icon: <Pencil size={14} />, label: 'Freehand Path', shortcut: 'P' },
    ],
  },
  {
    id: 'annotations',
    label: 'Annotation tools',
    icon: <PenTool size={16} />,
    items: [
      { id: 'arrow', icon: <ArrowUpRight size={14} />, label: 'Arrow', shortcut: 'A' },
      { id: 'text', icon: <Type size={14} />, label: 'Text', shortcut: 'X' },
      { id: 'fibRetracement', icon: <Percent size={14} />, label: 'Fibonacci Retracement' },
    ],
  },
  {
    id: 'positions',
    label: 'Position tools',
    icon: <Scale size={16} />,
    items: [
      { id: 'longPosition', icon: <ArrowUpRight size={14} />, label: 'Long Position' },
      { id: 'shortPosition', icon: <ArrowDownRight size={14} />, label: 'Short Position' },
      { id: 'riskReward', icon: <Scale size={14} />, label: 'Risk / Reward' },
      { id: 'measure', icon: <Ruler size={14} />, label: 'Measure' },
    ],
  },
];

const CURSOR_ITEM: ToolbarItem = {
  id: 'select',
  icon: <MousePointer2 size={16} />,
  label: 'Select / Move',
  shortcut: 'V',
};

const MAGNET_LABEL: Record<MagnetMode, string> = {
  off: 'Magnet: Off',
  weak: 'Magnet: Weak',
  strong: 'Magnet: Strong',
};

export interface DrawingToolbarProps {
  tool: ToolId;
  onToolChange: (t: ToolId) => void;
  magnetMode: MagnetMode;
  onMagnetChange: (m: MagnetMode) => void;
  canUndo: boolean;
  canRedo: boolean;
  hasDrawings: boolean;
  hasSelection: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onClear: () => void;
}

function IconBtn({
  title,
  active = false,
  danger = false,
  disabled = false,
  badge,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  badge?: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent md:h-7 md:w-7 ${
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
      {badge && <span className="absolute right-1 bottom-1 h-1.5 w-1.5 rounded-full bg-accent" />}
    </button>
  );
}

function GroupBtn({
  group,
  activeTool,
  onPick,
}: {
  group: ToolbarGroup;
  activeTool: ToolId;
  onPick: (t: ToolId) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = group.items.some((i) => i.id === activeTool);
  return (
    <div className="relative" onPointerDown={(e) => e.stopPropagation()}>
      <IconBtn
        title={`${group.label} (${group.items.map((i) => TOOL_LABELS[i.id]).join(', ')})`}
        active={active}
        onClick={() => setOpen((o) => !o)}
        badge={active}
      >
        {group.icon}
        <ChevronDown size={10} className="pointer-events-none absolute bottom-0 right-0.5 opacity-70" />
      </IconBtn>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close tool menu"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            aria-label={group.label}
            className="absolute left-full top-0 z-40 ml-1 flex flex-col rounded-md border border-bg-border bg-bg-panel p-1 shadow-neo md:min-w-[160px] max-md:left-1/2 max-md:-translate-x-1/2 max-md:bottom-full max-md:top-auto max-md:mb-1 max-md:flex-row max-md:flex-wrap max-md:min-w-0"
          >
            {group.items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  onPick(item.id);
                  setOpen(false);
                }}
                className={`flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[11px] transition-colors ${
                  activeTool === item.id ? 'bg-accent/25 text-accent' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                }`}
              >
                <span className="shrink-0">{item.icon}</span>
                <span className="whitespace-nowrap">{item.label}</span>
                {item.shortcut && (
                  <span className="ml-auto rounded-sm border border-bg-border px-1 font-mono text-[9px] text-text-muted">
                    {item.shortcut}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function DrawingToolbar({
  tool,
  onToolChange,
  magnetMode,
  onMagnetChange,
  canUndo,
  canRedo,
  hasDrawings,
  hasSelection,
  onUndo,
  onRedo,
  onDelete,
  onClear,
}: DrawingToolbarProps) {
  const nextMagnet: MagnetMode =
    magnetMode === 'off' ? 'weak' : magnetMode === 'weak' ? 'strong' : 'off';
  return (
    <div
      className="flex max-w-[calc(100vw-16px)] flex-row flex-wrap items-center gap-0.5 rounded-md border border-bg-border bg-bg-panel/95 p-1 shadow-neo backdrop-blur-sm md:max-w-none md:flex-col"
      onPointerDown={(e) => e.stopPropagation()}
      role="toolbar"
      aria-label="Drawing tools"
    >
      <IconBtn
        title={`${CURSOR_ITEM.label} (${CURSOR_ITEM.shortcut})`}
        active={tool === 'select'}
        onClick={() => onToolChange('select')}
      >
        {CURSOR_ITEM.icon}
      </IconBtn>

      {GROUPS.map((g) => (
        <GroupBtn key={g.id} group={g} activeTool={tool} onPick={onToolChange} />
      ))}

      <span className="mx-1 h-5 w-px bg-bg-border max-md:my-0.5 max-md:h-px max-md:w-5 md:my-1 md:h-px md:w-5" />

      <IconBtn
        title={hasSelection ? 'Delete selected drawing (Del)' : 'Delete selected drawing'}
        danger
        disabled={!hasSelection}
        onClick={onDelete}
      >
        <Eraser size={16} />
      </IconBtn>
      <IconBtn title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo}>
        <Undo2 size={16} />
      </IconBtn>
      <IconBtn title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={onRedo}>
        <Redo2 size={16} />
      </IconBtn>
      <IconBtn title="Clear all drawings" danger disabled={!hasDrawings} onClick={onClear}>
        <Trash2 size={16} />
      </IconBtn>
      <IconBtn title={`${MAGNET_LABEL[magnetMode]} — click to switch`} active={magnetMode !== 'off'} onClick={() => onMagnetChange(nextMagnet)}>
        <Magnet size={16} />
      </IconBtn>
    </div>
  );
}
