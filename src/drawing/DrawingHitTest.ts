import type { CoordinateMapper } from './CoordinateMapper';
import {
  clipLineToRect,
  clipRayToRect,
  dist,
  distToCircleEdge,
  distToEllipseEdge,
  distToPolygon,
  distToPolyline,
  distToRect,
  distToSegment,
  toScreenPts,
} from './geometry';
import type { Drawing } from './types';

export const HANDLE_HIT_RADIUS = 7;
export const LINE_HIT_TOLERANCE = 5;

export type HandleId = 'move' | number;

export interface HitResult {
  id: string;
  handle: HandleId;
}

/**
 * Screen-space handle positions for a drawing. The handle numbering is the
 * contract between the hit tester and the engine's resize logic:
 *
 *  - line tools / measure / arrow / fib: 0,1  → the two anchors
 *  - rectangle / ellipse: 0-3 corners (TL,TR,BR,BL) + 4-7 edges (T,R,B,L)
 *  - circle: 0 center, 1 radius point
 *  - polygon / path / triangle: 0..n-1 vertices
 *  - horizontal / vertical line: 0 and 1 (both move the line)
 *  - text: 0 (move)
 *  - position tools: 0 entry, 1 stop, 2 target
 */
export function drawingHandles(
  mapper: CoordinateMapper,
  w: number,
  h: number,
  d: Drawing,
): Array<{ x: number; y: number }> {
  const screen = (p: { time: number; price: number }) => mapper.chartPointToScreen(p);
  switch (d.type) {
    case 'horizontalLine': {
      const p = d.points[0];
      const y = p ? mapper.priceToY(p.price) : null;
      if (y === null) return [];
      return [
        { x: 0, y },
        { x: w, y },
      ];
    }
    case 'verticalLine': {
      const p = d.points[0];
      const x = p ? mapper.timeToX(p.time) : null;
      if (x === null) return [];
      return [
        { x, y: 0 },
        { x, y: h },
      ];
    }
    case 'rectangle':
    case 'ellipse': {
      const [a, b] = d.points;
      const sa = a ? screen(a) : null;
      const sb = b ? screen(b) : null;
      if (!sa || !sb) return [];
      const minX = Math.min(sa.x, sb.x);
      const maxX = Math.max(sa.x, sb.x);
      const minY = Math.min(sa.y, sb.y);
      const maxY = Math.max(sa.y, sb.y);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      return [
        { x: minX, y: minY }, // TL
        { x: maxX, y: minY }, // TR
        { x: maxX, y: maxY }, // BR
        { x: minX, y: maxY }, // BL
        { x: cx, y: minY }, // T
        { x: maxX, y: cy }, // R
        { x: cx, y: maxY }, // B
        { x: minX, y: cy }, // L
      ];
    }
    case 'circle': {
      const [c, r] = d.points;
      const sc = c ? screen(c) : null;
      const sr = r ? screen(r) : null;
      if (!sc || !sr) return [];
      const rad = dist(sc.x, sc.y, sr.x, sr.y);
      if (rad <= 0) return [sc];
      // radius handle sits on the circle at the anchor's bearing from centre.
      const ang = Math.atan2(sr.y - sc.y, sr.x - sc.x);
      return [sc, { x: sc.x + Math.cos(ang) * rad, y: sc.y + Math.sin(ang) * rad }];
    }
    case 'text': {
      const p = d.points[0];
      const s = p ? screen(p) : null;
      return s ? [s] : [];
    }
    default:
      return d.points.map((p) => screen(p)).filter((s): s is { x: number; y: number } => s !== null);
  }
}

export class DrawingHitTester {
  constructor(
    private readonly mapper: CoordinateMapper,
    private readonly getDrawings: () => Drawing[],
    private readonly getSelectedId: () => string | null,
  ) {}

  /**
   * Geometry-based hit test. Priority: selected drawing's handles → selected
   * drawing's body → top-most drawing (reverse layer order) → others.
   */
  hit(x: number, y: number, w: number, h: number): HitResult | null {
    const drawings = this.drawings;
    const selectedId = this.getSelectedId();

    // 1. Handles of the selected drawing.
    if (selectedId) {
      const sel = drawings.find((d) => d.id === selectedId);
      if (sel) {
        const handle = this.hitHandles(sel, x, y, w, h);
        if (handle !== null) return { id: sel.id, handle };
      }
    }

    // 2. Selected drawing's body.
    if (selectedId) {
      const sel = drawings.find((d) => d.id === selectedId);
      if (sel && this.hitBody(sel, x, y, w, h)) {
        return { id: sel.id, handle: 'move' };
      }
    }

    // 3. Every other drawing, top-most first.
    for (let i = drawings.length - 1; i >= 0; i--) {
      const d = drawings[i];
      if (!d || d.id === selectedId || !d.visible) continue;
      const handle = this.hitHandles(d, x, y, w, h);
      if (handle !== null) return { id: d.id, handle };
      if (this.hitBody(d, x, y, w, h)) return { id: d.id, handle: 'move' };
    }

    return null;
  }

