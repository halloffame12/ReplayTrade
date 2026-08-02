import type { Candle } from '../types/market';
import type { CoordinateMapper } from './CoordinateMapper';
import type { ChartPoint, Drawing, MagnetMode, SnapResult, SnapTarget } from './types';

/**
 * TradingView-style "smart magnet".
 *
 * weak  – snap only when the pointer is within a small screen threshold of a
 *         candle O/H/L/C (plus body / centre) or another drawing's anchor.
 * strong– always snap the price to the nearest candle O/H/L/C and the time to
 *         the nearest bar.
 * off   – raw coordinates, no magnet.
 */
export class SnapEngine {
  private thresholdPx = 7;

  constructor(
    private readonly mapper: CoordinateMapper,
    private readonly getCandles: () => Candle[],
    private readonly getDrawings: () => Drawing[],
  ) {}

  setThresholdPx(px: number): void {
    this.thresholdPx = px;
  }

  snap(raw: ChartPoint, mode: MagnetMode): SnapResult {
    if (mode === 'off') return { point: raw, target: 'none', snapped: false };

    const candleSnap = this.snapToCandle(raw, mode);
    if (mode === 'strong') {
      return candleSnap;
    }

    const drawingSnap = this.snapToDrawings(raw);
    if (drawingSnap.snapped && candleSnap.snapped) {
      // Prefer the closer magnet (fewer jumps while drawing).
      const dC = this.screenDist(raw, candleSnap.point);
      const dD = this.screenDist(raw, drawingSnap.point);
      return dD < dC ? drawingSnap : candleSnap;
    }
    if (drawingSnap.snapped) return drawingSnap;
    if (candleSnap.snapped) return candleSnap;
    return { point: raw, target: 'none', snapped: false };
  }

  private snapToCandle(raw: ChartPoint, mode: MagnetMode): SnapResult {
    const i = this.nearestCandleIndex(raw.time);
    if (i < 0) return { point: raw, target: 'none', snapped: false };
    const c = this.candles[i];
    if (!c) return { point: raw, target: 'none', snapped: false };

    const cy = this.mapper.priceToY(raw.price);
    if (cy === null) return { point: raw, target: 'none', snapped: false };

    const body = (c.open + c.close) / 2;
    const center = (c.high + c.low) / 2;
    const candidates: { value: number; target: SnapTarget }[] = [
      { value: c.open, target: 'open' },
      { value: c.high, target: 'high' },
      { value: c.low, target: 'low' },
      { value: c.close, target: 'close' },
      { value: body, target: 'body' },
      { value: center, target: 'center' },
    ];

    let best: { value: number; target: SnapTarget } | null = null;
    let bestDist = Infinity;
    for (const cand of candidates) {
      const vy = this.mapper.priceToY(cand.value);
      if (vy === null) continue;
      const d = Math.abs(vy - cy);
      if (d < bestDist) {
        bestDist = d;
        best = cand;
      }
    }
    if (!best) return { point: raw, target: 'none', snapped: false };

    const price = best.value;
    let time = raw.time;
    let target: SnapTarget = best.target;

    if (mode === 'strong') {
      time = c.time;
    } else if (Math.abs(bestDist) > this.thresholdPx) {
      return { point: raw, target: 'none', snapped: false };
    }

    // In strong mode time snaps to the bar, otherwise only when close.
    if (mode === 'strong') {
      return { point: { time: c.time, price }, target, snapped: true };
    }

    const tx = this.mapper.timeToX(raw.time);
    const bx = this.mapper.timeToX(c.time);
    if (tx !== null && bx !== null && Math.abs(tx - bx) <= this.thresholdPx) {
      time = c.time;
    }

    return { point: { time, price }, target, snapped: true };
  }

  private snapToDrawings(raw: ChartPoint): SnapResult {
    const rx = this.mapper.timeToX(raw.time);
    const ry = this.mapper.priceToY(raw.price);
    if (rx === null || ry === null) return { point: raw, target: 'none', snapped: false };

    let best: { x: number; y: number; target: SnapTarget } | null = null;
    let bestDist = Infinity;

    for (const d of this.drawings) {
      if (!d.visible) continue;
      if (d.type === 'horizontalLine') {
        const p = d.points[0];
        if (!p) continue;
        const y = this.mapper.priceToY(p.price);
        if (y === null) continue;
        const dd = Math.abs(ry - y);
        if (dd < bestDist) {
          bestDist = dd;
          best = { x: rx, y, target: 'hline' };
        }
        continue;
      }
      if (d.type === 'verticalLine') {
        const p = d.points[0];
        if (!p) continue;
        const x = this.mapper.timeToX(p.time);
        if (x === null) continue;
        const dd = Math.abs(rx - x);
        if (dd < bestDist) {
          bestDist = dd;
          best = { x, y: ry, target: 'vline' };
        }
        continue;
      }
      for (const pt of d.points) {
        const s = this.mapper.chartPointToScreen(pt);
        if (s === null) continue;
        const dd = Math.hypot(rx - s.x, ry - s.y);
        if (dd < bestDist) {
          bestDist = dd;
          best = { x: s.x, y: s.y, target: 'point' };
        }
      }
    }

    if (!best || bestDist > this.thresholdPx) {
      return { point: raw, target: 'none', snapped: false };
    }
    const time = this.mapper.xToTime(best.x);
    const price = this.mapper.yToPrice(best.y);
    if (time === null || price === null) return { point: raw, target: 'none', snapped: false };
    return { point: { time, price }, target: best.target, snapped: true };
  }

  private screenDist(a: ChartPoint, b: ChartPoint): number {
    const ax = this.mapper.timeToX(a.time);
    const ay = this.mapper.priceToY(a.price);
    const bx = this.mapper.timeToX(b.time);
    const by = this.mapper.priceToY(b.price);
    if (ax === null || ay === null || bx === null || by === null) return Infinity;
    return Math.hypot(ax - bx, ay - by);
  }

  private get candles(): Candle[] {
    return this.getCandles();
  }

  private get drawings(): Drawing[] {
    return this.getDrawings();
  }

  private nearestCandleIndex(time: number): number {
    const arr = this.candles;
    const n = arr.length;
    if (n === 0) return -1;
    const first = arr[0];
    const last = arr[n - 1];
    if (!first || !last) return -1;
    if (time <= first.time) return 0;
    if (time >= last.time) return n - 1;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      const c = arr[mid];
      if (!c) break;
      if (c.time <= time) lo = mid;
      else hi = mid - 1;
    }
    const c0 = arr[lo];
    const c1 = arr[lo + 1];
    if (c0 && c1 && Math.abs(c1.time - time) < Math.abs(c0.time - time)) {
      return lo + 1;
    }
    return lo;
  }
}
