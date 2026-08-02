import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type {
  IChartApiBase,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';
import type { Candle } from '../types/market';
import { CoordinateMapper } from './CoordinateMapper';
import { DrawingRenderer } from './DrawingRenderer';
import { DrawingSerializer, makeStorageKey } from './DrawingSerializer';
import { DrawingHitTester } from './DrawingHitTest';
import type { HandleId } from './DrawingHitTest';
import { HistoryManager } from './HistoryManager';
import { SnapEngine } from './SnapEngine';
import { getToolDef } from './tools';
import { bboxOfScreenPts, simplifyRdp, toScreenPts } from './geometry';
import {
  cloneDrawing,
  clonePoints,
  DEFAULT_STYLE,
  MIN_POINTS,
  nextId,
  STYLE_PRESETS,
  TOOL_LABELS,
} from './types';
import type {
  ChartPoint,
  Drawing,
  DrawingStyle,
  DrawingType,
  MagnetMode,
  PresetId,
  SnapResult,
  ToolId,
} from './types';

export interface DrawingEngineOptions {
  onChange?: () => void;
  onCursor?: (cursor: string) => void;
  /** Fired when a text drawing is committed — the host opens an inline editor. */
  onTextEdit?: (id: string) => void;
  /** Fired when a drawing becomes selected / deselected. */
  onSelectionChange?: (id: string | null) => void;
  /** Fired after undo/redo stacks change. */
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
}

interface DraftState {
  type: DrawingType;
  points: ChartPoint[];
  moved: boolean;
  startX: number;
  startY: number;
}

interface InteractionState {
  id: string;
  handle: HandleId;
  startX: number;
  startY: number;
  before: ChartPoint[];
  shiftLocked?: boolean;
}

interface PendingSnap {
  x: number;
  y: number;
  target: SnapResult['target'];
}

class EnginePaneView implements IPrimitivePaneView {
  private readonly engine: DrawingEngine;

  constructor(engine: DrawingEngine) {
    this.engine = engine;
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'top';
  }

  renderer(): IPrimitivePaneRenderer {
    return new EnginePaneRenderer(this.engine);
  }
}

class EnginePaneRenderer implements IPrimitivePaneRenderer {
  private readonly engine: DrawingEngine;

  constructor(engine: DrawingEngine) {
    this.engine = engine;
  }

  draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace((scope) => {
      this.engine.drawOnPane(scope.context, scope.mediaSize.width, scope.mediaSize.height);
    });
  }
}

export class DrawingEngine implements ISeriesPrimitive<Time> {
  private chart: IChartApiBase<Time> | null = null;
  private series: ISeriesApi<'Candlestick'> | null = null;
  private requestUpdate: (() => void) | null = null;

  private readonly mapper = new CoordinateMapper();
  private readonly history = new HistoryManager();
  private readonly renderer: DrawingRenderer;
  private readonly hitTester: DrawingHitTester;
  private readonly snap: SnapEngine;
  private serializer: DrawingSerializer;

  private drawings: Drawing[] = [];
  private selectedId: string | null = null;
  private hoveredId: string | null = null;

  private tool: ToolId = 'select';
  private magnetMode: MagnetMode = 'weak';
  private currentStyle: DrawingStyle = { ...DEFAULT_STYLE };
  private decimals = 2;

  private candles: Candle[] = [];
  private times: number[] = [];
  private tfSeconds = 0;
  private revealTime: number | null = null;
  private replayActive = false;

  private draft: DraftState | null = null;
  private interaction: InteractionState | null = null;
  private pendingSnap: PendingSnap | null = null;

  private lastW = 0;
  private lastH = 0;
  private hoverX: number | null = null;
  private hoverY: number | null = null;
  private panEnabled = true;
  private cursor = 'default';
  private storageKey: string;

  private readonly paneView = new EnginePaneView(this);
  private options: DrawingEngineOptions = {};

  constructor(storageKey: string) {
    this.storageKey = storageKey;
    this.serializer = new DrawingSerializer(storageKey);
    this.renderer = new DrawingRenderer(this.mapper);
    this.hitTester = new DrawingHitTester(
      this.mapper,
      () => this.drawings,
      () => this.selectedId,
    );
    this.snap = new SnapEngine(this.mapper, () => this.candles, () => this.drawings);
    this.history.setOnChange(() => {
      this.options.onHistoryChange?.(this.history.canUndo(), this.history.canRedo());
    });
    const loaded = this.serializer.load();
    if (loaded) {
      this.drawings = loaded.drawings;
      this.magnetMode = loaded.magnetMode;
      this.currentStyle = { ...DEFAULT_STYLE, ...loaded.style };
      this.drawings.sort((a, b) => a.layerIndex - b.layerIndex);
    }
  }

