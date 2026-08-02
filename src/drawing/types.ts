/**
 * Chart drawing domain model.
 *
 * Drawings are stored in CHART SPACE (bar-time + price), never screen pixels,
 * so they stay pinned correctly through zoom, pan, resize, replay and symbol
 * changes. Only the renderer ever converts to screen coordinates.
 */

export type DrawingType =
  | 'trendLine'
  | 'ray'
  | 'extendedLine'
  | 'horizontalLine'
  | 'verticalLine'
  | 'fibRetracement'
  | 'rectangle'
  | 'circle'
  | 'ellipse'
  | 'triangle'
  | 'polygon'
  | 'path'
  | 'arrow'
  | 'text'
  | 'longPosition'
  | 'shortPosition'
  | 'riskReward'
  | 'measure';

/** `select` = the cursor/move tool, `delete` = the eraser tool. */
export type ToolId = 'select' | 'delete' | DrawingType;

export const LINE_TOOLS = new Set(['trendLine', 'ray', 'extendedLine'] as const);
export const SHAPE_TOOLS = new Set(['rectangle', 'circle', 'ellipse', 'triangle', 'polygon', 'path'] as const);
export const POSITION_TOOLS = new Set(['longPosition', 'shortPosition', 'riskReward'] as const);

/** A single chart-space anchor. */
export interface ChartPoint {
  /** Bar time in seconds. */
  time: number;
  /** Price. */
  price: number;
}

export type LineStrokeStyle = 'solid' | 'dashed' | 'dotted';

export interface DrawingStyle {
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: LineStrokeStyle;
  fillColor: string;
  fillOpacity: number;
  textColor: string;
  fontSize: number;
}

export type PresetId = 'default' | 'support' | 'resistance' | 'trend' | 'risk' | 'reward' | 'annotation';

export interface Drawing {
  id: string;
  type: DrawingType;
  points: ChartPoint[];
  style: DrawingStyle;
  visible: boolean;
  locked: boolean;
  layerIndex: number;
  createdAt: number;
  updatedAt: number;
  /** Free text (Text tool) or any annotation string. */
  text?: string;
  /** Tool-specific numeric knobs (arrowhead size, etc). */
  data?: Record<string, number>;
  /** Line behaviour: ray / extended line. */
  extend?: { start: boolean; end: boolean };
  /** Optional measurement labels shown on the canvas. */
  labels?: { priceChange?: boolean; percent?: boolean; bars?: boolean; time?: boolean; price?: boolean; timeRange?: boolean };
  /** Fib retracement levels (ratios 0..1). */
  fibLevels?: number[];
  /** Risk/reward tool inputs. */
  risk?: { accountSize: number; riskPct: number; positionSize: number };
  showRadius?: boolean;
}

export type MagnetMode = 'off' | 'weak' | 'strong';

export type SnapTarget =
  | 'none'
  | 'open'
  | 'high'
  | 'low'
  | 'close'
  | 'body'
  | 'center'
  | 'point'
  | 'hline'
  | 'vline'
  | 'grid';

export interface SnapResult {
  point: ChartPoint;
  target: SnapTarget;
  snapped: boolean;
}

export const DEFAULT_STYLE: DrawingStyle = {
  strokeColor: '#4f8cff',
  strokeWidth: 1.5,
  strokeStyle: 'solid',
  fillColor: '#4f8cff',
  fillOpacity: 0.15,
  textColor: '#e6ebf5',
  fontSize: 11,
};

export const STYLE_PRESETS: Record<PresetId, DrawingStyle> = {
  default: { ...DEFAULT_STYLE },
  support: {
    ...DEFAULT_STYLE,
    strokeColor: '#22c55e',
    fillColor: '#22c55e',
  },
  resistance: {
    ...DEFAULT_STYLE,
    strokeColor: '#ef4444',
    fillColor: '#ef4444',
  },
  trend: {
    ...DEFAULT_STYLE,
    strokeColor: '#4f8cff',
    fillColor: '#4f8cff',
  },
  risk: {
    ...DEFAULT_STYLE,
    strokeColor: '#f97316',
    fillColor: '#f97316',
  },
  reward: {
    ...DEFAULT_STYLE,
    strokeColor: '#22c55e',
    fillColor: '#22c55e',
  },
  annotation: {
    ...DEFAULT_STYLE,
    strokeColor: '#e6ebf5',
    fillColor: '#e6ebf5',
  },
};

