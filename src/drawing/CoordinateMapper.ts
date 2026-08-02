import type { IChartApiBase, ISeriesApi, Logical, Time } from 'lightweight-charts';
import type { ChartPoint } from './types';

/**
 * Sole bridge between chart space (time + price) and the plot-area screen
 * space (pixels). All conversions route through the chart/time-scale/series
 * APIs so drawings stay correct through zoom, pan, resize and replay.
 *
 * `timeToLogical`/`logicalToTime` fall back to a bar-interval extrapolation
 * when a time lies outside the currently loaded data, which lets rays and
 * extended lines extend past the right edge of the dataset cleanly.
 */
export class CoordinateMapper {
  private chart: IChartApiBase<Time> | null = null;
  private series: ISeriesApi<'Candlestick'> | null = null;
  private times: number[] = [];
  private tf = 0;
  private offscreen = 1e7;

  setChart(chart: IChartApiBase<Time> | null): void {
    this.chart = chart;
  }

  setSeries(series: ISeriesApi<'Candlestick'> | null): void {
    this.series = series;
  }

  /** `tf` is the bar interval in seconds (0 when unknown). */
  setData(times: number[], tf: number): void {
    this.times = times;
    this.tf = tf;
  }

  hasData(): boolean {
    return this.chart !== null && this.series !== null;
  }

  timeToX(time: number): number | null {
    if (!this.chart) return null;
    const direct = this.chart.timeScale().timeToCoordinate(time as Time);
    if (direct !== null) return direct;
    const L = this.timeToLogical(time);
    if (L === null) return null;
    const coord = this.chart.timeScale().logicalToCoordinate(L as Logical);
    if (coord !== null) return coord;
    // Off the right/left of the visible range entirely.
    const n = this.times.length;
    if (n === 0) return null;
    const last = this.times[n - 1];
    if (last === undefined) return null;
    return time > last ? this.offscreen : -this.offscreen;
  }

  xToTime(x: number): number | null {
    if (!this.chart) return null;
    const L = this.chart.timeScale().coordinateToLogical(x);
    if (L === null) return null;
    return this.logicalToTime(L);
  }

  priceToY(price: number): number | null {
    if (!this.series) return null;
    return this.series.priceToCoordinate(price);
  }

  yToPrice(y: number): number | null {
    if (!this.series) return null;
    return this.series.coordinateToPrice(y);
  }

  chartPointToScreen(p: ChartPoint): { x: number; y: number } | null {
    const x = this.timeToX(p.time);
    const y = this.priceToY(p.price);
    if (x === null || y === null) return null;
    return { x, y };
  }

  screenToChartPoint(x: number, y: number): ChartPoint | null {
    const time = this.xToTime(x);
    const price = this.yToPrice(y);
    if (time === null || price === null) return null;
    return { time, price };
  }

  timeToLogical(time: number): number | null {
    const n = this.times.length;
    if (n === 0) return null;
    const first = this.times[0];
    const last = this.times[n - 1];
    if (first === undefined || last === undefined) return null;
    if (time <= first) return this.tf > 0 ? (time - first) / this.tf : 0;
    if (time >= last) return this.tf > 0 ? n - 1 + (time - last) / this.tf : n - 1;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const t = this.times[mid];
      if (t === undefined) break;
      if (t < time) lo = mid + 1;
      else hi = mid;
    }
    const right = this.times[lo];
    const left = this.times[Math.max(0, lo - 1)];
    if (left === undefined || right === undefined) return lo;
    if (right === time) return lo;
    const span = right - left;
    if (span <= 0) return lo;
    return lo - 1 + (time - left) / span;
  }

  logicalToTime(L: number): number | null {
    const n = this.times.length;
    if (n === 0) return null;
    const first = this.times[0];
    if (first === undefined) return null;
    if (L < 0) return this.tf > 0 ? first + L * this.tf : first;
    if (L >= n - 1) {
      const last = this.times[n - 1];
      if (last === undefined) return null;
      if (this.tf > 0) return last + (L - (n - 1)) * this.tf;
      return last;
    }
    const lo = Math.floor(L);
    const frac = L - lo;
    const t0 = this.times[lo];
    const t1 = this.times[lo + 1];
    if (t0 === undefined || t1 === undefined) return null;
    return t0 + (t1 - t0) * frac;
  }
}