  // ---------------------------------------------------------------- lifecycle

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart;
    this.series = param.series as ISeriesApi<'Candlestick'>;
    this.requestUpdate = param.requestUpdate;
    this.mapper.setChart(this.chart);
    this.mapper.setSeries(this.series);
    this.applyInteractionOptions();
  }

  detached(): void {
    this.save();
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
    this.mapper.setChart(null);
    this.mapper.setSeries(null);
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }

  setOptions(options: DrawingEngineOptions): void {
    this.options = { ...this.options, ...options };
  }

  // ------------------------------------------------------------------ context

  setContext(symbol: string, timeframe: string, session?: string): void {
    const key = makeStorageKey(symbol, timeframe, session);
    if (key === this.storageKey) return;
    this.save();
    this.storageKey = key;
    this.serializer = new DrawingSerializer(key);
    this.drawings = [];
    this.selectedId = null;
    this.hoveredId = null;
    this.draft = null;
    this.interaction = null;
    const loaded = this.serializer.load();
    if (loaded) {
      this.drawings = loaded.drawings;
      this.magnetMode = loaded.magnetMode;
      this.currentStyle = { ...DEFAULT_STYLE, ...loaded.style };
      this.drawings.sort((a, b) => a.layerIndex - b.layerIndex);
    }
    this.requestRender();
    this.notify();
  }

  setData(
    candles: Candle[],
    tfSeconds: number,
    revealTime: number | null,
    replayActive: boolean,
  ): void {
    this.candles = candles;
    this.times = candles.map((c) => c.time);
    this.tfSeconds = tfSeconds;
    this.revealTime = revealTime;
    this.replayActive = replayActive;
    this.mapper.setData(this.times, tfSeconds);
    this.requestRender();
  }

  setDecimals(decimals: number): void {
    this.decimals = decimals;
    this.requestRender();
  }

  // ---------------------------------------------------------------- accessors

  getTool(): ToolId {
    return this.tool;
  }

  getDrawings(): Drawing[] {
    return this.drawings;
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  getSelected(): Drawing | null {
    return this.selectedId ? this.drawings.find((d) => d.id === this.selectedId) ?? null : null;
  }

  hasDrawings(): boolean {
    return this.drawings.length > 0;
  }

  hasSelection(): boolean {
    return this.selectedId !== null && this.drawings.some((d) => d.id === this.selectedId);
  }

  isDrawingToolActive(): boolean {
    return this.tool !== 'select' && this.tool !== 'delete';
  }

  isDragging(): boolean {
    return this.interaction !== null;
  }

  hasActiveDraft(): boolean {
    return this.draft !== null;
  }

  getMagnetMode(): MagnetMode {
    return this.magnetMode;
  }

  getStyle(id?: string): DrawingStyle {
    if (id) {
      const d = this.drawings.find((g) => g.id === id);
      if (d) return d.style;
    }
    return this.currentStyle;
  }

  canUndo(): boolean {
    return this.history.canUndo();
  }

  canRedo(): boolean {
    return this.history.canRedo();
  }

  /** Screen position of a drawing anchor (for the inline text editor / menus). */
  getAnchorScreenPos(id: string, index = 0): { x: number; y: number } | null {
    const d = this.drawings.find((g) => g.id === id);
    const p = d?.points[index];
    return p ? this.mapper.chartPointToScreen(p) : null;
  }

  /** Screen-space box of the selected drawing (for the floating action menu). */
  getSelectionScreenBox(): { x: number; y: number; w: number; h: number } | null {
    if (!this.selectedId) return null;
    const d = this.drawings.find((g) => g.id === this.selectedId);
    if (!d) return null;
    const pts = toScreenPts(d.points, (p) => this.mapper.chartPointToScreen(p));
    if (pts.length === 0) return null;
    const box = bboxOfScreenPts(pts);
    return { ...box, x: Math.max(2, Math.min(box.x, this.lastW - box.w - 2)), y: Math.max(2, box.y) };
  }

  // -------------------------------------------------------------------- tool

  setTool(tool: ToolId): void {
    if (tool === this.tool) return;
    this.tool = tool;
    this.draft = null;
    this.interaction = null;
    this.pendingSnap = null;
    this.selectedId = null;
    this.hoveredId = null;
    this.applyInteractionOptions();
    this.setCursor(this.isDrawingToolActive() ? 'crosshair' : 'default');
    this.requestRender();
    this.notify();
  }

  // ----------------------------------------------------------------- history

  undo(): void {
    this.history.undo();
    this.resolveSelection();
    this.requestRender();
    this.notify();
  }

  redo(): void {
    this.history.redo();
    this.resolveSelection();
    this.requestRender();
    this.notify();
  }

  clearAll(): void {
    if (this.drawings.length === 0) return;
    const before = this.drawings;
    const after: Drawing[] = [];
    this.history.push({
      label: 'Clear all drawings',
      undo: () => {
        this.drawings = before.map(cloneDrawing);
        this.requestRender();
      },
      redo: () => {
        this.drawings = after;
        this.requestRender();
      },
    });
    this.drawings = after;
    this.selectedId = null;
    this.hoveredId = null;
    this.draft = null;
    this.interaction = null;
    this.requestRender();
    this.notify();
  }

  // ---------------------------------------------------------------- selection

  deleteSelected(): void {
    if (this.selectedId) this.deleteDrawing(this.selectedId);
  }

  selectNext(forward: boolean): void {
    if (this.drawings.length === 0) return;
    const idx = this.selectedId
      ? this.drawings.findIndex((d) => d.id === this.selectedId)
      : forward
        ? -1
        : this.drawings.length;
    if (idx < 0) {
      this.selectedId = this.drawings[forward ? 0 : this.drawings.length - 1]?.id ?? null;
    } else {
      const next = (idx + (forward ? 1 : -1) + this.drawings.length) % this.drawings.length;
      this.selectedId = this.drawings[next]?.id ?? null;
    }
    this.requestRender();
    this.notify();
  }

  private resolveSelection(): void {
    if (this.selectedId && !this.drawings.some((d) => d.id === this.selectedId)) {
      this.selectedId = null;
    }
  }

  // ------------------------------------------------------------------- layer

  private reorderSelected(move: (idx: number) => number): void {
    const idx = this.selectedId ? this.drawings.findIndex((d) => d.id === this.selectedId) : -1;
    if (idx < 0) return;
    const next = move(idx);
    if (next < 0 || next >= this.drawings.length || next === idx) return;
    const before = this.drawings.map((d) => d.layerIndex);
    const d = this.drawings[idx];
    this.drawings.splice(idx, 1);
    this.drawings.splice(next, 0, d as Drawing);
    this.drawings.forEach((drawing, i) => {
      drawing.layerIndex = i;
    });
    const after = this.drawings.map((g) => g.layerIndex);
    this.history.push({
      label: 'Reorder drawing',
      undo: () => {
        this.drawings.forEach((drawing, i) => {
          const l = before[i];
          if (l !== undefined) drawing.layerIndex = l;
        });
        this.drawings.sort((a, b) => a.layerIndex - b.layerIndex);
        this.requestRender();
      },
      redo: () => {
        this.drawings.forEach((drawing, i) => {
          const l = after[i];
          if (l !== undefined) drawing.layerIndex = l;
        });
        this.drawings.sort((a, b) => a.layerIndex - b.layerIndex);
        this.requestRender();
      },
    });
    this.requestRender();
    this.notify();
  }

  bringForwardSelected(): void {
    this.reorderSelected((i) => Math.min(this.drawings.length - 1, i + 1));
  }

  sendBackwardSelected(): void {
    this.reorderSelected((i) => Math.max(0, i - 1));
  }

  toFrontSelected(): void {
    this.reorderSelected(() => this.drawings.length - 1);
  }

  toBackSelected(): void {
    this.reorderSelected(() => 0);
  }

  // ----------------------------------------------------------- edit operations

  duplicateSelected(): void {
    const d = this.getSelected();
    if (!d) return;
    const copy = cloneDrawing(d);
    copy.id = nextId();
    copy.createdAt = Date.now();
    copy.updatedAt = Date.now();
    copy.layerIndex = this.maxLayer() + 1;
    const idx = this.drawings.length;
    this.drawings.push(copy);
    this.history.push({
      label: 'Duplicate drawing',
      undo: () => {
        this.drawings.splice(this.drawings.indexOf(copy), 1);
        this.requestRender();
      },
      redo: () => {
        this.drawings.splice(idx, 0, copy);
        this.requestRender();
      },
    });
    this.selectedId = copy.id;
    this.requestRender();
    this.notify();
  }

  toggleLockSelected(): void {
    const d = this.getSelected();
    if (!d) return;
    const before = d.locked;
    d.locked = !d.locked;
    d.updatedAt = Date.now();
    this.history.push({
      label: d.locked ? 'Lock drawing' : 'Unlock drawing',
      undo: () => {
        d.locked = before;
        this.requestRender();
      },
      redo: () => {
        d.locked = !before;
        this.requestRender();
      },
    });
    this.requestRender();
    this.notify();
  }

  toggleVisibilitySelected(): void {
    const d = this.getSelected();
    if (!d) return;
    const before = d.visible;
    d.visible = !d.visible;
    d.updatedAt = Date.now();
    this.history.push({
      label: d.visible ? 'Show drawing' : 'Hide drawing',
      undo: () => {
        d.visible = before;
        this.requestRender();
      },
      redo: () => {
        d.visible = !before;
        this.requestRender();
      },
    });
    this.requestRender();
    this.notify();
  }

  updateStyle(id: string, partial: Partial<DrawingStyle>): void {
    const d = this.drawings.find((g) => g.id === id);
    if (!d) return;
    const before = { ...d.style };
    d.style = { ...d.style, ...partial };
    d.updatedAt = Date.now();
    this.currentStyle = { ...this.currentStyle, ...partial };
    this.history.push({
      label: 'Change style',
      undo: () => {
        d.style = before;
        this.requestRender();
      },
      redo: () => {
        d.style = { ...d.style, ...partial };
        this.requestRender();
      },
    });
    this.requestRender();
    this.notify();
  }

  setColor(id: string, color: string): void {
    this.updateStyle(id, { strokeColor: color, fillColor: color });
  }

  applyPreset(id: string, preset: PresetId): void {
    const d = this.drawings.find((g) => g.id === id);
    if (!d) return;
    const before = { ...d.style };
    const presetStyle = STYLE_PRESETS[preset];
    if (!presetStyle) return;
    d.style = { ...d.style, ...presetStyle };
    d.updatedAt = Date.now();
    this.currentStyle = { ...this.currentStyle, ...presetStyle };
    this.history.push({
      label: 'Apply style preset',
      undo: () => {
        d.style = before;
        this.requestRender();
      },
      redo: () => {
        d.style = { ...d.style, ...presetStyle };
        this.requestRender();
      },
    });
    this.requestRender();
    this.notify();
  }

  setText(id: string, text: string): void {
    const d = this.drawings.find((g) => g.id === id);
    if (!d) return;
    const before = d.text ?? '';
    d.text = text;
    d.updatedAt = Date.now();
    this.history.push({
      label: 'Edit text',
      undo: () => {
        d.text = before;
        this.requestRender();
      },
      redo: () => {
        d.text = text;
        this.requestRender();
      },
    });
    this.requestRender();
    this.notify();
  }

  setMagnetMode(mode: MagnetMode): void {
    if (this.magnetMode === mode) return;
    this.magnetMode = mode;
    this.requestRender();
    this.notify();
  }

  /** Keyboard nudge: move the selected drawing by a few screen pixels. */
  nudgeSelected(dxScreen: number, dyScreen: number): void {
    const d = this.getSelected();
    if (!d || d.locked) return;
    const before = clonePoints(d.points);
    for (const p of d.points) {
      const s = this.mapper.chartPointToScreen(p);
      if (!s) continue;
      const nt = this.mapper.xToTime(s.x + dxScreen);
      const np = this.mapper.yToPrice(s.y + dyScreen);
      if (nt !== null) p.time = this.clampTime(nt);
      if (np !== null) p.price = np;
    }
    d.updatedAt = Date.now();
    this.pushPointChange(d.id, before, clonePoints(d.points));
    this.requestRender();
    this.notify();
  }

  private pushPointChange(id: string, before: ChartPoint[], after: ChartPoint[]): void {
    const d = this.drawings.find((g) => g.id === id);
    if (!d) return;
    this.history.push({
      label: 'Move drawing',
      undo: () => {
        d.points = clonePoints(before);
        this.requestRender();
      },
      redo: () => {
        d.points = clonePoints(after);
        this.requestRender();
      },
    });
  }

  // -------------------------------------------------------------- pointer API

  onPointerDown(x: number, y: number, shiftKey?: boolean): void {
    if (!this.mapper.hasData()) return;
    this.hoveredId = null;
    if (this.tool === 'select') {
      const hit = this.hitTester.hit(x, y, this.lastW, this.lastH);
      this.selectedId = hit ? hit.id : null;
      if (hit) {
        const d = this.drawings.find((g) => g.id === hit.id);
        if (d?.locked) {
          this.interaction = null;
          this.setPanEnabled(true);
        } else {
          this.interaction = {
            id: hit.id,
            handle: hit.handle,
            startX: x,
            startY: y,
            before: d ? clonePoints(d.points) : [],
            shiftLocked: shiftKey,
          };
          this.setPanEnabled(false);
        }
      } else {
        this.interaction = null;
        this.setPanEnabled(true);
      }
      this.requestRender();
      this.notify();
      return;
    }
    if (this.tool === 'delete') {
      const hit = this.hitTester.hit(x, y, this.lastW, this.lastH);
      if (hit) {
        this.deleteDrawing(hit.id);
      }
      return;
    }
    // Drawing tool.
    const pt = this.snapAndClamp(x, y);
    if (!pt) return;
    const model = this.toolModel(this.tool as DrawingType);
    const keepCollecting = model === 'multipoint' || model === 'freehand';
    if (this.draft && keepCollecting && this.draft.type === this.tool) {
      this.draft.points.push(pt);
      this.draft.moved = false;
    } else {
      this.draft = {
        type: this.tool as DrawingType,
        points: [pt],
        moved: false,
        startX: x,
        startY: y,
      };
    }
    this.setPanEnabled(false);
    this.requestRender();
    this.notify();
  }

  onPointerMove(x: number, y: number, shiftKey?: boolean): void {
    if (!this.mapper.hasData()) return;
    if (this.interaction && this.selectedId) {
      if (shiftKey !== undefined) {
        this.interaction.shiftLocked = shiftKey;
      }
      this.applyDrag(x, y);
      if (this.pendingSnap) {
        this.hoverX = this.pendingSnap.x;
        this.hoverY = this.pendingSnap.y;
      } else {
        this.hoverX = x;
        this.hoverY = y;
      }
      this.requestRender();
      return;
    }
    if (this.draft) {
      this.updateDraft(x, y, shiftKey);
      if (this.pendingSnap) {
        this.hoverX = this.pendingSnap.x;
        this.hoverY = this.pendingSnap.y;
      } else {
        this.hoverX = x;
        this.hoverY = y;
      }
      this.requestRender();
      return;
    }
    if (this.isDrawingToolActive()) {
      this.snapAndClamp(x, y);
      if (this.pendingSnap) {
        this.hoverX = this.pendingSnap.x;
        this.hoverY = this.pendingSnap.y;
      } else {
        this.hoverX = x;
        this.hoverY = y;
      }
      this.requestRender();
      return;
    }
    this.hoverX = null;
    this.hoverY = null;
    if (this.tool === 'select') {
      const hit = this.hitTester.hit(x, y, this.lastW, this.lastH);
      const next = hit ? hit.id : null;
      this.setPanEnabled(next === null);
      this.setCursor(next !== null ? 'move' : 'default');
      if (this.hoveredId !== next) {
        this.hoveredId = next;
        this.requestRender();
      }
    } else if (this.tool === 'delete') {
      const hit = this.hitTester.hit(x, y, this.lastW, this.lastH);
      this.setCursor(hit !== null ? 'pointer' : 'crosshair');
    }
  }

  onPointerUp(): void {
    if (this.interaction) {
      this.commitInteraction();
      return;
    }
    if (this.draft) {
      const model = this.toolModel(this.draft.type);
      if (model === 'drag') {
        if (this.draft.moved) this.commitDraft();
        else this.cancelDraft();
        this.finishPointer(true);
        return;
      }
      if (model === 'click') {
        this.commitDraft();
        this.finishPointer(true);
        return;
      }
      if (model === 'freehand') {
        if (this.draft.moved) {
          this.simplifyDraft();
          this.commitDraft();
          this.finishPointer(true);
          return;
        }
        // A plain click: keep collecting until Enter / double-click.
        this.finishPointer(false);
        return;
      }
      // multipoint: keep collecting until Enter / double-click.
      this.finishPointer(false);
      return;
    }
    this.finishPointer(true);
  }

  onPointerCancel(): void {
    if (this.interaction) {
      const d = this.drawings.find((g) => g.id === this.interaction?.id);
      if (d) d.points = clonePoints(this.interaction.before);
      this.interaction = null;
    }
    if (this.draft) this.draft = null;
    this.finishPointer(true);
  }

  onPointerLeave(): void {
    this.hoverX = null;
    this.hoverY = null;
    this.pendingSnap = null;
    this.requestRender();
    this.notify();
  }

  onDblClick(): void {
    if (this.draft) {
      const model = this.toolModel(this.draft.type);
      if (model === 'multipoint' || model === 'freehand') {
        this.dedupeDraft();
        if (this.draft.points.length >= MIN_POINTS[this.draft.type]) {
          this.commitDraft();
        } else {
          this.cancelDraft();
        }
      }
    }
  }

  /** Escape handler — cancels a draft or an in-progress drag. */
  cancel(): boolean {
    if (this.draft) {
      this.draft = null;
      this.pendingSnap = null;
      this.finishPointer(true);
      return true;
    }
    if (this.interaction) {
      const d = this.drawings.find((g) => g.id === this.interaction?.id);
      if (d) d.points = clonePoints(this.interaction.before);
      this.interaction = null;
      this.finishPointer(true);
      return true;
    }
    return false;
  }

  /** Enter handler — finalizes a multi-point / freehand draft. */
  finishDraft(): boolean {
    if (!this.draft) return false;
    const model = this.toolModel(this.draft.type);
    if (model !== 'multipoint' && model !== 'freehand') return false;
    this.dedupeDraft();
    if (this.draft.points.length >= MIN_POINTS[this.draft.type]) {
      this.commitDraft();
    } else {
      this.cancelDraft();
    }
    return true;
  }

  private finishPointer(clearDraft: boolean): void {
    if (clearDraft) this.draft = null;
    this.interaction = null;
    this.pendingSnap = null;
    this.hoveredId = null;
    if (this.tool === 'select') this.setPanEnabled(true);
    this.requestRender();
    this.notify();
  }

  // ------------------------------------------------------------------ drawing

  private toolModel(type: DrawingType): 'click' | 'drag' | 'multipoint' | 'freehand' {
    const def = getToolDef(type);
    return def?.model ?? 'drag';
  }

  private updateDraft(x: number, y: number, shiftKey?: boolean): void {
    if (!this.draft) return;
    const model = this.toolModel(this.draft.type);
    const pt = this.snapAndClamp(x, y);
    if (!pt) return;
    const dx = x - this.draft.startX;
    const dy = y - this.draft.startY;
    if (!this.draft.moved && dx * dx + dy * dy > 16) this.draft.moved = true;

    switch (model) {
      case 'click':
        this.draft.points[0] = pt;
        break;
      case 'drag': {
        if (this.draft.points.length < 2) this.draft.points.push(pt);
        let finalPt = pt;
        if (shiftKey && this.draft.points[0]) {
          const p0 = this.draft.points[0];
          const s0 = this.mapper.chartPointToScreen(p0);
          const s1 = this.mapper.chartPointToScreen(pt);
          if (s0 && s1) {
            if (this.draft.type === 'rectangle' || this.draft.type === 'ellipse') {
              const dx = s1.x - s0.x;
              const dy = s1.y - s0.y;
              const size = Math.max(Math.abs(dx), Math.abs(dy));
              const nx = s0.x + Math.sign(dx) * size;
              const ny = s0.y + Math.sign(dy) * size;
              const cp = this.mapper.screenToChartPoint(nx, ny);
              if (cp) finalPt = this.clampPoint(cp);
            } else {
              const dx = s1.x - s0.x;
              const dy = s1.y - s0.y;
              const r = Math.hypot(dx, dy);
              const angle = Math.atan2(dy, dx);
              const step = Math.PI / 4;
              const snappedAngle = Math.round(angle / step) * step;
              const nx = s0.x + r * Math.cos(snappedAngle);
              const ny = s0.y + r * Math.sin(snappedAngle);
              const cp = this.mapper.screenToChartPoint(nx, ny);
              if (cp) finalPt = this.clampPoint(cp);
            }
          }
        }
        this.draft.points[this.draft.points.length - 1] = finalPt;
        break;
      }
      case 'multipoint':
        if (this.draft.points.length === 0) this.draft.points.push(pt);
        this.draft.points[this.draft.points.length - 1] = pt;
        break;
      case 'freehand': {
        const last = this.draft.points[this.draft.points.length - 1];
        if (!last) {
          this.draft.points.push(pt);
          break;
        }
        const lastS = this.mapper.chartPointToScreen(last);
        const curS = this.mapper.chartPointToScreen(pt);
        if (lastS && curS && Math.hypot(curS.x - lastS.x, curS.y - lastS.y) >= 3) {
          this.draft.points.push(pt);
        }
        break;
      }
      default:
        break;
    }
  }

  private simplifyDraft(): void {
    if (!this.draft || this.draft.points.length < 3) return;
    const pts = toScreenPts(this.draft.points, (p) => this.mapper.chartPointToScreen(p));
    if (pts.length < 3) return;
    const simplified = simplifyRdp(pts, 2.5);
    if (simplified.length < 2) return;
    const out: ChartPoint[] = [];
    for (const [sx, sy] of simplified) {
      const t = this.mapper.xToTime(sx);
      const pr = this.mapper.yToPrice(sy);
      if (t !== null && pr !== null) out.push({ time: t, price: pr });
    }
    if (out.length >= 2) this.draft.points = out;
  }

  private dedupeDraft(): void {
    if (!this.draft) return;
    const out: ChartPoint[] = [];
    for (const p of this.draft.points) {
      const last = out[out.length - 1];
      if (last && Math.abs(last.time - p.time) < 1 && Math.abs(last.price - p.price) < 1e-9) {
        continue;
      }
      out.push(p);
    }
    this.draft.points = out;
  }

  private commitDraft(): void {
    if (!this.draft) return;
    const draft = this.draft;
    this.draft = null;
    this.pendingSnap = null;
    const type = draft.type;
    const def = getToolDef(type);
    if (!def) return;
    if (draft.points.length < MIN_POINTS[type]) return;

    const spec = def.build(draft.points, { ...this.currentStyle });
    const drawing: Drawing = {
      ...spec,
      id: nextId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      layerIndex: this.maxLayer() + 1,
    };
    const idx = this.drawings.length;
    this.drawings.push(drawing);
    this.history.push({
      label: `Create ${TOOL_LABELS[type]}`,
      undo: () => {
        this.drawings.splice(this.drawings.indexOf(drawing), 1);
        this.requestRender();
      },
      redo: () => {
        this.drawings.splice(idx, 0, drawing);
        this.requestRender();
      },
    });
    this.selectedId = drawing.id;
    if (type === 'text') {
      this.options.onTextEdit?.(drawing.id);
    }
    this.requestRender();
    this.notify();
  }

  private cancelDraft(): void {
    this.draft = null;
    this.pendingSnap = null;
    this.requestRender();
    this.notify();
  }

  private deleteDrawing(id: string): void {
    const idx = this.drawings.findIndex((d) => d.id === id);
    if (idx < 0) return;
    const d = this.drawings[idx];
    if (!d) return;
    this.drawings.splice(idx, 1);
    if (this.selectedId === id) this.selectedId = null;
    if (this.hoveredId === id) this.hoveredId = null;
    this.history.push({
      label: 'Delete drawing',
      undo: () => {
        this.drawings.splice(idx, 0, d);
        this.requestRender();
      },
      redo: () => {
        const curIdx = this.drawings.indexOf(d);
        if (curIdx >= 0) this.drawings.splice(curIdx, 1);
        this.requestRender();
      },
    });
    this.requestRender();
    this.notify();
  }

  private maxLayer(): number {
    let max = -1;
    for (const d of this.drawings) {
      if (d.layerIndex > max) max = d.layerIndex;
    }
    return max;
  }

  // -------------------------------------------------------------------- drag

  private applyDrag(x: number, y: number): void {
    const interaction = this.interaction;
    const d = this.drawings.find((g) => g.id === interaction?.id);
    if (!d || !interaction) return;
    const dx = x - interaction.startX;
    const dy = y - interaction.startY;

    if (interaction.handle === 'move') {
      if (d.locked) return;
      const startSnap = toScreenPts(interaction.before, (p) => this.mapper.chartPointToScreen(p));
      d.points.forEach((p, i) => {
        const s = startSnap[i];
        if (!s) return;
        const nt = this.mapper.xToTime(s[0] + dx);
        const np = this.mapper.yToPrice(s[1] + dy);
        if (nt !== null) p.time = this.clampTime(nt);
        if (np !== null) p.price = np;
      });
      d.updatedAt = Date.now();
      return;
    }

    // Handle resize.
    this.applyHandleResize(d, interaction, x, y);
  }

  private applyHandleResize(
    d: Drawing,
    interaction: InteractionState,
    x: number,
    y: number,
  ): void {
    const handle = interaction.handle as number;
    switch (d.type) {
      case 'horizontalLine': {
        const p = this.mapper.yToPrice(y);
        if (p !== null) d.points[0] = { time: 0, price: p };
        break;
      }
      case 'verticalLine': {
        const t = this.mapper.xToTime(x);
        if (t !== null) d.points[0] = { time: this.clampTime(t), price: 0 };
        break;
      }
      case 'trendLine':
      case 'ray':
      case 'extendedLine':
      case 'fibRetracement':
      case 'measure':
      case 'arrow': {
        let pt = this.snapAndClamp(x, y);
        if (!pt) return;
        if (interaction.shiftLocked) {
          const opposite = handle === 1 ? 0 : 1;
          const p0 = d.points[opposite];
          const s0 = p0 ? this.mapper.chartPointToScreen(p0) : null;
          const s1 = this.mapper.chartPointToScreen(pt);
          if (s0 && s1) {
            const dx = s1.x - s0.x;
            const dy = s1.y - s0.y;
            const r = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx);
            const step = Math.PI / 4;
            const snappedAngle = Math.round(angle / step) * step;
            const nx = s0.x + r * Math.cos(snappedAngle);
            const ny = s0.y + r * Math.sin(snappedAngle);
            const cp = this.mapper.screenToChartPoint(nx, ny);
            if (cp) pt = this.clampPoint(cp);
          }
        }
        d.points[handle === 1 ? 1 : 0] = pt;
        break;
      }
      case 'circle': {
        const pt = this.snapAndClamp(x, y);
        if (!pt) return;
        if (handle === 0) {
          const p0 = d.points[0];
          const p1 = d.points[1];
          if (!p0 || !p1) return;
          const sc = this.mapper.chartPointToScreen(p0);
          const sr = this.mapper.chartPointToScreen(p1);
          if (sc && sr) {
            const rel = { x: sr.x - sc.x, y: sr.y - sc.y };
            const ns = this.mapper.chartPointToScreen(pt);
            if (ns) d.points[0] = pt;
            const p0New = d.points[0];
            if (p0New) {
              const sc2 = this.mapper.chartPointToScreen(p0New);
              if (sc2) {
                const nx = sc2.x + rel.x;
                const ny = sc2.y + rel.y;
                const nt = this.mapper.xToTime(nx);
                const np = this.mapper.yToPrice(ny);
                if (nt !== null && np !== null) d.points[1] = { time: this.clampTime(nt), price: np };
              }
            }
          }
        } else {
          d.points[1] = pt;
        }
        break;
      }
      case 'rectangle':
      case 'ellipse': {
        this.resizeBox(d, handle, x, y, interaction.shiftLocked ?? false);
        break;
      }
      case 'triangle':
      case 'polygon':
      case 'path': {
        const pt = this.snapAndClamp(x, y);
        if (!pt) return;
        if (handle >= 0 && handle < d.points.length) d.points[handle] = pt;
        break;
      }
      case 'text': {
        const pt = this.snapAndClamp(x, y);
        if (!pt) return;
        d.points[0] = pt;
        break;
      }
      case 'longPosition':
      case 'shortPosition':
      case 'riskReward': {
        const pt = this.snapAndClamp(x, y);
        if (!pt) return;
        if (handle >= 0 && handle < d.points.length) d.points[handle] = pt;
        break;
      }
      default:
        break;
    }
    d.updatedAt = Date.now();
  }

  private resizeBox(d: Drawing, handle: number, x: number, y: number, shift: boolean): void {
    const [a, b] = d.points;
    const sa = a ? this.mapper.chartPointToScreen(a) : null;
    const sb = b ? this.mapper.chartPointToScreen(b) : null;
    if (!sa || !sb) return;
    let minX = Math.min(sa.x, sb.x);
    let maxX = Math.max(sa.x, sb.x);
    let minY = Math.min(sa.y, sb.y);
    let maxY = Math.max(sa.y, sb.y);

    if (handle <= 3) {
      // Corner.
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      let nx = x;
      let ny = y;
      if (shift) {
        const w0 = maxX - minX;
        const h0 = maxY - minY;
        const scale = Math.max(
          Math.abs((nx - cx) / (w0 / 2 || 1)),
          Math.abs((ny - cy) / (h0 / 2 || 1)),
        );
        const halfW = (w0 / 2) * scale;
        const halfH = (h0 / 2) * scale;
        const dirX = nx > cx ? 1 : -1;
        const dirY = ny > cy ? 1 : -1;
        nx = cx + dirX * halfW;
        ny = cy + dirY * halfH;
      }
      switch (handle) {
        case 0:
          minX = nx;
          minY = ny;
          break;
        case 1:
          maxX = nx;
          minY = ny;
          break;
        case 2:
          maxX = nx;
          maxY = ny;
          break;
        case 3:
          minX = nx;
          maxY = ny;
          break;
      }
    } else {
      switch (handle) {
        case 4:
          minY = y;
          break; // top
        case 5:
          maxX = x;
          break; // right
        case 6:
          maxY = y;
          break; // bottom
        case 7:
          minX = x;
          break; // left
      }
    }

    const t0 = this.mapper.xToTime(minX);
    const p0 = this.mapper.yToPrice(maxY);
    const t1 = this.mapper.xToTime(maxX);
    const p1 = this.mapper.yToPrice(minY);
    if (t0 !== null && p0 !== null && t1 !== null && p1 !== null) {
      d.points[0] = { time: this.clampTime(t0), price: p0 };
      d.points[1] = { time: this.clampTime(t1), price: p1 };
    }
  }

  private commitInteraction(): void {
    const interaction = this.interaction;
    if (!interaction) return;
    const d = this.drawings.find((g) => g.id === interaction.id);
    this.interaction = null;
    if (d) {
      const after = clonePoints(d.points);
      this.pushPointChange(d.id, interaction.before, after);
      d.updatedAt = Date.now();
    }
    if (this.tool === 'select') this.setPanEnabled(true);
    this.pendingSnap = null;
    this.requestRender();
    this.notify();
  }

  // ------------------------------------------------------------------ snapping

  private snapAndClamp(x: number, y: number): ChartPoint | null {
    const raw = this.mapper.screenToChartPoint(x, y);
    if (!raw) return null;
    const result = this.snap.snap(raw, this.magnetMode);
    this.pendingSnap = result.snapped
      ? { x: this.mapper.timeToX(result.point.time) ?? x, y: this.mapper.priceToY(result.point.price) ?? y, target: result.target }
      : null;
    const clamped = this.clampPoint(result.point);
    return clamped;
  }

  private clampPoint(p: ChartPoint): ChartPoint {
    return { time: this.clampTime(p.time), price: p.price };
  }

  private clampTime(time: number): number {
    if (this.revealTime !== null && this.replayActive) {
      return Math.min(time, this.revealTime);
    }
    return time;
  }

  // ------------------------------------------------------------------ render

  drawOnPane(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    this.lastW = w;
    this.lastH = h;
    const env = { ctx, w, h, decimals: this.decimals, tfSeconds: this.tfSeconds };
    const opts = {
      selectedId: this.selectedId,
      hoveredId: this.hoveredId,
      showHandles: true,
      revealTime: this.replayActive ? this.revealTime : null,
    };
    this.renderer.render(env, this.drawings, opts);

    if (this.draft) {
      const def = getToolDef(this.draft.type);
      if (def) {
        const spec = def.build(this.draft.points, { ...this.currentStyle });
        const draftDrawing: Drawing = {
          ...spec,
          id: '__draft__',
          createdAt: 0,
          updatedAt: 0,
          layerIndex: 0,
        };
        this.renderer.renderDraft(env, draftDrawing, opts);
      }
    }
    if (this.isDrawingToolActive() && this.hoverX !== null && this.hoverY !== null) {
      this.renderer.renderHoverCrosshair(env, this.hoverX, this.hoverY);
    }
    if (this.pendingSnap) {
      this.renderer.renderSnapIndicator(env, this.pendingSnap.x, this.pendingSnap.y, this.pendingSnap.target);
    }
  }

  // ----------------------------------------------------------- chart plumbing

  private setPanEnabled(enabled: boolean): void {
    if (this.panEnabled === enabled || !this.chart) return;
    this.panEnabled = enabled;
    this.chart.applyOptions({
      handleScroll: {
        pressedMouseMove: enabled,
        horzTouchDrag: enabled,
        vertTouchDrag: enabled,
      },
    });
  }

  private applyInteractionOptions(): void {
    if (!this.chart) return;
    const drawing = this.isDrawingToolActive();
    this.panEnabled = !drawing;
    this.chart.applyOptions({
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: !drawing,
        horzTouchDrag: !drawing,
        vertTouchDrag: !drawing,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },
    });
  }

  private setCursor(cursor: string): void {
    if (this.cursor === cursor) return;
    this.cursor = cursor;
    this.options.onCursor?.(cursor);
  }

  private requestRender(): void {
    this.requestUpdate?.();
  }

  private notify(): void {
    this.options.onChange?.();
    this.options.onSelectionChange?.(this.selectedId);
    this.options.onHistoryChange?.(this.history.canUndo(), this.history.canRedo());
    this.save();
  }

  private save(): void {
    this.serializer.save({
      version: 1,
      drawings: this.drawings,
      magnetMode: this.magnetMode,
      style: this.currentStyle,
    });
  }
}

const OFFSCREEN_SENTINEL = -999999;
export { OFFSCREEN_SENTINEL };
