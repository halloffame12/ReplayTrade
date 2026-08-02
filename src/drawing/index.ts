export { DrawingEngine } from './DrawingEngine';
export type { DrawingEngineOptions } from './DrawingEngine';
export { CoordinateMapper } from './CoordinateMapper';
export { SnapEngine } from './SnapEngine';
export { HistoryManager } from './HistoryManager';
export type { HistoryAction } from './HistoryManager';
export { DrawingRenderer } from './DrawingRenderer';
export { DrawingSerializer, makeStorageKey, isValidDrawing } from './DrawingSerializer';
export { DrawingHitTester, drawingHandles } from './DrawingHitTest';
export { getToolDef, ALL_TOOL_DEFS } from './tools';
export type { ToolDef, DrawingSpec } from './tools';
export {
  DEFAULT_STYLE,
  STYLE_PRESETS,
  PALETTE,
  DRAWING_COLORS,
  DEFAULT_FIB_LEVELS,
  TOOL_LABELS,
  TOOL_SHORTCUTS,
  INTERACTION_MODEL,
  MIN_POINTS,
  LINE_TOOLS,
  SHAPE_TOOLS,
  POSITION_TOOLS,
  isFinitePoint,
  cloneDrawing,
  nextId,
} from './types';
export type {
  ChartPoint,
  Drawing,
  DrawingStyle,
  DrawingType,
  ToolId,
  PresetId,
  MagnetMode,
  SnapResult,
  SnapTarget,
  LineStrokeStyle,
  InteractionModel,
} from './types';
