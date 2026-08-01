import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type {
  IChartApiBase,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  Logical,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';
import type { Candle } from '../types/market';
import type { Drawing, DrawingPoint, DrawingTool, TwoPointDrawing, TwoPointDrawingType } from '../types/drawings';

const DRAWING_COLORS = [
  '#4f8cff',
  '#eab308',
  '#22c55e',
  '#ef4444',
  '#a855f7',
  '#f97316',
  '#06b6d4',
  '#ec4899',
];

const HANDLE_HIT_RADIUS = 8;
const LINE_HIT_TOLERANCE = 5;
const OFFSCREEN = 1e7;
const SNAP_PX = 7;

const FIB_LEVELS: { label: string; ratio: number }[] = [
  { label: '0.0%', ratio: 0 },
  { label: '23.6%', ratio: 0.236 },
  { label: '38.2%', ratio: 0.382 },
  { label: '50.0%', ratio: 0.5 },
  { label: '61.8%', ratio: 0.618 },
  { label: '76.4%', ratio: 0.764 },
  { label: '100.0%', ratio: 1 },
];

let uid = 0;
const nextId = (): string => `${Date.now().toString(36)}_${(uid += 1).toString(36)}`;

interface DraftState {
  p0: DrawingPoint;
  p1: DrawingPoint;
}

interface DragState {
  id: string;
  mode: 'move' | 'p0' | 'p1';
  startX: number;
  startY: number;
}

interface HitResult {
  id: string;
  mode: 'move' | 'p0' | 'p1';
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function distToSegment(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x0, py - y0);
  let t = ((px - x0) * dx + (py - y0) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

function isValidStoredDrawing(d: unknown): d is Drawing {
  if (typeof d !== 'object' || d === null) return false;
  const o = d as Partial<Drawing>;
  if (typeof o.id !== 'string' || typeof o.color !== 'string') return false;
  if (o.type === 'horzLine') {
    return typeof o.price === 'number' && Number.isFinite(o.price);
  }
  if (o.type === 'vertLine') {
    return typeof o.time === 'number' && Number.isFinite(o.time);
  }
  if (o.type === 'trendLine' || o.type === 'ray' || o.type === 'rectangle' || o.type === 'fibRetracement') {
    const p0 = (o as { p0?: unknown }).p0 as DrawingPoint | undefined;
    const p1 = (o as { p1?: unknown }).p1 as DrawingPoint | undefined;
    return (
      p0 !== undefined &&
      p1 !== undefined &&
      typeof p0.time === 'number' &&
      typeof p0.price === 'number' &&
      typeof p1.time === 'number' &&
      typeof p1.price === 'number'
    );
  }
  return false;
}

class DrawingPaneView implements IPrimitivePaneView {
  private readonly manager: DrawingManager;

  constructor(manager: DrawingManager) {
    this.manager = manager;
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'top';
  }

  renderer(): IPrimitivePaneRenderer {
    return new DrawingPaneRenderer(this.manager);
  }
}

class DrawingPaneRenderer implements IPrimitivePaneRenderer {
  private readonly manager: DrawingManager;

  constructor(manager: DrawingManager) {
    this.manager = manager;
  }

  draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace((scope) => {
      this.manager.renderAll(scope.context, scope.mediaSize.width, scope.mediaSize.height);
    });
  }
}

export class DrawingManager implements ISeriesPrimitive<Time> {
  private chart: IChartApiBase<Time> | null = null;
  private series: ISeriesApi<'Candlestick'> | null = null;
  private requestUpdate: (() => void) | null = null;
  private times: number[] = [];
  private tf = 0;
  private tool: DrawingTool = 'select';
  private drawings: Drawing[] = [];
  private selectedId: string | null = null;
  private draft: DraftState | null = null;
  private drag: DragState | null = null;
  private colorIndex = 0;
  private onChange: (() => void) | null = null;
  private onCursor: ((cursor: string) => void) | null = null;
  private cursor = 'default';
  private panEnabled = true;
  private candles: Candle[] = [];
  private decimals = 2;
  private readonly paneView = new DrawingPaneView(this);

  constructor(private storageKey: string) {
    this.load();
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart;
    this.series = param.series as ISeriesApi<'Candlestick'>;
    this.requestUpdate = param.requestUpdate;
    this.applyInteractionOptions();
  }

  detached(): void {
    this.save();
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }

  setOnChange(cb: () => void): void {
    this.onChange = cb;
  }

  setOnCursor(cb: (cursor: string) => void): void {
    this.onCursor = cb;
  }

  setTimeframe(tfMs: number): void {
    this.tf = tfMs;
  }

  setDataTimes(times: number[]): void {
    this.times = times;
  }

  setCandles(candles: Candle[]): void {
    this.candles = candles;
  }

  setDecimals(decimals: number): void {
    this.decimals = decimals;
  }

  undo(): void {
    if (this.drawings.length === 0) return;
    this.drawings.pop();
    if (this.selectedId && !this.drawings.some((g) => g.id === this.selectedId)) {
      this.selectedId = null;
    }
    this.requestRender();
    this.notify();
  }

  setContext(symbol: string, timeframe: string): void {
    const key = `rt.drawings.${symbol}:${timeframe}`;
    if (key === this.storageKey) return;
    this.save();
    this.storageKey = key;
    this.drawings = [];
    this.selectedId = null;
    this.draft = null;
    this.drag = null;
    this.load();
    this.requestRender();
    this.notify();
  }

  getTool(): DrawingTool {
    return this.tool;
  }

  hasDrawings(): boolean {
    return this.drawings.length > 0;
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  isToolActive(): boolean {
    return this.tool !== 'select';
  }

  setTool(tool: DrawingTool): void {
    this.tool = tool;
    this.draft = null;
    this.drag = null;
    this.selectedId = null;
    this.applyInteractionOptions();
    this.setCursor(tool === 'select' ? 'default' : 'crosshair');
    this.requestRender();
    this.notify();
  }

  deleteSelected(): void {
    if (this.selectedId) this.removeDrawing(this.selectedId);
  }

  clearAll(): void {
    if (this.drawings.length === 0) return;
    this.drawings = [];
    this.selectedId = null;
    this.draft = null;
    this.drag = null;
    this.requestRender();
    this.notify();
  }

  onPointerDown(x: number, y: number): void {
    if (!this.chart || !this.series) return;
    switch (this.tool) {
      case 'select': {
        const hit = this.findHit(x, y);
        this.selectedId = hit ? hit.id : null;
        if (hit) {
          this.drag = { id: hit.id, mode: hit.mode, startX: x, startY: y };
          this.setPanEnabled(false);
        }
        break;
      }
      case 'delete': {
        const hit = this.findHit(x, y);
        if (hit) {
          this.removeDrawing(hit.id);
          this.selectedId = null;
        }
        break;
      }
      case 'horzLine': {
        const price = this.yToPrice(y);
        if (price === null) return;
        const time = this.xToTime(x);
        const snapped = time !== null ? this.snapPrice(time, price) : price;
        this.draft = { p0: { time: time ?? 0, price: snapped }, p1: { time: time ?? 0, price: snapped } };
        break;
      }
      case 'vertLine': {
        const time = this.xToTime(x);
        if (time === null) return;
        this.draft = { p0: { time, price: 0 }, p1: { time, price: 0 } };
        break;
      }
      case 'trendLine':
      case 'ray':
      case 'rectangle':
      case 'fibRetracement': {
        const time = this.xToTime(x);
        const price = this.yToPrice(y);
        if (time === null || price === null) return;
        const snapped = this.snapPrice(time, price);
        this.draft = { p0: { time, price: snapped }, p1: { time, price: snapped } };
        break;
      }
      default:
        break;
    }
    this.requestRender();
    this.notify();
  }

  onPointerMove(x: number, y: number): void {
    if (!this.chart || !this.series) return;
    if (this.draft) {
      this.updateDraft(x, y);
      this.requestRender();
      return;
    }
    if (this.drag && this.selectedId) {
      const d = this.drawings.find((g) => g.id === this.selectedId);
      if (d) {
        this.applyDrag(x, y, d);
        this.requestRender();
      }
      return;
    }
    if (this.tool === 'select') {
      const hovered = this.findHit(x, y) !== null;
      this.setPanEnabled(!hovered);
      this.setCursor(hovered ? 'move' : 'default');
    }
  }

  onPointerUp(): void {
    if (this.draft) this.commitDraft();
    this.drag = null;
    if (this.tool === 'select') this.setPanEnabled(true);
    this.requestRender();
    this.notify();
  }

  onPointerCancel(): void {
    this.draft = null;
    this.drag = null;
    if (this.tool === 'select') this.setPanEnabled(true);
    this.requestRender();
    this.notify();
  }

  renderAll(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (this.drawings.length === 0 && !this.draft) return;
    for (const d of this.drawings) {
      this.renderDrawing(ctx, d, w, h, false);
    }
    if (this.draft) {
      this.renderDraft(ctx, w, h);
    }
    if (this.selectedId) {
      this.renderHandles(ctx, w, h);
    }
  }

  renderDrawing(ctx: CanvasRenderingContext2D, d: Drawing, w: number, h: number, isDraft: boolean): void {
    ctx.save();
    ctx.lineWidth = isDraft ? 1 : 1.5;
    ctx.strokeStyle = d.color;
    ctx.setLineDash(isDraft ? [4, 4] : []);
    if (d.type === 'horzLine') {
      const y = this.priceToY(d.price);
      if (y === null) {
        ctx.restore();
        return;
      }
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      this.renderLabel(ctx, w, w - 2, y - 16, this.fmtPrice(d.price), d.color, 'right');
      ctx.restore();
      return;
    }
    if (d.type === 'vertLine') {
      const x = this.timeToX(d.time);
      if (x === null) {
        ctx.restore();
        return;
      }
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      this.renderLabel(ctx, w, x, 4, this.fmtDate(d.time), d.color, 'center');
      ctx.restore();
      return;
    }
    if (d.type === 'fibRetracement') {
      this.renderFib(ctx, d, w, isDraft);
      ctx.restore();
      return;
    }
    const x0 = this.timeToX(d.p0.time);
    const y0 = this.priceToY(d.p0.price);
    const x1 = this.timeToX(d.p1.time);
    const y1 = this.priceToY(d.p1.price);
    if (x0 === null || y0 === null || x1 === null || y1 === null) {
      ctx.restore();
      return;
    }
    if (d.type === 'rectangle') {
      const rx = Math.min(x0, x1);
      const rw = Math.abs(x1 - x0);
      const ry = Math.min(y0, y1);
      const rh = Math.abs(y1 - y0);
      ctx.fillStyle = hexToRgba(d.color, 0.12);
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);
      this.renderLabel(ctx, w, x1, y1 - 16, this.fmtPrice(d.p1.price), d.color, 'center');
    } else if (d.type === 'ray') {
      const dx = x1 - x0;
      const dy = y1 - y0;
      let ex: number;
      let ey: number;
      if (dx === 0) {
        ex = x0;
        ey = dy > 0 ? h : 0;
      } else if (dx > 0) {
        const t = (w - x0) / dx;
        ex = w;
        ey = y0 + dy * t;
      } else {
        const t = -x0 / dx;
        ex = 0;
        ey = y0 + dy * t;
      }
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      this.renderLabel(ctx, w, x1, y1 - 16, this.fmtPrice(d.p1.price), d.color, 'center');
    } else {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      this.renderLabel(ctx, w, x0, y0 - 16, this.fmtPrice(d.p0.price), d.color, 'center');
      this.renderLabel(ctx, w, x1, y1 - 16, this.fmtPrice(d.p1.price), d.color, 'center');
    }
    ctx.restore();
  }

  renderFib(ctx: CanvasRenderingContext2D, d: TwoPointDrawing, w: number, isDraft: boolean): void {
    const x0 = this.timeToX(d.p0.time);
    const y0 = this.priceToY(d.p0.price);
    const x1 = this.timeToX(d.p1.time);
    const y1 = this.priceToY(d.p1.price);
    if (x0 === null || y0 === null || x1 === null || y1 === null) return;
    ctx.save();
    ctx.setLineDash(isDraft ? [4, 4] : [3, 3]);
    ctx.lineWidth = 1;
    for (const { label, ratio } of FIB_LEVELS) {
      const price = d.p0.price + (d.p1.price - d.p0.price) * ratio;
      const y = this.priceToY(price);
      if (y === null) continue;
      ctx.strokeStyle = hexToRgba(d.color, 0.45);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      this.renderLabel(ctx, w, x0 + 4, y - 9, label, d.color, 'left');
      this.renderLabel(ctx, w, w - 2, y - 9, this.fmtPrice(price), d.color, 'right');
    }
    ctx.strokeStyle = d.color;
    ctx.lineWidth = isDraft ? 1 : 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.restore();
  }

  renderDraft(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!this.draft) return;
    const d = this.draftToDrawing();
    if (!d) return;
    this.renderDrawing(ctx, d, w, h, true);
    this.renderHandles(ctx, w, h, true);
    this.renderDraftTag(ctx, w);
  }

  renderHandles(ctx: CanvasRenderingContext2D, w: number, h: number, draft = false): void {
    let d: Drawing | null | undefined;
    let color: string;
    if (draft) {
      d = this.draftToDrawing();
      if (!d) return;
      color = DRAWING_COLORS[this.colorIndex % DRAWING_COLORS.length];
    } else {
      d = this.drawings.find((g) => g.id === this.selectedId);
      if (!d) return;
      color = d.color;
    }
    const drawHandle = (x: number, y: number): void => {
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(x - 4, y - 4, 8, 8);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };
    if (d.type === 'horzLine') {
      const y = this.priceToY(d.price);
      if (y === null) return;
      drawHandle(0, y);
      drawHandle(w, y);
      return;
    }
    if (d.type === 'vertLine') {
      const x = this.timeToX(d.time);
      if (x === null) return;
      drawHandle(x, 6);
      drawHandle(x, h - 6);
      return;
    }
    const x0 = this.timeToX(d.p0.time);
    const y0 = this.priceToY(d.p0.price);
    const x1 = this.timeToX(d.p1.time);
    const y1 = this.priceToY(d.p1.price);
    if (x0 !== null && y0 !== null) drawHandle(x0, y0);
    if (x1 !== null && y1 !== null) drawHandle(x1, y1);
  }

  private draftToDrawing(): Drawing | null {
    if (!this.draft) return null;
    const color = DRAWING_COLORS[this.colorIndex % DRAWING_COLORS.length];
    if (this.tool === 'vertLine') {
      return { id: '', type: 'vertLine', color, time: this.draft.p1.time };
    }
    if (this.tool === 'horzLine') {
      return { id: '', type: 'horzLine', color, price: this.draft.p1.price };
    }
    return {
      id: '',
      type: this.tool as TwoPointDrawingType,
      color,
      p0: this.draft.p0,
      p1: this.draft.p1,
    };
  }

  private renderDraftTag(ctx: CanvasRenderingContext2D, w: number): void {
    if (!this.draft) return;
    const color = DRAWING_COLORS[this.colorIndex % DRAWING_COLORS.length];
    if (this.tool === 'horzLine') {
      const y = this.priceToY(this.draft.p1.price);
      if (y === null) return;
      this.renderLabel(ctx, w, w - 2, y - 20, this.fmtPrice(this.draft.p1.price), color, 'right');
      return;
    }
    if (this.tool === 'vertLine') {
      const x = this.timeToX(this.draft.p1.time);
      if (x === null) return;
      this.renderLabel(ctx, w, x, 4, this.fmtDate(this.draft.p1.time), color, 'center');
      return;
    }
    const x = this.timeToX(this.draft.p1.time);
    const y = this.priceToY(this.draft.p1.price);
    if (x === null || y === null) return;
    this.renderLabel(
      ctx,
      w,
      x,
      y - 26,
      `${this.fmtPrice(this.draft.p1.price)} · ${this.fmtDate(this.draft.p1.time)}`,
      color,
      'center',
    );
  }

  private renderLabel(
    ctx: CanvasRenderingContext2D,
    w: number,
    x: number,
    y: number,
    text: string,
    color: string,
    align: 'left' | 'right' | 'center' = 'left',
  ): void {
    ctx.save();
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    const tw = ctx.measureText(text).width;
    const pad = 3;
    const bw = tw + pad * 2;
    let bx: number;
    if (align === 'right') bx = x - bw;
    else if (align === 'center') bx = x - bw / 2;
    else bx = x;
    bx = Math.max(0, Math.min(bx, w - bw));
    ctx.fillStyle = hexToRgba(color, 0.92);
    ctx.fillRect(bx, y, bw, 14);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, bx + pad, y + 11);
    ctx.restore();
  }

  private updateDraft(x: number, y: number): void {
    if (!this.draft) return;
    switch (this.tool) {
      case 'horzLine': {
        const price = this.yToPrice(y);
        if (price === null) break;
        const time = this.xToTime(x);
        this.draft.p1.price = time !== null ? this.snapPrice(time, price) : price;
        break;
      }
      case 'vertLine': {
        const time = this.xToTime(x);
        if (time !== null) this.draft.p1.time = time;
        break;
      }
      case 'trendLine':
      case 'ray':
      case 'rectangle':
      case 'fibRetracement': {
        const time = this.xToTime(x);
        const price = this.yToPrice(y);
        if (time !== null && price !== null) {
          this.draft.p1 = { time, price: this.snapPrice(time, price) };
        }
        break;
      }
      default:
        break;
    }
  }

  private applyDrag(x: number, y: number, d: Drawing): void {
    if (!this.drag) return;
    const dx = x - this.drag.startX;
    const dy = y - this.drag.startY;
    if (d.type === 'vertLine') {
      if (this.drag.mode !== 'move') return;
      const nt = this.xToTime(x);
      if (nt === null) return;
      d.time = nt;
      return;
    }
    if (d.type === 'horzLine') {
      if (this.drag.mode !== 'move') return;
      const ny = this.priceToY(d.price);
      if (ny === null) return;
      const np = this.yToPrice(ny + dy);
      if (np === null) return;
      const t = this.xToTime(x);
      d.price = t !== null ? this.snapPrice(t, np) : np;
      return;
    }
    if (this.drag.mode === 'move') {
      const x0 = this.timeToX(d.p0.time);
      const y0 = this.priceToY(d.p0.price);
      const x1 = this.timeToX(d.p1.time);
      const y1 = this.priceToY(d.p1.price);
      if (x0 === null || y0 === null || x1 === null || y1 === null) return;
      const nt0 = this.xToTime(x0 + dx);
      const np0 = this.yToPrice(y0 + dy);
      const nt1 = this.xToTime(x1 + dx);
      const np1 = this.yToPrice(y1 + dy);
      if (nt0 === null || nt1 === null || np0 === null || np1 === null) return;
      d.p0 = { time: nt0, price: np0 };
      d.p1 = { time: nt1, price: np1 };
      return;
    }
    const nt = this.xToTime(x);
    const np = this.yToPrice(y);
    if (nt === null || np === null) return;
    if (this.drag.mode === 'p0') {
      d.p0 = { time: nt, price: this.snapPrice(nt, np) };
    } else {
      d.p1 = { time: nt, price: this.snapPrice(nt, np) };
    }
  }

  private commitDraft(): void {
    if (!this.draft) return;
    const d = this.draft;
    this.draft = null;
    if (this.tool === 'vertLine') {
      const id = nextId();
      this.drawings.push({ id, type: 'vertLine', color: this.nextColor(), time: d.p1.time });
      this.selectedId = id;
      return;
    }
    if (this.tool === 'horzLine') {
      const id = nextId();
      this.drawings.push({ id, type: 'horzLine', color: this.nextColor(), price: d.p1.price });
      this.selectedId = id;
    } else {
      const dTime = d.p1.time - d.p0.time;
      const dPrice = Math.abs(d.p1.price - d.p0.price);
      if (Math.abs(dTime) < 1 && dPrice < Number.EPSILON) {
        this.selectedId = null;
        return;
      }
      const id = nextId();
      this.drawings.push({
        id,
        type: this.tool as TwoPointDrawingType,
        color: this.nextColor(),
        p0: { ...d.p0 },
        p1: { ...d.p1 },
      });
      this.selectedId = id;
    }
  }

  private removeDrawing(id: string): void {
    const i = this.drawings.findIndex((d) => d.id === id);
    if (i >= 0) this.drawings.splice(i, 1);
    if (this.selectedId === id) this.selectedId = null;
    this.requestRender();
    this.notify();
  }

  private nextColor(): string {
    const color = DRAWING_COLORS[this.colorIndex % DRAWING_COLORS.length];
    this.colorIndex += 1;
    return color;
  }

  private findHit(x: number, y: number): HitResult | null {
    for (let i = this.drawings.length - 1; i >= 0; i--) {
      const d = this.drawings[i];
      if (d.type === 'horzLine') {
        const py = this.priceToY(d.price);
        if (py === null) continue;
        if (Math.abs(py - y) <= LINE_HIT_TOLERANCE) return { id: d.id, mode: 'move' };
        continue;
      }
      if (d.type === 'vertLine') {
        const lx = this.timeToX(d.time);
        if (lx === null) continue;
        if (Math.abs(lx - x) <= LINE_HIT_TOLERANCE) return { id: d.id, mode: 'move' };
        continue;
      }
      const x0 = this.timeToX(d.p0.time);
      const y0 = this.priceToY(d.p0.price);
      const x1 = this.timeToX(d.p1.time);
      const y1 = this.priceToY(d.p1.price);
      if (x0 === null || y0 === null || x1 === null || y1 === null) continue;
      if (Math.hypot(x - x0, y - y0) <= HANDLE_HIT_RADIUS) return { id: d.id, mode: 'p0' };
      if (Math.hypot(x - x1, y - y1) <= HANDLE_HIT_RADIUS) return { id: d.id, mode: 'p1' };
      if (d.type === 'rectangle') {
        const rx = Math.min(x0, x1);
        const rw = Math.abs(x1 - x0);
        const ry = Math.min(y0, y1);
        const rh = Math.abs(y1 - y0);
        if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) return { id: d.id, mode: 'move' };
      } else if (distToSegment(x, y, x0, y0, x1, y1) <= LINE_HIT_TOLERANCE) {
        return { id: d.id, mode: 'move' };
      }
    }
    return null;
  }

  private timeToX(time: number): number | null {
    if (!this.chart) return null;
    const direct = this.chart.timeScale().timeToCoordinate(time as Time);
    if (direct !== null) return direct;
    const L = this.timeToLogical(time);
    if (L === null) return null;
    const coord = this.chart.timeScale().logicalToCoordinate(L as Logical);
    if (coord !== null) return coord;
    const n = this.times.length;
    if (n === 0) return null;
    return time > this.times[n - 1] ? OFFSCREEN : -OFFSCREEN;
  }

  private xToTime(x: number): number | null {
    if (!this.chart) return null;
    const L = this.chart.timeScale().coordinateToLogical(x);
    if (L === null) return null;
    return this.logicalToTime(L);
  }

  private priceToY(price: number): number | null {
    if (!this.series) return null;
    const c = this.series.priceToCoordinate(price);
    return c === null ? null : c;
  }

  private yToPrice(y: number): number | null {
    if (!this.series) return null;
    const p = this.series.coordinateToPrice(y);
    return p === null ? null : p;
  }

  private timeToLogical(time: number): number | null {
    const n = this.times.length;
    if (n === 0) return null;
    const first = this.times[0];
    const last = this.times[n - 1];
    if (time <= first) return this.tf > 0 ? (time - first) / this.tf : null;
    if (time >= last) return this.tf > 0 ? n - 1 + (time - last) / this.tf : null;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.times[mid] < time) lo = mid + 1;
      else hi = mid;
    }
    const right = this.times[lo];
    if (right === time) return lo;
    const left = this.times[Math.max(0, lo - 1)];
    const span = right - left;
    if (span <= 0) return lo;
    return lo - 1 + (time - left) / span;
  }

  private logicalToTime(L: number): number | null {
    const n = this.times.length;
    if (n === 0) return null;
    if (L < 0) return this.tf > 0 ? this.times[0] + L * this.tf : null;
    if (L >= n - 1) {
      if (this.tf > 0) return this.times[n - 1] + (L - (n - 1)) * this.tf;
      return this.times[n - 1];
    }
    const lo = Math.floor(L);
    const frac = L - lo;
    return this.times[lo] + (this.times[lo + 1] - this.times[lo]) * frac;
  }

  private nearestCandleIndex(time: number): number {
    const n = this.candles.length;
    if (n === 0) return -1;
    if (time <= this.candles[0].time) return 0;
    if (time >= this.candles[n - 1].time) return n - 1;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.candles[mid].time <= time) lo = mid;
      else hi = mid - 1;
    }
    if (lo + 1 < n && Math.abs(this.candles[lo + 1].time - time) < Math.abs(this.candles[lo].time - time)) {
      return lo + 1;
    }
    return lo;
  }

  /** Magnet: snap a raw price to the nearby candle's high/low when close enough. */
  private snapPrice(time: number, price: number): number {
    const i = this.nearestCandleIndex(time);
    if (i < 0) return price;
    const c = this.candles[i];
    const y = this.priceToY(price);
    const yHigh = this.priceToY(c.high);
    const yLow = this.priceToY(c.low);
    if (y === null || yHigh === null || yLow === null) return price;
    if (Math.abs(y - yHigh) <= SNAP_PX) return c.high;
    if (Math.abs(y - yLow) <= SNAP_PX) return c.low;
    return price;
  }

  private fmtPrice(p: number): string {
    return p.toFixed(this.decimals);
  }

  private fmtDate(time: number): string {
    const d = new Date(time * 1000);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}`;
  }

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
    const drawing = this.tool !== 'select';
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
        axisPressedMouseMove: false,
      },
    });
  }

  private setCursor(cursor: string): void {
    if (this.cursor === cursor) return;
    this.cursor = cursor;
    this.onCursor?.(cursor);
  }

  private requestRender(): void {
    this.requestUpdate?.();
  }

  private notify(): void {
    this.onChange?.();
    this.save();
  }

  private save(): void {
    try {
      if (this.drawings.length === 0) {
        localStorage.removeItem(this.storageKey);
      } else {
        localStorage.setItem(this.storageKey, JSON.stringify(this.drawings));
      }
    } catch {
      // storage may be unavailable
    }
  }

  private load(): void {
    this.drawings = [];
    if (!this.storageKey) return;
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        this.drawings = parsed.filter(isValidStoredDrawing);
      }
    } catch {
      this.drawings = [];
    }
  }
}
