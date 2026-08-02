import type { CoordinateMapper } from './CoordinateMapper';
import { clipLineToRect, clipRayToRect, dist } from './geometry';
import type { ChartPoint, Drawing, DrawingStyle, SnapTarget } from './types';
import { drawingHandles } from './DrawingHitTest';

export interface RenderEnv {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  decimals: number;
  /** bar interval in seconds (0 when unknown) */
  tfSeconds: number;
}

export interface RenderOptions {
  selectedId: string | null;
  hoveredId: string | null;
  showHandles: boolean;
  /** When replaying, drawings pointing past this time must not render. */
  revealTime: number | null;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function fmtPrice(price: number, decimals: number): string {
  if (!Number.isFinite(price)) return '—';
  return price.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtClock(ts: number): string {
  const d = new Date(ts * 1000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function fmtDuration(seconds: number): string {
  const s = Math.round(Math.abs(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const days = Math.floor(h / 24);
  return `${days}d ${h % 24}h`;
}

function setStroke(ctx: CanvasRenderingContext2D, style: DrawingStyle, width = style.strokeWidth, alpha = 1): void {
  ctx.strokeStyle = alpha < 1 ? hexToRgba(style.strokeColor, alpha) : style.strokeColor;
  ctx.lineWidth = width;
  switch (style.strokeStyle) {
    case 'dashed':
      ctx.setLineDash([6, 4]);
      break;
    case 'dotted':
      ctx.setLineDash([2, 3]);
      break;
    default:
      ctx.setLineDash([]);
      break;
  }
}

function drawStrokeLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  style: DrawingStyle,
  width?: number,
  alpha?: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  setStroke(ctx, style, width, alpha);
  ctx.stroke();
  ctx.setLineDash([]);
}

function chip(
  ctx: CanvasRenderingContext2D,
  w: number,
  x: number,
  y: number,
  text: string,
  color: string,
  align: 'left' | 'right' | 'center' = 'left',
  textColor = '#ffffff',
): void {
  ctx.save();
  ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const tw = ctx.measureText(text).width;
  const pad = 3;
  const bw = tw + pad * 2;
  let bx = align === 'right' ? x - bw : align === 'center' ? x - bw / 2 : x;
  bx = Math.max(0, Math.min(bx, w - bw));
  ctx.fillStyle = color;
  ctx.fillRect(bx, y, bw, 14);
  ctx.fillStyle = textColor;
  ctx.fillText(text, bx + pad, y + 11);
  ctx.restore();
}

export class DrawingRenderer {
  constructor(private readonly mapper: CoordinateMapper) {}

  /**
   * Draw all drawings in layer order. Layers are maintained ascending so the
   * array order already equals draw order.
   */
  render(env: RenderEnv, drawings: Drawing[], opts: RenderOptions): void {
    for (const d of drawings) {
      if (!d.visible) continue;
      if (this.isFutureLocked(d, opts)) continue;
      const isSelected = d.id === opts.selectedId;
      const isHovered = d.id === opts.hoveredId && !isSelected;
      this.renderOne(env, d, { ...opts, isSelected, isHovered });
    }
  }

  /** Draft preview — dashed, plus anchor handles. */
  renderDraft(env: RenderEnv, d: Drawing, opts: RenderOptions): void {
    this.renderOne(env, d, { ...opts, isDraft: true, isSelected: true, isHovered: false });
  }

  renderSnapIndicator(env: RenderEnv, x: number, y: number, target: SnapTarget): void {
    if (target === 'none') return;
    const ctx = env.ctx;
    ctx.save();
    ctx.strokeStyle = '#4f8cff';
    ctx.fillStyle = 'rgba(79, 140, 255, 0.4)';
    ctx.lineWidth = 1.5;
    const r = 5.5;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Target label (O, H, L, C, etc.)
    const tag = target.toUpperCase();
    if (tag.length <= 5) {
      chip(ctx, env.w, x + 8, y - 7, tag, '#4f8cff', 'left', '#ffffff');
    }
    ctx.restore();
  }

  renderHoverCrosshair(env: RenderEnv, x: number, y: number): void {
    const ctx = env.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(79, 140, 255, 0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(env.w, y);
    ctx.stroke();

    // Vertical line
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, env.h);
    ctx.stroke();

    ctx.restore();
  }

  private isFutureLocked(d: Drawing, opts: RenderOptions): boolean {
    if (opts.revealTime === null) return false;
    if (d.type === 'horizontalLine') return false;
    const revealTime = opts.revealTime;
    return d.points.some((p) => p.time > revealTime);
  }

  private renderOne(
    env: RenderEnv,
    d: Drawing,
    opts: RenderOptions & { isSelected?: boolean; isHovered?: boolean; isDraft?: boolean },
  ): void {
    const ctx = env.ctx;
    const isDraft = opts.isDraft ?? false;
    const highlight = opts.isSelected || opts.isHovered;
    const lineWidth = isDraft ? 1 : highlight ? Math.max(2, d.style.strokeWidth + 0.75) : d.style.strokeWidth;

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    switch (d.type) {
      case 'trendLine':
      case 'ray':
      case 'extendedLine':
        this.renderLine(env, d, lineWidth, isDraft);
        break;
      case 'horizontalLine':
        this.renderHLine(env, d, lineWidth, isDraft);
        break;
      case 'verticalLine':
        this.renderVLine(env, d, lineWidth, isDraft);
        break;
      case 'fibRetracement':
        this.renderFib(env, d, isDraft);
        break;
      case 'rectangle':
        this.renderRect(env, d, lineWidth, isDraft);
        break;
      case 'circle':
        this.renderCircle(env, d, lineWidth, isDraft);
        break;
      case 'ellipse':
        this.renderEllipse(env, d, lineWidth, isDraft);
        break;
      case 'triangle':
      case 'polygon':
        this.renderPolygon(env, d, lineWidth, isDraft, true);
        break;
      case 'path':
        this.renderPolygon(env, d, lineWidth, isDraft, false);
        break;
      case 'arrow':
        this.renderArrow(env, d, lineWidth, isDraft);
        break;
      case 'text':
        this.renderText(env, d);
        break;
      case 'longPosition':
      case 'shortPosition':
        this.renderPosition(env, d, lineWidth, false);
        break;
      case 'riskReward':
        this.renderPosition(env, d, lineWidth, true);
        break;
      case 'measure':
        this.renderMeasure(env, d, lineWidth);
        break;
      default:
        break;
    }

    if (opts.isSelected && opts.showHandles && !isDraft) {
      this.renderHandles(env, d);
    }
    ctx.restore();
  }

  private screenOf(p: ChartPoint): { x: number; y: number } | null {
    return this.mapper.chartPointToScreen(p);
  }

  private renderLine(env: RenderEnv, d: Drawing, width: number, isDraft: boolean): void {
    const [a, b] = d.points;
    const sa = a ? this.screenOf(a) : null;
    const sb = b ? this.screenOf(b) : null;
    if (!sa || !sb) return;
    const style = d.style;

    if (d.type === 'extendedLine') {
      const clipped = clipLineToRect(sa.x, sa.y, sb.x, sb.y, env.w, env.h);
      if (!clipped || !clipped[0] || !clipped[1]) return;
      drawStrokeLine(env.ctx, clipped[0].x, clipped[0].y, clipped[1].x, clipped[1].y, style, width, isDraft ? 0.6 : 1);
    } else if (d.type === 'ray') {
      const edge = clipRayToRect(sa.x, sa.y, sb.x, sb.y, env.w, env.h);
      if (!edge) return;
      drawStrokeLine(env.ctx, sa.x, sa.y, edge.x, edge.y, style, width, isDraft ? 0.6 : 1);
    } else {
      drawStrokeLine(env.ctx, sa.x, sa.y, sb.x, sb.y, style, width, isDraft ? 0.6 : 1);
    }

    if (!isDraft && d.labels && (d.labels.priceChange || d.labels.percent || d.labels.bars || d.labels.time)) {
      this.renderLineLabels(env, d, sa, sb);
    }
  }

  private renderLineLabels(env: RenderEnv, d: Drawing, sa: { x: number; y: number }, sb: { x: number; y: number }): void {
    const a = d.points[0];
    const b = d.points[1];
    if (!a || !b) return;
    const dec = env.decimals;
    const pct = a.price !== 0 ? ((b.price - a.price) / a.price) * 100 : 0;
    const bars = env.tfSeconds > 0 ? Math.abs(b.time - a.time) / env.tfSeconds : 0;

    // Angle calculation in screen space (positive upwards)
    const rad = Math.atan2(sa.y - sb.y, sb.x - sa.x);
    const deg = Math.round((rad * 180 / Math.PI + 360) % 360);

    const lines: string[] = [];
    if (d.labels?.priceChange) {
      const v = b.price - a.price;
      lines.push(`${v >= 0 ? '+' : ''}${fmtPrice(v, dec)} (${deg}°)`);
    }
    if (d.labels?.percent) {
      lines.push(`${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`);
    }
    if (d.labels?.bars && bars > 0) {
      lines.push(`${Math.round(bars)} bars`);
    }
    if (d.labels?.time && b.time !== a.time) {
      lines.push(fmtDuration(b.time - a.time));
    }
    let y = sb.y - 18;
    for (const line of lines) {
      chip(env.ctx, env.w, sb.x, y, line, hexToRgba(d.style.strokeColor, 0.9), 'center');
      y -= 16;
    }
  }

  private renderHLine(env: RenderEnv, d: Drawing, width: number, isDraft: boolean): void {
    const p = d.points[0];
    if (!p) return;
    const y = this.mapper.priceToY(p.price);
    if (y === null) return;
    drawStrokeLine(env.ctx, 0, y, env.w, y, d.style, width, isDraft ? 0.6 : 1);
    if (!isDraft) {
      chip(env.ctx, env.w, env.w - 2, y - 16, fmtPrice(p.price, env.decimals), hexToRgba(d.style.strokeColor, 0.95), 'right');
    }
  }

  private renderVLine(env: RenderEnv, d: Drawing, width: number, isDraft: boolean): void {
    const p = d.points[0];
    if (!p) return;
    const x = this.mapper.timeToX(p.time);
    if (x === null) return;
    drawStrokeLine(env.ctx, x, 0, x, env.h, d.style, width, isDraft ? 0.6 : 1);
    if (!isDraft) {
      const label = `${new Date(p.time * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      chip(env.ctx, env.w, x, 4, label, hexToRgba(d.style.strokeColor, 0.95), 'center');
    }
  }

  private renderFib(env: RenderEnv, d: Drawing, isDraft: boolean): void {
    const [a, b] = d.points;
    if (!a || !b) return;
    const sa = this.screenOf(a);
    const sb = this.screenOf(b);
    if (!sa || !sb) return;
    const levels = d.fibLevels ?? [0, 0.236, 0.382, 0.5, 0.618, 0.764, 1];
    const ctx = env.ctx;
    ctx.save();
    ctx.setLineDash(isDraft ? [4, 4] : [3, 3]);
    ctx.lineWidth = 1;
    const p0 = a.price;
    const p1 = b.price;
    for (const ratio of levels) {
      const price = p0 + (p1 - p0) * ratio;
      const y = this.mapper.priceToY(price);
      if (y === null) continue;
      ctx.strokeStyle = hexToRgba(d.style.strokeColor, isDraft ? 0.4 : 0.45);
      ctx.beginPath();
      ctx.moveTo(sa.x, y);
      ctx.lineTo(sb.x, y);
      ctx.stroke();
      const pct = (ratio * 100).toFixed(1);
      chip(ctx, env.w, sa.x + 2, y - 9, `${pct}%`, hexToRgba(d.style.strokeColor, 0.9), 'left');
      chip(ctx, env.w, env.w - 2, y - 9, fmtPrice(price, env.decimals), hexToRgba(d.style.strokeColor, 0.9), 'right');
    }
    ctx.setLineDash([]);
    ctx.lineWidth = isDraft ? 1 : 1.5;
    ctx.strokeStyle = d.style.strokeColor;
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
    ctx.restore();
  }

  private fillShape(ctx: CanvasRenderingContext2D, style: DrawingStyle, drawPath: () => void): void {
    ctx.save();
    ctx.fillStyle = hexToRgba(style.fillColor, style.fillOpacity);
    ctx.beginPath();
    drawPath();
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private renderRect(env: RenderEnv, d: Drawing, width: number, isDraft: boolean): void {
    const [a, b] = d.points;
    if (!a || !b) return;
    const sa = this.screenOf(a);
    const sb = this.screenOf(b);
    if (!sa || !sb) return;
    const ctx = env.ctx;
    const x = Math.min(sa.x, sb.x);
    const y = Math.min(sa.y, sb.y);
    const w = Math.abs(sb.x - sa.x);
    const h = Math.abs(sb.y - sa.y);
    if (d.style.fillOpacity > 0 && w > 0 && h > 0) {
      this.fillShape(ctx, d.style, () => ctx.rect(x, y, w, h));
    }
    ctx.strokeStyle = d.style.strokeColor;
    ctx.lineWidth = width;
    ctx.setLineDash(isDraft ? [4, 4] : []);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    if (!isDraft && d.labels?.price) {
      chip(env.ctx, env.w, sb.x, sb.y - 16, fmtPrice(sb.y <= sa.y ? a.price : b.price, env.decimals), hexToRgba(d.style.strokeColor, 0.9), 'center');
    }
  }

  private renderCircle(env: RenderEnv, d: Drawing, width: number, isDraft: boolean): void {
    const [c, r] = d.points;
    const sc = c ? this.screenOf(c) : null;
    const sr = r ? this.screenOf(r) : null;
    if (!sc || !sr) return;
    const ctx = env.ctx;
    const rad = dist(sc.x, sc.y, sr.x, sr.y);
    if (d.style.fillOpacity > 0 && rad > 0) {
      this.fillShape(ctx, d.style, () => ctx.arc(sc.x, sc.y, rad, 0, Math.PI * 2));
    }
    ctx.beginPath();
    ctx.arc(sc.x, sc.y, rad, 0, Math.PI * 2);
    setStroke(ctx, d.style, width, isDraft ? 0.6 : 1);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!isDraft && d.showRadius) {
      const p0 = d.points[0];
      const p1 = d.points[1];
      if (p0 && p1) {
        const radPrice = Math.abs(p1.price - p0.price);
        chip(env.ctx, env.w, sc.x, sc.y - rad - 18, `r ${fmtPrice(radPrice, env.decimals)}`, hexToRgba(d.style.strokeColor, 0.9), 'center');
      }
    }
  }

  private renderEllipse(env: RenderEnv, d: Drawing, width: number, isDraft: boolean): void {
    const [a, b] = d.points;
    const sa = a ? this.screenOf(a) : null;
    const sb = b ? this.screenOf(b) : null;
    if (!sa || !sb) return;
    const ctx = env.ctx;
    const cx = (sa.x + sb.x) / 2;
    const cy = (sa.y + sb.y) / 2;
    const rx = Math.abs(sb.x - sa.x) / 2;
    const ry = Math.abs(sb.y - sa.y) / 2;
    if (rx <= 0 || ry <= 0) return;
    if (d.style.fillOpacity > 0) {
      this.fillShape(ctx, d.style, () => ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2));
    }
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    setStroke(ctx, d.style, width, isDraft ? 0.6 : 1);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private renderPolygon(env: RenderEnv, d: Drawing, width: number, isDraft: boolean, closed: boolean): void {
    const pts = d.points
      .map((p) => this.screenOf(p))
      .filter((s): s is { x: number; y: number } => s !== null);
    if (pts.length < 2 || !pts[0]) return;
    const ctx = env.ctx;
    if (d.style.fillOpacity > 0 && pts.length >= 3) {
      this.fillShape(ctx, d.style, () => {
        ctx.moveTo(pts[0]!.x, pts[0]!.y);
        for (let i = 1; i < pts.length; i++) {
          if (pts[i]) ctx.lineTo(pts[i]!.x, pts[i]!.y);
        }
      });
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      if (pts[i]) ctx.lineTo(pts[i]!.x, pts[i]!.y);
    }
    if (closed) ctx.closePath();
    setStroke(ctx, d.style, width, isDraft ? 0.6 : 1);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private renderArrow(env: RenderEnv, d: Drawing, width: number, isDraft: boolean): void {
    const [a, b] = d.points;
    const sa = a ? this.screenOf(a) : null;
    const sb = b ? this.screenOf(b) : null;
    if (!sa || !sb) return;
    const ctx = env.ctx;
    drawStrokeLine(ctx, sa.x, sa.y, sb.x, sb.y, d.style, width, isDraft ? 0.6 : 1);
    const size = d.data?.arrowheadSize ?? 10;
    const ang = Math.atan2(sb.y - sa.y, sb.x - sa.x);
    const head = size * (d.style.strokeWidth / 1.5 + 0.4);
    ctx.beginPath();
    ctx.moveTo(sb.x, sb.y);
    ctx.lineTo(sb.x - head * Math.cos(ang - Math.PI / 6), sb.y - head * Math.sin(ang - Math.PI / 6));
    ctx.lineTo(sb.x - head * Math.cos(ang + Math.PI / 6), sb.y - head * Math.sin(ang + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = isDraft ? hexToRgba(d.style.strokeColor, 0.6) : d.style.strokeColor;
    ctx.fill();
  }

  private renderText(env: RenderEnv, d: Drawing): void {
    const p = d.points[0];
    const s = p ? this.screenOf(p) : null;
    if (!s || !d.text) return;
    const ctx = env.ctx;
    const fontPx = d.style.fontSize;
    ctx.save();
    ctx.font = `${fontPx}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    const lines = d.text.split('\n');
    const maxW = Math.max(...lines.map((l) => ctx.measureText(l).width), 10);
    const lineH = fontPx + 3;
    const padX = 5;
    const padY = 4;
    const totalH = lines.length * lineH + padY * 2;
    const bg = hexToRgba(d.style.fillColor, Math.max(d.style.fillOpacity, 0.35));
    ctx.fillStyle = bg;
    ctx.fillRect(s.x - maxW / 2 - padX, s.y - padY, maxW + padX * 2, totalH);
    ctx.strokeStyle = hexToRgba(d.style.strokeColor, 0.8);
    ctx.lineWidth = 1;
    ctx.strokeRect(s.x - maxW / 2 - padX, s.y - padY, maxW + padX * 2, totalH);
    ctx.fillStyle = d.style.textColor;
    ctx.textAlign = 'center';
    lines.forEach((line, i) => {
      ctx.fillText(line, s.x, s.y + i * lineH + fontPx + padY - 2);
    });
    ctx.restore();
  }

  private renderPosition(env: RenderEnv, d: Drawing, width: number, withRiskInputs: boolean): void {
    const pts = d.points
      .map((p) => this.screenOf(p))
      .filter((s): s is { x: number; y: number } => s !== null);
    if (pts.length < 3 || !pts[0] || !pts[1] || !pts[2] || !d.points[0] || !d.points[1] || !d.points[2]) return;
    const [entryS, stopS, targetS] = pts;
    const ctx = env.ctx;
    const x0 = Math.min(entryS.x, stopS.x, targetS.x);
    const x1 = Math.max(entryS.x, stopS.x, targetS.x);

    const isLong = d.type !== 'shortPosition';
    const entry = d.points[0].price;
    const stop = d.points[1].price;
    const target = d.points[2].price;
    const risk = Math.abs(entry - stop);
    const reward = Math.abs(target - entry);
    const rr = risk > 0 ? reward / risk : null;

    // Zone fills (reward = green, risk = red).
    const zone = (a: number, b: number): { y0: number; y1: number } => {
      const ya = this.mapper.priceToY(a);
      const yb = this.mapper.priceToY(b);
      if (ya === null || yb === null) return { y0: 0, y1: 0 };
      return { y0: Math.min(ya, yb), y1: Math.max(ya, yb) };
    };
    const rewardZone = zone(isLong ? entry : target, isLong ? target : entry);
    const riskZone = zone(isLong ? stop : entry, isLong ? entry : stop);
    ctx.save();
    ctx.fillStyle = 'rgba(34, 197, 94, 0.10)';
    ctx.fillRect(x0, rewardZone.y0, x1 - x0, rewardZone.y1 - rewardZone.y0);
    ctx.fillStyle = 'rgba(239, 68, 68, 0.10)';
    ctx.fillRect(x0, riskZone.y0, x1 - x0, riskZone.y1 - riskZone.y0);

    const hline = (y: number, color: string, widthPx: number, dash: number[]): void => {
      ctx.strokeStyle = color;
      ctx.lineWidth = widthPx;
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    hline(entryS.y, d.style.strokeColor, width, []);
    hline(stopS.y, '#ef4444', 1, [4, 4]);
    hline(targetS.y, '#22c55e', 1, [4, 4]);

    const cy0 = Math.min(entryS.y, stopS.y, targetS.y) - 18;
    chip(ctx, env.w, x0, cy0, `Entry ${fmtPrice(entry, env.decimals)}`, hexToRgba(d.style.strokeColor, 0.92), 'left');
    chip(ctx, env.w, x0, cy0 - 16, `SL ${fmtPrice(stop, env.decimals)}`, 'rgba(239,68,68,0.92)', 'left');
    chip(ctx, env.w, x0, cy0 - 32, `TP ${fmtPrice(target, env.decimals)}`, 'rgba(34,197,94,0.92)', 'left');

    const riskTxt = `Risk ${fmtPrice(risk, env.decimals)}`;
    const rewardTxt = `Reward ${fmtPrice(reward, env.decimals)}`;
    const rrTxt = rr !== null ? `R:R ${rr.toFixed(2)}` : 'R:R —';
    if (withRiskInputs && d.risk) {
      const accountSize = d.risk.accountSize;
      const riskPct = d.risk.riskPct;
      const riskAmount = accountSize * (riskPct / 100);
      const posSize = risk > 0 ? riskAmount / risk : 0;
      const lines = [
        `Risk $${riskAmount.toFixed(2)} (${riskPct}% of $${accountSize.toLocaleString('en-US')})`,
        `Reward ${rr !== null ? '$' + (riskAmount * rr).toFixed(2) : '—'}`,
        rrTxt,
        `Position size ${posSize.toFixed(4)}`,
      ];
      lines.forEach((line, i) => {
        chip(ctx, env.w, x1, cy0 - 32 - i * 16, line, hexToRgba(d.style.strokeColor, 0.92), 'right');
      });
    } else {
      chip(ctx, env.w, x1, cy0, riskTxt, 'rgba(239,68,68,0.92)', 'right');
      chip(ctx, env.w, x1, cy0 - 16, rewardTxt, 'rgba(34,197,94,0.92)', 'right');
      chip(ctx, env.w, x1, cy0 - 32, rrTxt, hexToRgba(d.style.strokeColor, 0.92), 'right');
    }
    ctx.restore();
  }

  private renderMeasure(env: RenderEnv, d: Drawing, width: number): void {
    const [a, b] = d.points;
    if (!a || !b) return;
    const sa = this.screenOf(a);
    const sb = this.screenOf(b);
    if (!sa || !sb) return;
    drawStrokeLine(env.ctx, sa.x, sa.y, sb.x, sb.y, d.style, width, 1);
    const delta = b.price - a.price;
    const pct = a.price !== 0 ? (delta / a.price) * 100 : 0;
    const bars = env.tfSeconds > 0 ? Math.abs(b.time - a.time) / env.tfSeconds : 0;
    const ctx = env.ctx;
    const color = delta >= 0 ? 'rgba(34,197,94,0.92)' : 'rgba(239,68,68,0.92)';
    let y = sb.y - 18;
    chip(ctx, env.w, sb.x, y, `${delta >= 0 ? '+' : ''}${fmtPrice(delta, env.decimals)}`, color, 'center');
    y -= 16;
    chip(ctx, env.w, sb.x, y, `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`, color, 'center');
    if (bars > 0) {
      y -= 16;
      chip(ctx, env.w, sb.x, y, `${Math.round(bars)} bars`, hexToRgba(d.style.strokeColor, 0.92), 'center');
    }
    y -= 16;
    chip(ctx, env.w, sb.x, y, fmtDuration(b.time - a.time), hexToRgba(d.style.strokeColor, 0.92), 'center');
  }

  private renderHandles(env: RenderEnv, d: Drawing): void {
    const handles = drawingHandles(this.mapper, env.w, env.h, d);
    const ctx = env.ctx;
    for (const h of handles) {
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = d.style.strokeColor;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.rect(h.x - 4, h.y - 4, 8, 8);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
}
