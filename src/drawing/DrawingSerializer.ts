import type { Candle } from '../types/market';
import { cloneDrawing, DEFAULT_STYLE, isFinitePoint } from './types';
import type { ChartPoint, Drawing, DrawingStyle, DrawingType, MagnetMode } from './types';

/**
 * Versioned, namespaced localStorage persistence.
 *
 * Namespace: `replaytrade:drawings:<symbol>:<timeframe>:<session>`
 * so each symbol × timeframe × replay session keeps its own drawing set.
 * Older un-versioned payloads (the pre-module flat array) are migrated.
 */
export interface SerializedState {
  version: 1;
  drawings: Drawing[];
  magnetMode: MagnetMode;
  style: DrawingStyle;
}

const VERSION = 1;
const KEY_PREFIX = 'replaytrade:drawings';

export function makeStorageKey(symbol: string, timeframe: string, session?: string): string {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'default';
  return `${KEY_PREFIX}:${safe(symbol)}:${safe(timeframe)}:${safe(session ?? 'default')}`;
}

const VALID_TYPES = new Set<DrawingType>([
  'trendLine',
  'ray',
  'extendedLine',
  'horizontalLine',
  'verticalLine',
  'fibRetracement',
  'rectangle',
  'circle',
  'ellipse',
  'triangle',
  'polygon',
  'path',
  'arrow',
  'text',
  'longPosition',
  'shortPosition',
  'riskReward',
  'measure',
]);

export function isValidDrawing(d: unknown): d is Drawing {
  if (typeof d !== 'object' || d === null) return false;
  const o = d as Partial<Drawing>;
  if (typeof o.id !== 'string' || !o.id) return false;
  if (typeof o.type !== 'string' || !VALID_TYPES.has(o.type as DrawingType)) return false;
  if (!Array.isArray(o.points) || o.points.length === 0) return false;
  if (!o.points.every(isFinitePoint)) return false;
  if (o.style === undefined || typeof o.style !== 'object' || o.style === null) return false;
  return true;
}

/** Migrate a legacy flat drawing ({p0,p1,color,type}) into the new model. */
function migrateLegacy(raw: unknown): Drawing | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as { id?: unknown; type?: unknown; color?: unknown; p0?: unknown; p1?: unknown; time?: unknown; price?: unknown };
  if (typeof o.id !== 'string' || typeof o.type !== 'string') return null;

  const now = Date.now();
  const mk = (p: unknown, time: number, price: number): ChartPoint => {
    const pt = p as { time?: unknown; price?: unknown } | undefined;
    return {
      time: typeof pt?.time === 'number' ? pt.time : time,
      price: typeof pt?.price === 'number' ? pt.price : price,
    };
  };
  const color = typeof o.color === 'string' ? o.color : '#4f8cff';
  const style: DrawingStyle = { ...DEFAULT_STYLE, strokeColor: color, fillColor: color };

  const type = o.type;
  if (type === 'horzLine') {
    const price = typeof o.price === 'number' ? o.price : 0;
    return {
      id: o.id,
      type: 'horizontalLine',
      points: [{ time: 0, price }],
      style,
      visible: true,
      locked: false,
      layerIndex: now,
      createdAt: now,
      updatedAt: now,
    };
  }
  if (type === 'vertLine') {
    const time = typeof o.time === 'number' ? o.time : 0;
    return {
      id: o.id,
      type: 'verticalLine',
      points: [{ time, price: 0 }],
      style,
      visible: true,
      locked: false,
      layerIndex: now,
      createdAt: now,
      updatedAt: now,
    };
  }
  if (o.p0 === undefined || o.p1 === undefined) return null;
  const p0 = mk(o.p0, 0, 0);
  const p1 = mk(o.p1, 0, 0);
  let newType: DrawingType;
  switch (type) {
    case 'trendLine':
    case 'ray':
    case 'rectangle':
    case 'fibRetracement':
      newType = type;
      break;
    default:
      return null;
  }
  return {
    id: o.id,
    type: newType,
    points: [p0, p1],
    style,
    visible: true,
    locked: false,
    layerIndex: now,
    createdAt: now,
    updatedAt: now,
    extend: type === 'ray' ? { start: false, end: true } : undefined,
  };
}

export class DrawingSerializer {
  private readonly key: string;

  constructor(key: string) {
    this.key = key;
  }

  getKey(): string {
    return this.key;
  }

  save(state: SerializedState): void {
    try {
      const payload: SerializedState = {
        version: VERSION,
        drawings: state.drawings.map(cloneDrawing),
        magnetMode: state.magnetMode,
        style: { ...state.style },
      };
      localStorage.setItem(this.key, JSON.stringify(payload));
    } catch {
      // storage may be unavailable (private mode / quota)
    }
  }

  load(): SerializedState | null {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      return this.normalize(parsed);
    } catch {
      return null;
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(this.key);
    } catch {
      // ignore
    }
  }

  private normalize(parsed: unknown): SerializedState | null {
    if (Array.isArray(parsed)) {
      // Legacy: bare array of old-style drawings.
      const migrated: Drawing[] = [];
      let fallbackIndex = 0;
      for (const item of parsed) {
        const d = isValidDrawing(item) ? (item as Drawing) : migrateLegacy(item);
        if (d) {
          migrated.push(d);
        } else {
          fallbackIndex++;
        }
      }
      if (migrated.length === 0 && fallbackIndex === 0) return null;
      return {
        version: VERSION,
        drawings: migrated,
        magnetMode: 'weak',
        style: { ...DEFAULT_STYLE },
      };
    }
    if (typeof parsed !== 'object' || parsed === null) return null;
    const o = parsed as { version?: unknown; drawings?: unknown; magnetMode?: unknown; style?: unknown };
    if (o.version !== VERSION && o.version !== undefined) return null;
    const drawings = Array.isArray(o.drawings)
      ? (o.drawings.filter(isValidDrawing) as Drawing[])
      : [];
    const magnetMode = o.magnetMode === 'off' || o.magnetMode === 'strong' ? o.magnetMode : 'weak';
    const style =
      o.style && typeof o.style === 'object' && o.style !== null
        ? ({ ...DEFAULT_STYLE, ...(o.style as Partial<DrawingStyle>) } as DrawingStyle)
        : { ...DEFAULT_STYLE };
    return { version: VERSION, drawings, magnetMode, style };
  }
}

/** Resolve the candle nearest a time — used by tests / consumers. */
export function nearestCandleIndex(candles: Candle[], time: number): number {
  const n = candles.length;
  if (n === 0) return -1;
  const first = candles[0];
  if (first && time <= first.time) return 0;
  const last = candles[n - 1];
  if (last && time >= last.time) return n - 1;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const c = candles[mid];
    if (!c) break;
    if (c.time <= time) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
