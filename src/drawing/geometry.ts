import type { ChartPoint } from './types';

/**
 * Pure computational geometry shared by the renderer, the hit tester and the
 * path simplifier. Everything here works in screen space (pixels).
 */

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

/** Distance from point (px,py) to the segment (x0,y0)-(x1,y1). */
export function distToSegment(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x0, py - y0);
  let t = ((px - x0) * dx + (py - y0) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

/** Distance from a point to a polyline (no closing edge). */
export function distToPolyline(
  px: number,
  py: number,
  pts: ReadonlyArray<[number, number]>,
): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (!a || !b) continue;
    const d = distToSegment(px, py, a[0], a[1], b[0], b[1]);
    if (d < best) best = d;
  }
  return best;
}

/** Distance from a point to a closed polygon (0 when inside). */
export function distToPolygon(px: number, py: number, pts: ReadonlyArray<[number, number]>): number {
  if (pts.length >= 3 && pointInPolygon(px, py, pts)) return 0;
  const first = pts[0];
  return distToPolyline(px, py, pts.length > 1 && first ? [...pts, first] : pts);
}

/** Ray-casting point-in-polygon test. */
export function pointInPolygon(px: number, py: number, pts: ReadonlyArray<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (!a || !b) continue;
    const xi = a[0];
    const yi = a[1];
    const xj = b[0];
    const yj = b[1];
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Distance to an axis-aligned rectangle (0 inside). */
export function distToRect(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  if (px >= minX && px <= maxX && py >= minY && py <= maxY) return 0;
  const dx = Math.max(minX - px, 0, px - maxX);
  const dy = Math.max(minY - py, 0, py - maxY);
  return Math.hypot(dx, dy);
}

/** Distance to a circle's edge (|distance to centre − radius|). */
export function distToCircleEdge(px: number, py: number, cx: number, cy: number, r: number): number {
  return Math.abs(dist(px, py, cx, cy) - r);
}

/**
 * Distance to the edge of an axis-aligned ellipse (screen space).
 * Uses the ellipse equation sampled along the nearest direction.
 */
export function distToEllipseEdge(
  px: number,
  py: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): number {
  if (rx <= 0 || ry <= 0) return dist(px, py, cx, cy);
  const dx = (px - cx) / rx;
  const dy = (py - cy) / ry;
  const d = Math.hypot(dx, dy);
  if (d <= 0.0001) return Math.min(rx, ry);
  const nxp = cx + (dx / d) * rx;
  const nyp = cy + (dy / d) * ry;
  return dist(px, py, nxp, nyp);
}

/**
 * Clip a ray from (x0,y0) through (x1,y1) to the rect [0,w]x[0,h].
 * Returns the exit point or null when the ray never reaches the rect.
 */
export function clipRayToRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  h: number,
): { x: number; y: number } | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (dx === 0 && dy === 0) return null;
  const hits: number[] = [];
  if (dx !== 0) {
    if (dx > 0 && x0 < w) hits.push((w - x0) / dx);
    if (dx < 0 && x0 > 0) hits.push(-x0 / dx);
  }
  if (dy !== 0) {
    if (dy > 0 && y0 < h) hits.push((h - y0) / dy);
    if (dy < 0 && y0 > 0) hits.push(-y0 / dy);
  }
  let best: number | null = null;
  for (const t of hits) {
    if (t <= 0.00001) continue;
    const ex = x0 + dx * t;
    const ey = y0 + dy * t;
    if (ex < -0.5 || ex > w + 0.5 || ey < -0.5 || ey > h + 0.5) continue;
    if (best === null || t < best) best = t;
  }
  if (best === null) return null;
  return { x: x0 + dx * best, y: y0 + dy * best };
}

/**
 * Clip an infinite line (through two points) to the rect [0,w]x[0,h].
 * Returns the two clipped endpoints or null when no part is visible.
 * Uses the Liang–Barsky algorithm.
 */
export function clipLineToRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  h: number,
): { x: number; y: number }[] | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - 0, w - x0, y0 - 0, h - y0];
  let u1 = -Infinity;
  let u2 = Infinity;
  for (let i = 0; i < 4; i++) {
    const pi = p[i]!;
    const qi = q[i]!;
    if (pi === 0) {
      if (qi < 0) return null;
    } else {
      const r = qi / pi;
      if (pi < 0) u1 = Math.max(u1, r);
      else u2 = Math.min(u2, r);
    }
  }
  if (u1 > u2) return null;
  const p0 = { x: x0 + dx * u1, y: y0 + dy * u1 };
  const p1 = { x: x0 + dx * u2, y: y0 + dy * u2 };
  return [p0, p1];
}

/** Bounding box of screen points. */
export function bboxOfScreenPts(pts: ReadonlyArray<[number, number]>): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Ramer–Douglas–Peucker polyline simplification.
 * Keeps the first and last points, drops points within `epsilon` of the
 * chord — perfect for taming freehand paths.
 */
export function simplifyRdp(
  pts: ReadonlyArray<[number, number]>,
  epsilon: number,
): Array<[number, number]> {
  if (pts.length <= 2) return [...pts];
  let maxDist = 0;
  let index = 0;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (!first || !last) return [...pts];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    if (!p) continue;
    const d = distToSegment(p[0], p[1], first[0], first[1], last[0], last[1]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > epsilon) {
    const left = simplifyRdp(pts.slice(0, index + 1), epsilon);
    const right = simplifyRdp(pts.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

/** Convert chart points to screen pixel pairs via a coordinate mapper. */
export function toScreenPts(
  points: ChartPoint[],
  map: (p: ChartPoint) => { x: number; y: number } | null,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const p of points) {
    const s = map(p);
    if (s !== null) out.push([s.x, s.y]);
  }
  return out;
}