export const PALETTE = [
  '#4f8cff',
  '#eab308',
  '#22c55e',
  '#ef4444',
  '#a855f7',
  '#f97316',
  '#06b6d4',
  '#ec4899',
];

/** Compatibility alias for code that referenced the old colour list. */
export const DRAWING_COLORS = PALETTE;

export const DEFAULT_FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.764, 1];

export const TOOL_LABELS: Record<ToolId, string> = {
  select: 'Select / Move',
  delete: 'Delete drawing',
  trendLine: 'Trend Line',
  ray: 'Ray',
  extendedLine: 'Extended Line',
  horizontalLine: 'Horizontal Line',
  verticalLine: 'Vertical Line',
  fibRetracement: 'Fibonacci Retracement',
  rectangle: 'Rectangle',
  circle: 'Circle',
  ellipse: 'Ellipse',
  triangle: 'Triangle',
  polygon: 'Polygon',
  path: 'Freehand Path',
  arrow: 'Arrow',
  text: 'Text',
  longPosition: 'Long Position',
  shortPosition: 'Short Position',
  riskReward: 'Risk / Reward',
  measure: 'Measure',
};

export const TOOL_SHORTCUTS: Partial<Record<ToolId, string>> = {
  select: 'V',
  trendLine: 'T',
  horizontalLine: 'H',
  verticalLine: 'L',
  rectangle: 'R',
  arrow: 'A',
  text: 'X',
  path: 'P',
};

export type InteractionModel = 'click' | 'drag' | 'multipoint' | 'freehand';

export const INTERACTION_MODEL: Record<DrawingType, InteractionModel> = {
  trendLine: 'drag',
  ray: 'drag',
  extendedLine: 'drag',
  horizontalLine: 'click',
  verticalLine: 'click',
  fibRetracement: 'drag',
  rectangle: 'drag',
  circle: 'drag',
  ellipse: 'drag',
  triangle: 'multipoint',
  polygon: 'multipoint',
  path: 'freehand',
  arrow: 'drag',
  text: 'click',
  longPosition: 'multipoint',
  shortPosition: 'multipoint',
  riskReward: 'multipoint',
  measure: 'drag',
};

export const MIN_POINTS: Record<DrawingType, number> = {
  trendLine: 2,
  ray: 2,
  extendedLine: 2,
  horizontalLine: 1,
  verticalLine: 1,
  fibRetracement: 2,
  rectangle: 2,
  circle: 2,
  ellipse: 2,
  triangle: 3,
  polygon: 3,
  path: 2,
  arrow: 2,
  text: 1,
  longPosition: 3,
  shortPosition: 3,
  riskReward: 3,
  measure: 2,
};

export function isFinitePoint(p: ChartPoint | undefined | null): p is ChartPoint {
  return (
    !!p &&
    Number.isFinite(p.time) &&
    Number.isFinite(p.price) &&
    p.price > 0
  );
}

export function cloneStyle(style: DrawingStyle): DrawingStyle {
  return { ...style };
}

export function clonePoint(p: ChartPoint): ChartPoint {
  return { time: p.time, price: p.price };
}

export function clonePoints(points: ChartPoint[]): ChartPoint[] {
  return points.map(clonePoint);
}

export function cloneDrawing(d: Drawing): Drawing {
  return {
    ...d,
    points: clonePoints(d.points),
    style: cloneStyle(d.style),
    data: d.data ? { ...d.data } : undefined,
    extend: d.extend ? { ...d.extend } : undefined,
    labels: d.labels ? { ...d.labels } : undefined,
    fibLevels: d.fibLevels ? [...d.fibLevels] : undefined,
    risk: d.risk ? { ...d.risk } : undefined,
  };
}

let uid = 0;
/** Monotonic, collision-safe id (no library dependency). */
export function nextId(): string {
  uid += 1;
  return `${Date.now().toString(36)}_${uid.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