  private hitHandles(d: Drawing, x: number, y: number, w: number, h: number): number | null {
    const handles = drawingHandles(this.mapper, w, h, d);
    let best: number | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < handles.length; i++) {
      const hp = handles[i];
      if (!hp) continue;
      const dd = Math.hypot(x - hp.x, y - hp.y);
      if (dd <= HANDLE_HIT_RADIUS && dd < bestDist) {
        bestDist = dd;
        best = i;
      }
    }
    return best;
  }

  private hitBody(d: Drawing, x: number, y: number, w: number, h: number): boolean {
    const pts = toScreenPts(d.points, (p) => this.mapper.chartPointToScreen(p));
    switch (d.type) {
      case 'horizontalLine': {
        const p = d.points[0];
        const py = p ? this.mapper.priceToY(p.price) : null;
        return py !== null && Math.abs(py - y) <= LINE_HIT_TOLERANCE;
      }
      case 'verticalLine': {
        const p = d.points[0];
        const px = p ? this.mapper.timeToX(p.time) : null;
        return px !== null && Math.abs(px - x) <= LINE_HIT_TOLERANCE;
      }
      case 'trendLine':
      case 'ray':
      case 'extendedLine':
      case 'measure':
      case 'fibRetracement':
      case 'arrow': {
        const [a, b] = pts;
        if (!a || !b) return false;
        if (d.type === 'extendedLine') {
          const clipped = this.clipFullLine(d, w, h);
          if (!clipped || !clipped[0] || !clipped[1]) return false;
          return distToSegment(x, y, clipped[0][0], clipped[0][1], clipped[1][0], clipped[1][1]) <= LINE_HIT_TOLERANCE;
        }
        if (d.type === 'ray') {
          const [p0, p1] = pts;
          if (!p0 || !p1) return false;
          const edge = clipRayToRect(p0[0], p0[1], p1[0], p1[1], w, h);
          if (!edge) return false;
          return distToSegment(x, y, p0[0], p0[1], edge.x, edge.y) <= LINE_HIT_TOLERANCE;
        }
        return distToSegment(x, y, a[0], a[1], b[0], b[1]) <= LINE_HIT_TOLERANCE;
      }
      case 'rectangle': {
        const [a, b] = pts;
        if (!a || !b) return false;
        return distToRect(x, y, a[0], a[1], b[0], b[1]) <= LINE_HIT_TOLERANCE;
      }
      case 'circle': {
        const [c, r] = pts;
        if (!c || !r) return false;
        const rad = dist(c[0], c[1], r[0], r[1]);
        return distToCircleEdge(x, y, c[0], c[1], rad) <= LINE_HIT_TOLERANCE;
      }
      case 'ellipse': {
        const [a, b] = pts;
        if (!a || !b) return false;
        const cx = (a[0] + b[0]) / 2;
        const cy = (a[1] + b[1]) / 2;
        const rx = Math.abs(b[0] - a[0]) / 2;
        const ry = Math.abs(b[1] - a[1]) / 2;
        return distToEllipseEdge(x, y, cx, cy, rx, ry) <= LINE_HIT_TOLERANCE;
      }
      case 'triangle':
      case 'polygon': {
        if (pts.length < 3) return false;
        return distToPolygon(x, y, pts) <= LINE_HIT_TOLERANCE;
      }
      case 'path': {
        if (pts.length < 2) return false;
        return distToPolyline(x, y, pts) <= LINE_HIT_TOLERANCE;
      }
      case 'text': {
        const p = d.points[0];
        const s = p ? this.mapper.chartPointToScreen(p) : null;
        if (!s) return false;
        const fontPx = d.style.fontSize;
        const text = d.text ?? '';
        const wpx = Math.max(20, text.length * fontPx * 0.6);
        const hpx = fontPx + 6;
        return Math.abs(x - s.x) <= wpx / 2 && Math.abs(y - s.y) <= hpx / 2;
      }
      case 'longPosition':
      case 'shortPosition':
      case 'riskReward': {
        if (pts.length < 3) return false;
        return distToPolygon(x, y, pts.slice(0, 3)) <= LINE_HIT_TOLERANCE;
      }
      default:
        return false;
    }
  }

  private clipFullLine(d: Drawing, w: number, h: number): Array<[number, number]> | null {
    const [a, b] = toScreenPts(d.points, (p) => this.mapper.chartPointToScreen(p));
    if (!a || !b) return null;
    const clipped = clipLineToRect(a[0], a[1], b[0], b[1], w, h);
    if (!clipped) return null;
    return clipped.map((p) => [p.x, p.y] as [number, number]);
  }

  private get drawings(): Drawing[] {
    return this.getDrawings();
  }
}
