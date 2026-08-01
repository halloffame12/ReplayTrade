import type { Candle } from './market';

export type ReplayMode =
  | 'idle'
  | 'selecting'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'completed';

export interface ReplayState {
  mode: ReplayMode;
  candles: Candle[];
  /** Absolute index of the candle the replay begins at. */
  replayStartIndex: number | null;
  /** The candle currently shown on the chart (view position). */
  currentReplayIndex: number;
  /** The furthest candle ever revealed. Never shrinks. */
  maxRevealedIndex: number;
  /** First candle rendered on the chart (start of visible history window). */
  visibleStartIndex: number;
  speed: number;
  isPlaying: boolean;
}

export interface ReplayControls {
  state: ReplayState;
  enterReplayMode: () => void;
  cancelSelecting: () => void;
  confirmStart: (index: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  nextCandle: () => void;
  previousCandle: () => void;
  skipForward: (count: number) => void;
  resetReplay: () => void;
  exitReplay: () => void;
  setSpeed: (speed: number) => void;
  jumpToLive: () => void;
}
