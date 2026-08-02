import type { Candle } from '../types/market';
import type { ReplayMode, ReplayState } from '../types/replay';

export const VISIBLE_HISTORY_COUNT = 200;

export const REPLAY_SPEEDS = [0.25, 0.5, 1, 2, 5, 10] as const;

export const REPLAY_INTERVALS_MS: Record<number, number> = {
  0.25: 2000,
  0.5: 1000,
  1: 500,
  2: 250,
  5: 100,
  10: 50,
};

/** Candle window of history shown before the replay start. */
export function computeVisibleStartIndex(replayStartIndex: number): number {
  return Math.max(0, replayStartIndex - VISIBLE_HISTORY_COUNT);
}

export function createReplayState(candles: Candle[]): ReplayState {
  return {
    mode: 'idle',
    candles,
    replayStartIndex: null,
    currentReplayIndex: 0,
    maxRevealedIndex: 0,
    visibleStartIndex: 0,
    speed: 1,
    isPlaying: false,
  };
}

function reachEnd(state: ReplayState): ReplayState {
  return {
    ...state,
    mode: 'completed',
    isPlaying: false,
    currentReplayIndex: state.candles.length - 1,
    maxRevealedIndex: state.candles.length - 1,
  };
}

/** Reveal exactly one more candle (or finish). */
export function advanceReplay(state: ReplayState): ReplayState {
  if (state.candles.length === 0) return state;
  if (state.currentReplayIndex >= state.candles.length - 1) return reachEnd(state);
  const next = state.currentReplayIndex + 1;
  const finished = next >= state.candles.length - 1;
  return {
    ...state,
    currentReplayIndex: next,
    maxRevealedIndex: Math.max(state.maxRevealedIndex, next),
    mode: finished ? 'completed' : state.mode,
    isPlaying: finished ? false : state.isPlaying,
  };
}

/** Move the view backward, but never before the visible history window. */
export function stepBackReplay(state: ReplayState): ReplayState {
  if (state.currentReplayIndex <= state.visibleStartIndex) return state;
  return { ...state, currentReplayIndex: state.currentReplayIndex - 1 };
}

/** Skip backward `count` candles (clamped to the visible history window). */
export function skipBackwardReplay(state: ReplayState, count: number): ReplayState {
  const target = Math.max(state.visibleStartIndex, state.currentReplayIndex - count);
  if (target === state.currentReplayIndex) return state;
  return { ...state, currentReplayIndex: target };
}

/** Skip forward `count` candles (clamped to the final candle). */
export function skipForwardReplay(state: ReplayState, count: number): ReplayState {
  const target = Math.min(state.candles.length - 1, state.currentReplayIndex + count);
  const finished = target >= state.candles.length - 1;
  const next = { ...state, currentReplayIndex: target };
  next.maxRevealedIndex = Math.max(state.maxRevealedIndex, target);
  if (finished) {
    next.mode = 'completed';
    next.isPlaying = false;
  }
  return next;
}

export function playReplay(state: ReplayState): ReplayState {
  if (state.candles.length === 0) return state;
  if (state.currentReplayIndex >= state.candles.length - 1) return reachEnd(state);
  return { ...state, isPlaying: true, mode: 'playing' as ReplayMode };
}

export function pauseReplay(state: ReplayState): ReplayState {
  return { ...state, isPlaying: false, mode: state.mode === 'playing' ? 'paused' : state.mode };
}

export function resetReplay(state: ReplayState): ReplayState {
  const start = state.replayStartIndex ?? 0;
  return {
    ...state,
    mode: 'ready',
    isPlaying: false,
    currentReplayIndex: start,
    maxRevealedIndex: start,
    visibleStartIndex: computeVisibleStartIndex(start),
  };
}

export function exitReplay(state: ReplayState): ReplayState {
  return { ...state, mode: 'idle', isPlaying: false, replayStartIndex: null };
}

/** Move the view to the furthest revealed candle. */
export function jumpToLiveReplay(state: ReplayState): ReplayState {
  return { ...state, currentReplayIndex: state.maxRevealedIndex };
}
